/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  GetQueryResultsCommand,
  GetQueryResultsCommandOutput,
  StartQueryCommand,
} from '@aws-sdk/client-cloudwatch-logs';
import { Logger } from 'opensearch-dashboards/server';
import { CLOUDWATCH_POC } from '../../../common';

/**
 * Read-only AWS credentials for the CloudWatch proof-of-concept.
 *
 * SECURITY: credentials are read from the server process environment and are
 * never persisted or committed. Supply them (temporary STS session tokens) via
 * the environment, e.g. through the gitignored scripts/start-dev.sh:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN
 * The target account (CLOUDWATCH_POC.ACCOUNT_ID) is hardcoded for the PoC. The region
 * is chosen in the UI and threaded through per call; absent that it falls back to the
 * server env (AWS_REGION / AWS_DEFAULT_REGION) then the PoC default.
 */
const getCredentialsFromEnv = () => {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  if (!accessKeyId || !secretAccessKey) {
    return undefined;
  }

  return { accessKeyId, secretAccessKey, sessionToken };
};

/**
 * Resolves the effective region: an explicit region (chosen in the UI and threaded
 * through) wins, otherwise fall back to the server env, otherwise the PoC default.
 */
export const getCloudWatchRegion = (region?: string): string =>
  region ||
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  CLOUDWATCH_POC.DEFAULT_REGION;

/**
 * Lazily-instantiated CloudWatch Logs clients, cached per region. Credentials are
 * resolved on first use so the plugin can start even when they are absent (the user
 * only hits an error once they actually query CloudWatch). Log groups are region-scoped,
 * so callers pass the dataset's region through to target the right region.
 */
const clientsByRegion: Map<string, CloudWatchLogsClient> = new Map();

export const getCloudWatchLogsClient = (region?: string, logger?: Logger): CloudWatchLogsClient => {
  const effectiveRegion = getCloudWatchRegion(region);
  const existing = clientsByRegion.get(effectiveRegion);
  if (existing) return existing;

  const credentials = getCredentialsFromEnv();
  if (!credentials) {
    throw new Error(
      'CloudWatch credentials not found. Set AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY and ' +
        'AWS_SESSION_TOKEN in the OSD server environment (see scripts/start-dev.sh).'
    );
  }

  logger?.info(
    `cloudwatch: creating CloudWatch Logs client for account ${CLOUDWATCH_POC.ACCOUNT_ID} in ${effectiveRegion}`
  );

  const client = new CloudWatchLogsClient({ region: effectiveRegion, credentials });
  clientsByRegion.set(effectiveRegion, client);
  return client;
};

export interface LogGroupSummary {
  name: string;
  arn?: string;
  storedBytes?: number;
}

export interface LogStreamSummary {
  name: string;
  lastEventTimestamp?: number;
}

/**
 * Lists log groups in the account, optionally filtered by a name prefix.
 */
export const describeLogGroups = async (
  prefix?: string,
  logger?: Logger,
  region?: string
): Promise<LogGroupSummary[]> => {
  const client = getCloudWatchLogsClient(region, logger);
  const results: LogGroupSummary[] = [];
  let nextToken: string | undefined;

  // Cap pagination for the PoC to keep the dropdown responsive.
  const MAX_PAGES = 5;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await client.send(
      new DescribeLogGroupsCommand({
        logGroupNamePrefix: prefix || undefined,
        limit: 50,
        nextToken,
      })
    );
    (response.logGroups ?? []).forEach((group) => {
      if (group.logGroupName) {
        results.push({
          name: group.logGroupName,
          arn: group.arn,
          storedBytes: group.storedBytes,
        });
      }
    });
    nextToken = response.nextToken;
    if (!nextToken) break;
  }

  return results;
};

/**
 * Converts a log-group wildcard pattern (e.g. "/aws/lambda/*") into a RegExp.
 * Only "*" is treated as a wildcard (matches any run of characters); all other
 * regex metacharacters are escaped so literal names like "/aws/…" match exactly.
 */
