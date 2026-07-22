/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { trimEnd } from 'lodash';
import {
  DataPublicPluginStart,
  IOpenSearchDashboardsSearchRequest,
  ISearchOptions,
  SearchInterceptor,
  SearchInterceptorDeps,
} from '../../../data/public';
import { API, EnhancedFetchContext, fetch, SEARCH_STRATEGY } from '../../common';
import { QueryEnhancementsPluginStartDependencies } from '../types';

/**
 * Search interceptor for the CloudWatch Logs Insights language. Routes the query
 * to the CLOUDWATCH_LOGS server strategy and forwards the global time range. The
 * selected log groups / streams travel on the query's dataset meta.
 */
export class CloudWatchLogsSearchInterceptor extends SearchInterceptor {
  protected queryService!: DataPublicPluginStart['query'];

  constructor(deps: SearchInterceptorDeps) {
    super(deps);

    deps.startServices.then(([_coreStart, depsStart]) => {
      this.queryService = (depsStart as QueryEnhancementsPluginStartDependencies).data.query;
    });
  }

  public search(request: IOpenSearchDashboardsSearchRequest, options: ISearchOptions) {
    const context: EnhancedFetchContext = {
      http: this.deps.http,
      path: trimEnd(`${API.SEARCH}/${SEARCH_STRATEGY.CLOUDWATCH_LOGS}`),
      signal: options.abortSignal,
      body: {
        timeRange: this.queryService.timefilter.timefilter.getTime(),
      },
    };

    const query = this.queryService.queryString.getQuery();
    return fetch(context, query);
  }
}
