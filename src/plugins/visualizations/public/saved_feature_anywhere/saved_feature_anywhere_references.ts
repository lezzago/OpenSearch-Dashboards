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
  SavedObjectAttribute,
  SavedObjectAttributes,
  SavedObjectReference,
} from '../../../../core/public';
import { FeatureAnywhereSavedObject } from '../types';

/**
 * Note that references aren't stored in the object's interface (FeatureAnywhereSavedObject).
 * Rather, just the ID/type is. The references are used when making saved obj API calls, or viewing in the
 * saved objs management page to show parent/child relationships between saved objects.
 *
 * So, we need to instantiate these helper fns to construct & deconstruct
 * references when creating & reading the indexed/stored saved objects, respectively.
 */

/**
 * Used during creation. Converting from FeatureAnywhereSavedObject to the actual indexed saved object
 */
export function extractReferences({
  attributes,
  references = [],
}: {
  attributes: SavedObjectAttributes;
  references: SavedObjectReference[];
}) {
  const updatedAttributes = { ...attributes };
  const updatedReferences = [...references];

  // Extract saved object
  if (updatedAttributes.savedObjectType && updatedAttributes.savedObjectId) {
    updatedReferences.push({
      name: 'saved_object_0',
      type: String(updatedAttributes.savedObjectType),
      id: String(updatedAttributes.savedObjectId),
    });
    delete updatedAttributes.savedObjectId;
    delete updatedAttributes.savedObjectType;
    updatedAttributes.savedObjectName = 'saved_object_0';
  }
  return {
    references: updatedReferences,
    attributes: updatedAttributes,
  };
}

/**
 * Used during reading. Converting from the indexed saved object to a FeatureAnywhereSavedObject
 */
export function injectReferences(
  savedObject: FeatureAnywhereSavedObject,
  references: SavedObjectReference[]
) {
  if (savedObject.savedObjectName) {
    const savedObjectReference = references.find(
      (reference) => reference.name === savedObject.savedObjectName
    );
    if (!savedObjectReference) {
      throw new Error(`Could not find saved object reference "${savedObject.savedObjectName}"`);
    }
    savedObject.savedObjectId = savedObjectReference.id;
    savedObject.savedObjectType = savedObjectReference.type;
    delete savedObject.savedObjectName;
  }
}
