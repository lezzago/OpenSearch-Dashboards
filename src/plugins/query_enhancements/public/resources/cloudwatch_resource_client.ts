/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { HttpSetup } from 'opensearch-dashboards/public';
import { BaseResourceClient } from '../../../data/public';
import { DATASET, RESOURCE_TYPES } from '../../common/constants';

/**
 * Client for the CloudWatch log-group / log-stream dropdowns. Posts to the shared
 * /api/enhancements/resources route, which dispatches to the CloudWatch manager
 * by connection type.
 */
export class CloudWatchResourceClient extends BaseResourceClient {
  constructor(http: HttpSetup) {
    // Connection type must match the resourceManagerService registration key ('CLOUDWATCH').
    super(http, DATASET.CLOUDWATCH);
  }

  getLogGroups(dataConnectionId: string, prefix?: string): Promise<string[]> {
    return this.get<string[]>(
      dataConnectionId,
      RESOURCE_TYPES.CLOUDWATCH.LOG_GROUPS,
      undefined,
      prefix ? { prefix } : undefined
    );
  }

  getLogStreams(
    dataConnectionId: string,
    logGroupName: string,
    prefix?: string
  ): Promise<string[]> {
    return this.get<string[]>(
      dataConnectionId,
      RESOURCE_TYPES.CLOUDWATCH.LOG_STREAMS,
      logGroupName,
      prefix ? { prefix } : undefined
    );
  }
}
