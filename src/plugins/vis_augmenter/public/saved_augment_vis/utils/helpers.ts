/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { get } from 'lodash';
import { IUiSettingsClient } from 'opensearch-dashboards/public';
import { getSavedAugmentVisLoader, getUISettings } from '../../services';
import { ISavedAugmentVis } from '../types';
import {
  PLUGIN_AUGMENTATION_ENABLE_SETTING,
  PLUGIN_AUGMENTATION_MAX_OBJECTS_SETTING,
} from '../../../common/constants';
import { SavedObjectLoaderAugmentVis } from '../saved_augment_vis';

/**
 * Create an augment vis saved object given an object that
 * implements the ISavedAugmentVis interface
 */
export const createAugmentVisSavedObject = async (
  AugmentVis: ISavedAugmentVis,
  loader: SavedObjectLoaderAugmentVis,
  uiSettings: IUiSettingsClient
): Promise<any> => {
  // const loader = getSavedAugmentVisLoader();
  // const uiSettings = getUISettings();
  const isAugmentationEnabled = uiSettings.get(PLUGIN_AUGMENTATION_ENABLE_SETTING);
  if (!isAugmentationEnabled) {
    throw new Error(
      'Visualization augmentation is disabled, please enable visualization:enablePluginAugmentation.'
    );
  }
  const maxAssociatedCount = uiSettings.get(PLUGIN_AUGMENTATION_MAX_OBJECTS_SETTING);

  await loader.findAll().then(async (resp) => {
    if (resp !== undefined) {
      const savedAugmentObjects = get(resp, 'hits', []);
      // gets all the saved object for this visualization
      const savedObjectsForThisVisualization = savedAugmentObjects.filter(
        (savedObj) => get(savedObj, 'visId', '') === AugmentVis.visId
      );

      if (maxAssociatedCount <= savedObjectsForThisVisualization.length) {
        throw new Error(
          `Cannot associate the plugin resource to the visualization due to the limit of the max
          amount of associated plugin resources (${maxAssociatedCount}) with
          ${savedObjectsForThisVisualization.length} associated to the visualization`
        );
      }
    }
  });

  return await loader.get((AugmentVis as any) as Record<string, unknown>);
};
