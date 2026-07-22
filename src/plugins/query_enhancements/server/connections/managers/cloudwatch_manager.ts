/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  HttpResponsePayload,
  Logger,
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
} from 'src/core/server';
import { BaseConnectionManager } from './base_connection_manager';
import { RESOURCE_TYPES } from '../../../common/constants';
import { ResourcesRequest } from '../../routes/resources/routes';
import { describeLogGroups, describeLogStreams } from '../clients/cloudwatch_logs_client';

/**
 * Connection manager for the CloudWatch proof-of-concept. Serves the resource
 * requests behind the log-group / log-stream dropdowns in the search bar.
 *
 * Unlike the Prometheus manager (which proxies through OpenSearch), this talks to
 * AWS CloudWatch directly via the AWS SDK using credentials from the server env.
 */
export class CloudWatchManager extends BaseConnectionManager {
  private logger?: Logger;

  public setLogger(logger: Logger) {
    this.logger = logger;
  }

  async handlePostRequest(
    _context: RequestHandlerContext,
    request: OpenSearchDashboardsRequest
  ): Promise<HttpResponsePayload> {
    const { resource, content } = (
      request as ResourcesRequest<{
        logGroupName?: string;
        prefix?: string;
        // Region chosen in the UI; scopes which region's CloudWatch is queried.
        region?: string;
      }>
    ).body;

    const region = content?.region;

    switch (resource.type) {
      case RESOURCE_TYPES.CLOUDWATCH.LOG_GROUPS: {
        const groups = await describeLogGroups(content?.prefix, this.logger, region);
        // Return plain names for the dropdown; the resource route wraps this as { data }.
        return { data: groups.map((g) => g.name) } as HttpResponsePayload;
      }
      case RESOURCE_TYPES.CLOUDWATCH.LOG_STREAMS: {
        // resource.name carries the log group; content.prefix filters streams.
        const logGroupName = resource.name || content?.logGroupName;
        if (!logGroupName) {
          throw new Error('A log group name is required to list log streams');
        }
        const streams = await describeLogStreams(
          logGroupName,
          content?.prefix,
          this.logger,
          region
        );
        return { data: streams.map((s) => s.name) } as HttpResponsePayload;
      }
      default:
        throw new Error(`Unsupported CloudWatch resource type: ${resource.type}`);
    }
  }
}

// export as singleton, mirroring prometheusManager
export const cloudwatchManager = new CloudWatchManager();