const wildcardToRegExp = (pattern: string): RegExp => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

/**
 * Resolves one or more log-group wildcard patterns to concrete log-group names.
 * CloudWatch Logs Insights StartQuery only accepts exact log-group names, so patterns
 * must be expanded before querying. Returns a de-duplicated list of matching names.
 */
export const resolveLogGroupPatterns = async (
  patterns: string[],
  logger?: Logger,
  region?: string
): Promise<string[]> => {
  if (!patterns.length) return [];

  // Use each pattern's leading literal segment (text before the first "*") as a
  // server-side prefix filter to limit how many groups we page through, then match
  // the full pattern client-side.
  const matched = new Set<string>();
  for (const pattern of patterns) {
    const prefix = pattern.split('*')[0] || undefined;
    const regex = wildcardToRegExp(pattern);
    const groups = await describeLogGroups(prefix, logger, region);
    groups.forEach((g) => {
      if (regex.test(g.name)) matched.add(g.name);
    });
  }
  return Array.from(matched);
};

/**
 * Lists log streams for a given log group, most-recently-active first.
 */
export const describeLogStreams = async (
  logGroupName: string,
  prefix?: string,
  logger?: Logger,
  region?: string
): Promise<LogStreamSummary[]> => {
  const client = getCloudWatchLogsClient(region, logger);
  const response = await client.send(
    new DescribeLogStreamsCommand({
      logGroupName,
      logStreamNamePrefix: prefix || undefined,
      // orderBy LastEventTime cannot be combined with a prefix, so only order
      // when no prefix is supplied.
      ...(prefix ? {} : { orderBy: 'LastEventTime', descending: true }),
      limit: 50,
    })
  );

  return (response.logStreams ?? [])
    .filter((stream) => !!stream.logStreamName)
    .map((stream) => ({
      name: stream.logStreamName as string,
      lastEventTimestamp: stream.lastEventTimestamp,
    }));
};

export interface InsightsQueryParams {
  /** CloudWatch Logs Insights query string. */
  queryString: string;
  logGroupNames: string[];
  startTime: number; // epoch seconds
  endTime: number; // epoch seconds
  limit?: number;
}

/**
 * Runs a CloudWatch Logs Insights query end-to-end: StartQuery then polls
 * GetQueryResults until the query completes. Returns the raw Insights results
 * (an array of rows, each row an array of { field, value } pairs).
 */
export const runInsightsQuery = async (
  params: InsightsQueryParams,
  logger?: Logger,
  region?: string
): Promise<GetQueryResultsCommandOutput> => {
  const client = getCloudWatchLogsClient(region, logger);

  const startResponse = await client.send(
    new StartQueryCommand({
      queryString: params.queryString,
      logGroupNames: params.logGroupNames,
      startTime: params.startTime,
      endTime: params.endTime,
      limit: params.limit ?? 1000,
    })
  );

  const queryId = startResponse.queryId;
  if (!queryId) {
    throw new Error('CloudWatch StartQuery did not return a queryId');
  }

  // Poll GetQueryResults. Insights queries are asynchronous; for the PoC we poll
  // server-side (bounded) and return the final results synchronously to the UI.
  const POLL_INTERVAL_MS = 1000;
  const MAX_POLLS = 60; // ~60s ceiling
  for (let i = 0; i < MAX_POLLS; i++) {
    const result = await client.send(new GetQueryResultsCommand({ queryId }));
    const status = result.status;
    if (
      status === 'Complete' ||
      status === 'Failed' ||
      status === 'Cancelled' ||
      status === 'Timeout'
    ) {
      if (status !== 'Complete') {
        throw new Error(`CloudWatch Logs Insights query ${status}`);
      }
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error('CloudWatch Logs Insights query timed out while polling for results');
};
