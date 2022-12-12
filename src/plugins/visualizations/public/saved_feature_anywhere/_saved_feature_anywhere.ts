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

/**
 * @name SavedFeatureAnywhere
 *
 * @extends SavedObject.
 *
 * NOTE: It's a type of SavedObject, but specific to feature anywhere.
 */
import { get } from 'lodash';
import {
  createSavedObjectClass,
  SavedObject,
  SavedObjectOpenSearchDashboardsServices,
} from '../../../saved_objects/public';
import { IIndexPattern } from '../../../../plugins/data/public';
import { ISavedFeatureAnywhere, SerializedFeatureAnywhere } from '../types';
import { extractReferences, injectReferences } from './saved_feature_anywhere_references';

// // converting from obj to serialized (string)
// export const convertToSerializedFeatureAnywhere = (
//   savedFeatureAnywhere: ISavedFeatureAnywhere
// ): SerializedFeatureAnywhere => {
//   const {
//     id,
//     description,
//     pluginResourceId,
//     savedObjectId,
//     augmentExpressionFn,
//     version,
//   } = savedFeatureAnywhere;

//   return {
//     id,
//     description,
//     pluginResourceId,
//     savedObjectId,
//     augmentExpressionFn: JSON.stringify(augmentExpressionFn),
//     version,
//   };
// };

// // converting from serialized (string) to obj
// export const convertFromSerializedFeatureAnywhere = (
//   serializedFeatureAnywhere: SerializedFeatureAnywhere
// ): ISavedFeatureAnywhere => {
//   const {
//     id,
//     description,
//     pluginResourceId,
//     savedObjectId,
//     augmentExpressionFn,
//     version,
//   } = serializedFeatureAnywhere;

//   return {
//     id,
//     description,
//     pluginResourceId,
//     savedObjectId,
//     augmentExpressionFn: JSON.parse(augmentExpressionFn),
//     version,
//   };
// };

export function createSavedFeatureAnywhereClass(services: SavedObjectOpenSearchDashboardsServices) {
  const SavedObjectClass = createSavedObjectClass(services);

  // savedObjectType & savedObjectId are needed for initial creation of this obj.
  // then, when actually saving, extractReferences will construct a reference field
  // using the type and ID specified here.
  class SavedFeatureAnywhere extends SavedObjectClass {
    public static type: string = 'feature-anywhere';
    public static mapping: Record<string, string> = {
      description: 'text',
      pluginResourceId: 'text',
      savedObjectType: 'keyword',
      savedObjectId: 'keyword',
      augmentExpressionFn: 'object',
      version: 'integer',
    };
    // Order these fields to the top, the rest are alphabetical
    public static fieldOrder = ['description'];

    constructor(opts: Record<string, unknown> | string = {}) {
      if (typeof opts !== 'object') {
        opts = { id: opts };
      }
      super({
        type: SavedFeatureAnywhere.type,
        mapping: SavedFeatureAnywhere.mapping,
        extractReferences,
        injectReferences,
        id: (opts.id as string) || '',
        indexPattern: opts.indexPattern as IIndexPattern,
        defaults: {
          description: get(opts, 'description', ''),
          pluginResourceId: get(opts, 'pluginResourceId', ''),
          savedObjectType: get(opts, 'savedObjectType', ''),
          savedObjectId: get(opts, 'savedObjectId', ''),
          augmentExpressionFn: get(opts, 'augmentExpressionFn', {}),
          version: 1,
        },
        // currently we have no special conversion logic, and we
        // don't really need to override this fn for now.
        // all this is doing is converting into the feature anywhere type,
        // then back to a saved object type.
        // if fields need to be specially handled, can be done here.
        // (see _saved_vis.ts for examples)
        // it is also commented as 'only used by visualizations' in the fn def
        // afterOpenSearchResp: async (savedObject: SavedObject) => {
        //   const savedFeatureAnywhere = (savedObject as any) as ISavedFeatureAnywhere;
        //   return (savedFeatureAnywhere as any) as SavedObject;
        // },
      });
      // probably set to false since this saved obj should be hidden by default
      this.showInRecentlyAccessed = false;

      // we probably don't need this below field. we aren't going to need a full path
      // since we aren't going to allow editing by default
      //   this.getFullPath = () => {
      //     return `/app/visualize#/edit/${this.id}`;
      //   };
    }
  }

  return SavedFeatureAnywhere as new (opts: Record<string, unknown> | string) => SavedObject;
}
