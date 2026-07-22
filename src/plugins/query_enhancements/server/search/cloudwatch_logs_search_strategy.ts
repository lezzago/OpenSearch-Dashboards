/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { Logger } from 'opensearch-dashboards/server';
import dateMath from '@elastic/datemath';
import { ISearchStrategy, SearchUsage } from '../../../data/server';
import {
  createDataFrame,
  DATA_FRAME_TYPES,
  IDataFrameResponse,
  IOpenSearchDashboardsSearchRequest,
  Query,
  PartialDataFrame,
} from '../../../data/common';
import {
  getCloudWatchRegion,
  resolveLogGroupPatterns,
  runInsightsQuery,
} from '../connections/clients/cloudwatch_logs_client';

// CloudWatch Logs Insights StartQuery accepts at most 50 log groups.
const MAX_LOG_GROUPS = 50;

const DEFAULT_INSIGHTS_QUERY =
  'fields @timestamp, @message, @logStream | sort @timestamp desc | limit 1000';

/**
 * Parses an OSD time value (absolute ISO string or relative like "now-15m") into
 * epoch seconds, as required by the CloudWatch Logs Insights StartQuery API.
 */
const parseTimeToEpochSeconds = (
  value: string | undefined,
  fallback: number,
  options?: Parameters<typeof dateMath.parse>[1]
): number => {
  if (!value) return fallback;
  const parsed = dateMath.parse(value, options);
  return parsed ? parsed.unix() : fallback;
};

/**
 * Reads the log-group selection that is part of the CloudWatch dataset. Log groups
 * are chosen in the dataset picker and stored on dataSource.meta as an explicit list
 * (`logGroups`) plus any wildcard patterns (`logGroupPatterns`). Kept defensive because
 * the dataset shape is loosely typed across the query pipeline.
 */
const getCloudWatchSelection = (
  dataset: Query['dataset']
): {
  logGroups: string[];
  logGroupPatterns: string[];
  logStreams: string[];
  region?: string;
} => {
  const meta = (dataset?.dataSource?.meta ?? {}) as {
    logGroups?: string[];
    logGroupPatterns?: string[];
    logStreams?: string[];
    region?: string;
  };
  return {
    logGroups: Array.isArray(meta.logGroups) ? meta.logGroups.filter(Boolean) : [],
    logGroupPatterns: Array.isArray(meta.logGroupPatterns)
      ? meta.logGroupPatterns.filter(Boolean)
      : [],
    logStreams: Array.isArray(meta.logStreams) ? meta.logStreams.filter(Boolean) : [],
    region: typeof meta.region === 'string' && meta.region ? meta.region : undefined,
  };
};

/**
 * Restricts an Insights query to a set of log streams by injecting a
 * `filter @logStream in ["a","b"]` clause. CloudWatch Logs Insights requires the
 * `filter` command to come after any leading `fields` command, so the clause is
 * inserted right after a leading `fields ...` command when present, otherwise it is
 * prepended. An empty stream list is a no-op (all streams). The filter is applied
 * best-effort across all selected log groups (Insights has no per-group stream scoping).
 */
const applyStreamFilter = (queryString: string, logStreams: string[]): string => {
  if (!logStreams.length) return queryString;

  const streamList = logStreams.map((s) => `"${s.replace(/"/g, '\\"')}"`).join(', ');
  const filterClause = `filter @logStream in [${streamList}]`;

  const commands = queryString.split('|').map((part) => part.trim());
  if (commands.length && /^fields\b/i.test(commands[0])) {
    // Insert the filter immediately after the leading `fields` command.
    commands.splice(1, 0, filterClause);
    return commands.join(' | ');
  }
  return `${filterClause} | ${queryString}`;
};

