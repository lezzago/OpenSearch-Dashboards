/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DatasetTypeConfig } from '../../../data/public';

export const EXPLORE_SUPPORTED_TYPES_APP_NAME = 'explore';

interface DatasetTypesSource {
  getTypes?: () => DatasetTypeConfig[];
}

/**
 * Returns `baseTypes` plus every registered dataset type that opts in to Explore via
 * `meta.appendToSupportedTypes` (e.g. a dataset type registered by another plugin).
 * Types that do not opt in, and the order of `baseTypes`, are unchanged.
 */
export const withRegisteredSupportedTypes = (
  baseTypes: string[],
  datasetService?: DatasetTypesSource
): string[] => {
  const types = [...baseTypes];
  let registered: DatasetTypeConfig[] = [];
  try {
    registered = datasetService?.getTypes?.() ?? [];
  } catch (e) {
    registered = [];
  }
  registered.forEach((type) => {
    if (
      type?.meta?.appendToSupportedTypes?.includes(EXPLORE_SUPPORTED_TYPES_APP_NAME) &&
      !types.includes(type.id)
    ) {
      types.push(type.id);
    }
  });
  return types;
};
