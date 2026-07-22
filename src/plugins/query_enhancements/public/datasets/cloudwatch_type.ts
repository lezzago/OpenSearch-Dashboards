/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CORE_SIGNAL_TYPES,
  DATA_STRUCTURE_META_TYPES,
  DataStructure,
  Dataset,
  DatasetField,
} from '../../../data/common';
import { DatasetTypeConfig } from '../../../data/public';
import { CLOUDWATCH_LANGUAGE, CLOUDWATCH_POC, DATASET, SEARCH_STRATEGY } from '../../common';
import { CloudWatchLogGroupSelector } from './cloudwatch_log_group_selector';

// Wildcard pattern that matches every log group in the account. Used by the hardcoded
// "all log groups" dataset so no group enumeration is needed when it is selected; the
// server resolves it to concrete group names at query time.
const ALL_LOG_GROUPS_PATTERN = '*';

// Stable id/title for the hardcoded, always-available "all log groups" CloudWatch dataset
// that shows up directly in the dataset picker (no advanced "Create dataset" flow needed).
// Titled just "CloudWatch (<account>)" — the "all log groups" scope is conveyed by the
// search-bar chips, not the dataset name.
const ALL_LOG_GROUPS_ID = `${CLOUDWATCH_POC.CONNECTION_ID}::all`;
const ALL_LOG_GROUPS_TITLE = CLOUDWATCH_POC.CONNECTION_TITLE;

/**
 * Virtual, hardcoded CloudWatch dataset for the proof-of-concept.
 *
 * Selecting CloudWatch in the dataset picker's advanced ("Create dataset") flow opens
 * a log-group selector (see cloudwatch_log_group_selector.tsx) where the user multi-selects
 * log groups and/or types wildcard patterns. Those log groups become part of the dataset
 * (stored on dataSource.meta), and querying runs a CloudWatch Logs Insights query
 * server-side via the CLOUDWATCH_LOGS search strategy.
 */
export const cloudwatchTypeConfig: DatasetTypeConfig = {
  id: DATASET.CLOUDWATCH,
  title: 'CloudWatch',
  meta: {
    icon: { type: 'logsApp' },
    tooltip: `Amazon CloudWatch (${CLOUDWATCH_POC.ACCOUNT_ID})`,
    // Insights sets its own time window from the global time picker; keep the
    // time filter available so the range flows through to StartQuery.
    supportsTimeFilter: true,
    // Show in both the classic-Discover-forwarded Logs flavor and Explore.
    supportedAppNames: ['explore', 'discover', 'data-explorer'],
  },

  toDataset: (path: DataStructure[]): Dataset => {
    // The last path item is the combined structure produced by the log-group selector,
    // carrying the chosen log groups / wildcard patterns on its meta.
    const selection = path[path.length - 1];
    const meta = (selection?.meta ?? {}) as {
      logGroups?: string[];
      logGroupPatterns?: string[];
      logStreams?: string[];
      region?: string;
    };
    const logGroups = Array.isArray(meta.logGroups) ? meta.logGroups : [];
    const logGroupPatterns = Array.isArray(meta.logGroupPatterns) ? meta.logGroupPatterns : [];
    const logStreams = Array.isArray(meta.logStreams) ? meta.logStreams : [];
    const region =
      typeof meta.region === 'string' && meta.region ? meta.region : CLOUDWATCH_POC.DEFAULT_REGION;

    // The "all log groups" case is the hardcoded default: the only pattern is the
    // catch-all "*". Give it a friendly title instead of "CloudWatch: *".
    const isAllLogGroups =
      logGroups.length === 0 &&
      logGroupPatterns.length === 1 &&
      logGroupPatterns[0] === ALL_LOG_GROUPS_PATTERN;

    const titleParts = [...logGroups, ...logGroupPatterns];
    const title = isAllLogGroups
      ? ALL_LOG_GROUPS_TITLE
      : titleParts.length
        ? `CloudWatch: ${titleParts.join(', ')}`
        : CLOUDWATCH_POC.CONNECTION_TITLE;

    return {
      // Include the selection in the id so different log-group sets are distinct datasets.
      id: selection?.id ?? CLOUDWATCH_POC.CONNECTION_ID,
      title,
      type: DATASET.CLOUDWATCH,
      language: CLOUDWATCH_LANGUAGE,
      timeFieldName: '@timestamp',
      signalType: CORE_SIGNAL_TYPES.LOGS,
      dataSource: {
        id: CLOUDWATCH_POC.CONNECTION_ID,
        title: CLOUDWATCH_POC.CONNECTION_TITLE,
        type: DATASET.CLOUDWATCH,
        version: '',
        // The log-group selection is part of the dataset; the CloudWatch search
        // strategy reads it back from here on the server.
        meta: {
          accountId: CLOUDWATCH_POC.ACCOUNT_ID,
          region,
          logGroups,
          logGroupPatterns,
          // Carry log streams through if the picker set them, so they round-trip.
          ...(logStreams.length ? { logStreams } : {}),
        },
      },
    };
  },

  fetch: async (_services, path) => {
    // This fetch result is consumed two ways:
    //   1. The flat dataset picker enumerates `children` and calls toDataset() per child
    //      (see data/public/ui/dataset_select/dataset_select.tsx). We expose ONE hardcoded
    //      child here — the "all log groups" dataset — so it appears directly in the picker.
    //   2. The advanced "Create dataset" flow renders `DataStructureCreator` (the multi-select
    //      + wildcard log-group selector), which takes precedence over `children` there
    //      (see data/public/ui/dataset_selector/dataset_explorer.tsx).
    const dataStructure = path[path.length - 1];

    // Hardcoded "all log groups" child: no concrete groups, just the catch-all "*" pattern,
    // which the server resolves to every group at query time.
    const allLogGroupsChild: DataStructure = {
      id: ALL_LOG_GROUPS_ID,
      title: ALL_LOG_GROUPS_TITLE,
      type: DATASET.CLOUDWATCH,
      meta: {
        type: DATA_STRUCTURE_META_TYPES.CUSTOM,
        accountId: CLOUDWATCH_POC.ACCOUNT_ID,
        region: CLOUDWATCH_POC.DEFAULT_REGION,
        logGroups: [],
        logGroupPatterns: [ALL_LOG_GROUPS_PATTERN],
      } as DataStructure['meta'],
    };

    return {
      ...dataStructure,
      columnHeader: 'Log groups',
      hasNext: false,
      DataStructureCreator: CloudWatchLogGroupSelector,
      children: [allLogGroupsChild],
    };
  },

  fetchFields: async (): Promise<DatasetField[]> => {
    // CloudWatch Logs Insights returns dynamic fields; expose the common system
    // fields so the discover table/timeline have something to work with.
    return [
      { name: '@timestamp', type: 'date' },
      { name: '@message', type: 'string' },
      { name: '@logStream', type: 'string' },
      { name: '@log', type: 'string' },
    ];
  },

  supportedLanguages: (): string[] => {
    return [CLOUDWATCH_LANGUAGE];
  },

  getSearchOptions: () => {
    return { strategy: SEARCH_STRATEGY.CLOUDWATCH_LOGS };
  },
};
