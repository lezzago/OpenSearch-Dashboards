/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export const PLUGIN_ID = 'queryEnhancements';
export const PLUGIN_NAME = 'queryEnhancements';

export const BASE_API = '/api/enhancements';
export const BASE_API_ASSISTANT = '/api/assistant';

export const DATASET = {
  S3: 'S3',
  PROMETHEUS: 'PROMETHEUS',
  CLOUDWATCH: 'CLOUDWATCH',
};

export const SEARCH_STRATEGY = {
  PPL: 'ppl',
  PPL_RAW: 'pplraw',
  PROMQL: 'promql',
  SQL: 'sql',
  SQL_ASYNC: 'sqlasync',
  PPL_ASYNC: 'pplasync',
  CLOUDWATCH_LOGS: 'cloudwatchlogs',
};

/**
 * The CloudWatch language shown in the language selector. Querying with this
 * language runs a CloudWatch Logs Insights query against the log group(s)/stream(s)
 * chosen next to the dataset selector.
 */
export const CLOUDWATCH_LANGUAGE = 'CloudWatch Logs Insights';

/**
 * Hardcoded connection for the CloudWatch proof-of-concept. The dataset is virtual
 * (not backed by a saved object); it always points at this account/region and reads
 * read-only credentials from the server environment. See server/connections/clients/cloudwatch_logs_client.ts.
 */
export const CLOUDWATCH_POC = {
  CONNECTION_ID: 'cloudwatch-poc',
  CONNECTION_TITLE: 'CloudWatch (245861583765)',
  ACCOUNT_ID: '245861583765',
  DEFAULT_REGION: 'us-east-1',
};

/**
 * Common AWS regions offered by the CloudWatch region selector. The region is chosen
 * in the search bar, stored on the dataset (dataSource.meta.region), and threaded to
 * the server, which builds a per-region CloudWatch Logs client.
 */
export const CLOUDWATCH_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
];

export const API = {
  SEARCH: `${BASE_API}/search`,
  PPL_SEARCH: `${BASE_API}/search/${SEARCH_STRATEGY.PPL}`,
  PROMQL_SEARCH: `${BASE_API}/search/${SEARCH_STRATEGY.PROMQL}`,
  SQL_SEARCH: `${BASE_API}/search/${SEARCH_STRATEGY.SQL}`,
  SQL_ASYNC_SEARCH: `${BASE_API}/search/${SEARCH_STRATEGY.SQL_ASYNC}`,
  PPL_ASYNC_SEARCH: `${BASE_API}/search/${SEARCH_STRATEGY.PPL_ASYNC}`,
  CLOUDWATCH_LOGS_SEARCH: `${BASE_API}/search/${SEARCH_STRATEGY.CLOUDWATCH_LOGS}`,
  QUERY_ASSIST: {
    LANGUAGES: `${BASE_API}/assist/languages`,
    GENERATE: `${BASE_API}/assist/generate`,
  },
  DATA_SOURCE: {
    ASYNC_JOBS: `${BASE_API}/jobs`,
    CONNECTIONS: `${BASE_API}/connections`,
    REMOTE_CLUSTER: {
      LIST: `${BASE_API}/remote_cluster/list`,
      INDEXES: `${BASE_API}/remote_cluster/indexes`,
    },
  },
  PPL_CANCEL: `${BASE_API}/ppl/cancel`,
  PPL_GRAMMAR: `${BASE_API}/ppl/grammar`,
  PPL_CALCITE_SETTINGS: `${BASE_API}/ppl/calcite_settings`,
  PPL_EXPLAIN: `${BASE_API}/ppl/explain`,
  AGENT_API: {
    CONFIG_EXISTS: `${BASE_API_ASSISTANT}/agent_config/_exists`,
  },
};

export const URI = {
  PPL: '/_plugins/_ppl',
  SQL: '/_plugins/_sql',
  // Open Distro endpoints used for legacy Elasticsearch data sources (SQL/PPL live here on ES
  // domains that support them) when legacyElasticsearchCompatibility is enabled.
  PPL_OPENDISTRO: '/_opendistro/_ppl',
  SQL_OPENDISTRO: '/_opendistro/_sql',
  ASYNC_QUERY: '/_plugins/_async_query',
  DIRECT_QUERY: {
    QUERY: '/_plugins/_directquery/_query',
    RESOURCES: '/_plugins/_directquery/_resources',
  },
  ML: '/_plugins/_ml',
  OBSERVABILITY: '/_plugins/_observability',
  DATA_CONNECTIONS: '/_plugins/_query/_datasources',
  PPL_BUNDLE: '/_plugins/_ppl/_grammar',
};

export const OPENSEARCH_API = {
  PANELS: `${URI.OBSERVABILITY}/object`,
  DATA_CONNECTIONS: URI.DATA_CONNECTIONS,
};

export const UI_SETTINGS = {
  QUERY_ENHANCEMENTS_ENABLED: 'query:enhancements:enabled',
  STATE_STORE_IN_SESSION_STORAGE: 'state:storeInSessionStorage',
};

export const ERROR_DETAILS = { GUARDRAILS_TRIGGERED: 'guardrails triggered' };

export const S3_PARTITION_INFO_COLUMN = '# Partition Information';

export const RESOURCE_TYPES = {
  PROMETHEUS: {
    LABELS: 'labels',
    LABEL_VALUES: 'label_values',
    METRICS: 'metrics',
    METRIC_METADATA: 'metric_metadata',
    SERIES: 'series',
    ALERTS: 'alerts',
    ALERTS_GROUPS: 'alert_manager_alert_groups',
    RULES: 'rules',
  },
  CLOUDWATCH: {
    LOG_GROUPS: 'log_groups',
    LOG_STREAMS: 'log_streams',
  },
} as const;
