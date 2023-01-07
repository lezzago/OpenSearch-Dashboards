/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { VisualizeEmbeddable, Vis } from '../../visualizations/public';
import { ErrorEmbeddable } from '../../embeddable/public';
// eslint-disable-next-line @osd/eslint/no-restricted-paths
import { timefilterServiceMock } from '../../data/public/query/timefilter/timefilter_service.mock';
import { EventVisEmbeddableItem } from './view_events_flyout';
import {
  VisLayerTypes,
  PointInTimeEventsVisLayer,
  PluginResource,
  PointInTimeEvent,
} from './types';

const SAVED_OBJ_ID = 'test-saved-obj-id';
const VIS_TITLE = 'test-vis-title';
const ORIGIN_PLUGIN = 'test-plugin';
const PLUGIN_RESOURCE = {
  type: 'test-type',
  id: 'test-resource-id',
  name: 'test-resource-name',
  urlPath: 'test-url-path',
} as PluginResource;
const EVENT_COUNT = 3;

export const createPluginResource = (
  type: string = PLUGIN_RESOURCE.type,
  id: string = PLUGIN_RESOURCE.id,
  name: string = PLUGIN_RESOURCE.name,
  urlPath: string = PLUGIN_RESOURCE.urlPath
): PluginResource => {
  return {
    type,
    id,
    name,
    urlPath,
  };
};

export const createMockErrorEmbeddable = (): ErrorEmbeddable => {
  return new ErrorEmbeddable('Oh no something has gone wrong', { id: ' 404' });
};

export const createMockVisEmbeddable = (
  savedObjectId: string = SAVED_OBJ_ID,
  title: string = VIS_TITLE
): VisualizeEmbeddable => {
  const mockTimeFilterService = timefilterServiceMock.createStartContract();
  const mockTimeFilter = mockTimeFilterService.timefilter;
  const mockVis = ({
    type: {},
    data: {},
    uiState: {
      on: jest.fn(),
    },
  } as unknown) as Vis;
  const mockDeps = {
    start: jest.fn(),
  };
  const mockConfiguration = {
    vis: mockVis,
    editPath: 'test-edit-path',
    editUrl: 'test-edit-url',
    editable: true,
    deps: mockDeps,
  };
  const mockVisualizeInput = { id: 'test-id', savedObjectId };

  const mockVisEmbeddable = new VisualizeEmbeddable(
    mockTimeFilter,
    mockConfiguration,
    mockVisualizeInput
  );
  mockVisEmbeddable.getTitle = () => title;
  return mockVisEmbeddable;
};

export const createPointInTimeEventsVisLayer = (
  originPlugin: string = ORIGIN_PLUGIN,
  pluginResource: PluginResource = PLUGIN_RESOURCE,
  eventCount: number = EVENT_COUNT
): PointInTimeEventsVisLayer => {
  const events = [] as PointInTimeEvent[];
  for (let i = 0; i < eventCount; i++) {
    events.push({
      timestamp: i,
      metadata: {
        pluginResourceId: pluginResource.id,
      },
    } as PointInTimeEvent);
  }
  return {
    originPlugin,
    type: VisLayerTypes.PointInTimeEvents,
    pluginResource,
    events,
  };
};

export const createMockEventVisEmbeddableItem = (
  savedObjectId: string = SAVED_OBJ_ID,
  title: string = VIS_TITLE,
  originPlugin: string = ORIGIN_PLUGIN,
  pluginResource: PluginResource = PLUGIN_RESOURCE,
  eventCount: number = EVENT_COUNT
): EventVisEmbeddableItem => {
  const visLayer = createPointInTimeEventsVisLayer(originPlugin, pluginResource, eventCount);
  const embeddable = createMockVisEmbeddable(savedObjectId, title);
  return {
    visLayer,
    embeddable,
  };
};
