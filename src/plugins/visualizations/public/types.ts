/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import {
  ExpressionAstExpression,
  ExpressionFunctionDefinition,
  VisConfig,
} from 'src/plugins/expressions';
import { SavedObject } from '../../saved_objects/public';
import {
  AggConfigOptions,
  SearchSourceFields,
  TimefilterContract,
} from '../../../plugins/data/public';
import { SerializedVis, Vis, VisParams } from './vis';
import { ExprVis } from './expressions/vis';

export { Vis, SerializedVis, VisParams };

export interface VisualizationController {
  render(visData: any, visParams: any): Promise<void>;
  destroy(): void;
  isLoaded?(): Promise<void> | void;
}

export type VisualizationControllerConstructor = new (
  el: HTMLElement,
  vis: ExprVis
) => VisualizationController;

export interface SavedVisState {
  title: string;
  type: string;
  params: VisParams;
  aggs: AggConfigOptions[];
}

export interface ISavedVis {
  id?: string;
  title: string;
  description?: string;
  visState: SavedVisState;
  searchSourceFields?: SearchSourceFields;
  uiStateJSON?: string;
  savedSearchRefName?: string;
  savedSearchId?: string;
}

export interface VisSavedObject extends SavedObject, ISavedVis {}

export interface VisResponseValue {
  visType: string;
  visData: object;
  visConfig: object;
  params?: object;
}

export interface VisToExpressionAstParams {
  timefilter: TimefilterContract;
  timeRange?: any;
  abortSignal?: AbortSignal;
  augmentVisFields?: AugmentVisFields;
}

export type VisToExpressionAst<TVisParams = VisParams> = (
  vis: Vis<TVisParams>,
  params: VisToExpressionAstParams
) => ExpressionAstExpression;

export type FeatureAnywhereSavedObject = {
  expressionFnName: string;
  expressionFnArgs: { [x: string]: any };
  // visId may be removed. using temporarily to associate a
  // feature anywhere saved object to a particular vis
  visId?: string;
};

export type FeatureAnywhereFunctionDefinition = ExpressionFunctionDefinition<
  string,
  VisConfig,
  any,
  Promise<VisConfig>
>;

export type Annotation = {
  name: string;
  timestamps: number[];
};

// We keep a generic interface in case of further types of augmentation is introduced
// (e.g., a new dimension, augmenting existing dimensions or data points, etc.)
export interface AugmentVisFields {
  annotations?: Annotation[];
}