export const cloudwatchLogsSearchStrategyProvider = (
  logger: Logger,
  usage?: SearchUsage
): ISearchStrategy<IOpenSearchDashboardsSearchRequest, IDataFrameResponse> => {
  return {
    search: async (context, request: any, _options) => {
      try {
        const { query: rawQuery, timeRange } = request.body;
        const { dataset, query }: Query = rawQuery;

        const { logGroups, logGroupPatterns, logStreams, region } = getCloudWatchSelection(dataset);

        // Resolve any wildcard patterns to concrete log-group names, then combine with
        // the explicitly-selected groups (StartQuery needs exact names).
        const resolved = await resolveLogGroupPatterns(logGroupPatterns, logger, region);
        const allLogGroups = Array.from(new Set([...logGroups, ...resolved]));

        if (!allLogGroups.length) {
          throw new Error(
            logGroupPatterns.length
              ? `No CloudWatch log groups match the selected pattern(s): ${logGroupPatterns.join(
                  ', '
                )}`
              : 'Select at least one CloudWatch log group in the dataset before querying.'
          );
        }

        // StartQuery caps at 50 log groups; cap and warn rather than fail.
        const cappedLogGroups = allLogGroups.slice(0, MAX_LOG_GROUPS);

        const nowSeconds = Math.floor(Date.now() / 1000);
        const startTime = parseTimeToEpochSeconds(
          timeRange?.from,
          nowSeconds - 15 * 60 // default: last 15 minutes
        );
        const endTime = parseTimeToEpochSeconds(timeRange?.to, nowSeconds, { roundUp: true });

        const baseQuery = (query as string)?.trim() || DEFAULT_INSIGHTS_QUERY;
        // Restrict to the selected log streams (best-effort across all groups). Empty = all.
        const insightsQuery = applyStreamFilter(baseQuery, logStreams);

        logger.info(
          `cloudwatchLogsSearchStrategy: querying ${cappedLogGroups.length} log group(s)` +
            ` in ${getCloudWatchRegion(region)}` +
            (allLogGroups.length > MAX_LOG_GROUPS
              ? ` (capped from ${allLogGroups.length}; StartQuery max is ${MAX_LOG_GROUPS})`
              : '') +
            (logGroupPatterns.length ? ` [${logGroupPatterns.length} pattern(s) resolved]` : '') +
            (logStreams.length ? ` [${logStreams.length} stream(s)]` : '')
        );

        const result = await runInsightsQuery(
          {
            queryString: insightsQuery,
            logGroupNames: cappedLogGroups,
            startTime,
            endTime,
          },
          logger,
          region
        );

        const partialDataFrame = buildDataFrame(result.results ?? [], dataset?.id ?? 'cloudwatch');
        // Run through createDataFrame so field types and `size` are populated
        // consistently with the other enhanced search strategies.
        const dataFrame = createDataFrame(partialDataFrame);
        return {
          type: DATA_FRAME_TYPES.DEFAULT,
          body: dataFrame,
        } as IDataFrameResponse;
      } catch (e: unknown) {
        const error = e as Error;
        logger.error(`cloudwatchLogsSearchStrategy: ${error.message}`);
        if (usage) usage.trackError();
        throw e;
      }
    },
  };
};

/**
 * Converts CloudWatch Logs Insights results (row-oriented { field, value } pairs)
 * into a columnar OSD DataFrame.
 */
function buildDataFrame(
  results: Array<Array<{ field?: string; value?: string }>>,
  name: string
): PartialDataFrame {
  // Collect the union of field names across all rows, preserving first-seen order.
  const fieldOrder: string[] = [];
  const seen = new Set<string>();
  const rows: Array<Record<string, string>> = results.map((row) => {
    const record: Record<string, string> = {};
    row.forEach(({ field, value }) => {
      if (!field || field === '@ptr') return; // @ptr is an opaque pointer, not useful in the table
      if (!seen.has(field)) {
        seen.add(field);
        fieldOrder.push(field);
      }
      record[field] = value ?? '';
    });
    return record;
  });

  const isTimeField = (fieldName: string) =>
    fieldName === '@timestamp' || fieldName === '@ingestionTime';

  const fields = fieldOrder.map((fieldName) => ({
    name: fieldName,
    type: isTimeField(fieldName) ? 'date' : 'string',
    values: rows.map((row) => {
      const value = row[fieldName];
      if (value === undefined) return null;
      // CloudWatch returns timestamps as "YYYY-MM-DD HH:mm:ss.SSS" (UTC); normalize
      // to an ISO string the discover table formatter understands.
      if (isTimeField(fieldName) && value) {
        return `${value.replace(' ', 'T')}Z`;
      }
      return value;
    }),
  }));

  // `schema` is the column descriptor list (no values). The Logs tab renders from
  // `fields`, but the Statistics and Visualization tabs read `dataFrame.schema`
  // (surfaced as results.fieldSchema), so both must be provided.
  const schema = fieldOrder.map((fieldName) => ({
    name: fieldName,
    type: isTimeField(fieldName) ? 'date' : 'string',
  }));

  return {
    name,
    schema,
    fields,
  } as PartialDataFrame;
}
