/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { get } from 'lodash';
import {
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiFlyout,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import { getEmbeddable, getQueryService } from '../../services';
import './styles.scss';
import { VisualizeEmbeddable, VisualizeInput } from '../../../../visualizations/public';
import { TimeRange } from '../../../../data/common';
import { BaseVisItem } from './base_vis_item';
import { isPointInTimeEventsVisLayer, PointInTimeEventsVisLayer, VisLayer } from '../../types';
import { DateRangeItem } from './date_range_item';
import { LoadingFlyoutBody } from './loading_flyout_body';
import { ErrorFlyoutBody } from './error_flyout_body';
import { EventsPanel } from './events_panel';
import { TimelinePanel } from './timeline_panel';
import { ErrorEmbeddable } from '../../../../embeddable/public';
import { getErrorMessage } from './utils';

interface Props {
  onClose: () => void;
  savedObjectId: string;
}

export interface EventVisEmbeddableItem {
  visLayer: VisLayer;
  embeddable: VisualizeEmbeddable;
}

export type EventVisEmbeddablesMap = Map<string, EventVisEmbeddableItem[]>;

export const DATE_RANGE_FORMAT = 'MM/DD/YYYY HH:mm';

export function ViewEventsFlyout(props: Props) {
  const [visEmbeddable, setVisEmbeddable] = useState<VisualizeEmbeddable | undefined>(undefined);
  // This map persists a plugin resource type -> a list of vis embeddables
  // for each VisLayer of that type
  const [eventVisEmbeddablesMap, setEventVisEmbeddablesMap] = useState<
    EventVisEmbeddablesMap | undefined
  >(undefined);
  const [timelineVisEmbeddable, setTimelineVisEmbeddable] = useState<
    VisualizeEmbeddable | undefined
  >(undefined);
  const [timeRange, setTimeRange] = useState<TimeRange | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const embeddableVisFactory = getEmbeddable().getEmbeddableFactory('visualization');

  function getValueAxisPositions(
    embeddable: VisualizeEmbeddable
  ): { left: boolean; right: boolean } {
    let hasLeftValueAxis = false;
    let hasRightValueAxis = false;
    if (embeddable !== undefined) {
      const valueAxes = embeddable.vis.params.valueAxes;
      const positions = valueAxes.map(
        (valueAxis: { position: string }) => valueAxis.position
      ) as string[];
      hasLeftValueAxis = positions.includes('left');
      hasRightValueAxis = positions.includes('right');
    }
    return {
      left: hasLeftValueAxis,
      right: hasRightValueAxis,
    };
  }

  function reload() {
    visEmbeddable?.reload();
    eventVisEmbeddablesMap?.forEach((embeddableItems) => {
      embeddableItems.forEach((embeddableItem) => {
        embeddableItem.embeddable.reload();
      });
    });
  }

  async function fetchVisEmbeddable() {
    try {
      const contextInput = {
        filters: getQueryService().filterManager.getFilters(),
        query: getQueryService().queryString.getQuery(),
        timeRange: getQueryService().timefilter.timefilter.getTime(),
      };
      setTimeRange(contextInput.timeRange);

      const embeddable = (await embeddableVisFactory?.createFromSavedObject(props.savedObjectId, {
        ...contextInput,
        visAugmenterConfig: {
          inFlyout: true,
          isBaseVis: true,
        },
      } as VisualizeInput)) as VisualizeEmbeddable | ErrorEmbeddable;

      if (embeddable instanceof ErrorEmbeddable) {
        throw getErrorMessage(embeddable);
      }

      embeddable.updateInput({
        // @ts-ignore
        refreshConfig: {
          value: 0,
          pause: true,
        },
      });

      // reload is needed so we can fetch the initial VisLayers, and so they're
      // assigned to the vislayers field in the embeddable itself
      embeddable.reload();

      setVisEmbeddable(embeddable);
    } catch (err: any) {
      setErrorMessage(String(err));
    }
  }

  // For each VisLayer in the base vis embeddable, generate a new filtered vis
  // embeddable to only show datapoints for that particular VisLayer. Partition them by
  // plugin resource type
  async function createEventEmbeddables(embeddable: VisualizeEmbeddable) {
    try {
      const { left, right } = getValueAxisPositions(embeddable);
      const map = new Map<string, EventVisEmbeddableItem[]>() as EventVisEmbeddablesMap;
      // Currently only support PointInTimeEventVisLayers. Different layer types
      // may require different logic in here
      const visLayers = (get(visEmbeddable, 'visLayers', []) as VisLayer[]).filter((visLayer) =>
        isPointInTimeEventsVisLayer(visLayer)
      ) as PointInTimeEventsVisLayer[];
      if (visLayers !== undefined) {
        const contextInput = {
          filters: embeddable.getInput().filters,
          query: embeddable.getInput().query,
          timeRange: embeddable.getInput().timeRange,
        };

        await Promise.all(
          visLayers.map(async (visLayer) => {
            const pluginResourceType = visLayer.pluginResource.type;
            const eventEmbeddable = (await embeddableVisFactory?.createFromSavedObject(
              props.savedObjectId,
              {
                ...contextInput,
                visAugmenterConfig: {
                  visLayerResourceIds: [visLayer.pluginResource.id as string],
                  inFlyout: true,
                  isBaseVis: false,
                  isEventVis: true,
                  leftValueAxisPadding: left,
                  rightValueAxisPadding: right,
                },
              } as VisualizeInput
            )) as VisualizeEmbeddable | ErrorEmbeddable;

            if (eventEmbeddable instanceof ErrorEmbeddable) {
              throw getErrorMessage(eventEmbeddable);
            }

            eventEmbeddable.updateInput({
              // @ts-ignore
              refreshConfig: {
                value: 0,
                pause: true,
              },
            });

            const curList = (map.get(pluginResourceType) === undefined
              ? []
              : map.get(pluginResourceType)) as EventVisEmbeddableItem[];
            curList.push({
              visLayer,
              embeddable: eventEmbeddable,
            } as EventVisEmbeddableItem);
            map.set(pluginResourceType, curList);
          })
        );
        setEventVisEmbeddablesMap(map);
      }
    } catch (err: any) {
      setErrorMessage(String(err));
    }
  }

  async function createTimelineEmbeddable(embeddable: VisualizeEmbeddable) {
    try {
      const { left, right } = getValueAxisPositions(embeddable);
      const contextInput = {
        filters: embeddable.getInput().filters,
        query: embeddable.getInput().query,
        timeRange: embeddable.getInput().timeRange,
      };

      const timelineEmbeddable = (await embeddableVisFactory?.createFromSavedObject(
        props.savedObjectId,
        {
          ...contextInput,
          visAugmenterConfig: {
            inFlyout: true,
            isBaseVis: false,
            isTimelineVis: true,
            leftValueAxisPadding: left,
            rightValueAxisPadding: right,
          },
        } as VisualizeInput
      )) as VisualizeEmbeddable | ErrorEmbeddable;

      if (timelineEmbeddable instanceof ErrorEmbeddable) {
        throw getErrorMessage(timelineEmbeddable);
      }

      timelineEmbeddable.updateInput({
        // @ts-ignore
        refreshConfig: {
          value: 0,
          pause: true,
        },
      });
      setTimelineVisEmbeddable(timelineEmbeddable);
    } catch (err: any) {
      setErrorMessage(String(err));
    }
  }

  useEffect(() => {
    fetchVisEmbeddable();
    // TODO: look into why eslint errors here
    /* eslint-disable */
  }, [props.savedObjectId]);

  useEffect(() => {
    if (visEmbeddable?.visLayers) {
      createEventEmbeddables(visEmbeddable);
      createTimelineEmbeddable(visEmbeddable);
    }
  }, [visEmbeddable?.visLayers]);

  useEffect(() => {
    if (
      visEmbeddable !== undefined &&
      eventVisEmbeddablesMap !== undefined &&
      timeRange !== undefined &&
      timelineVisEmbeddable !== undefined
    ) {
      setIsLoading(false);
    }
  }, [visEmbeddable, eventVisEmbeddablesMap, timeRange, timelineVisEmbeddable]);

  return (
    <>
      <EuiFlyout size="l" onClose={props.onClose}>
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h1>{isLoading || errorMessage ? <>&nbsp;</> : `${visEmbeddable.getTitle()}`}</h1>
          </EuiTitle>
        </EuiFlyoutHeader>
        {errorMessage ? (
          <ErrorFlyoutBody errorMessage={errorMessage} />
        ) : isLoading ? (
          <LoadingFlyoutBody />
        ) : (
          <EuiFlyoutBody>
            <EuiFlexGroup className="view-events-flyout__content" direction="column">
              <EuiFlexItem
                className="view-events-flyout__contentPanel hide-y-scroll date-range-panel-height"
                grow={false}
              >
                <DateRangeItem timeRange={timeRange} reload={reload} />
              </EuiFlexItem>
              <EuiFlexItem className="view-events-flyout__contentPanel hide-y-scroll" grow={5}>
                <BaseVisItem embeddable={visEmbeddable} />
              </EuiFlexItem>
              <EuiFlexItem className="view-events-flyout__contentPanel show-y-scroll" grow={5}>
                <EventsPanel eventVisEmbeddablesMap={eventVisEmbeddablesMap} />
              </EuiFlexItem>
              <EuiFlexItem
                className="view-events-flyout__contentPanel hide-y-scroll timeline-panel-height"
                grow={false}
              >
                <TimelinePanel embeddable={timelineVisEmbeddable} />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlyoutBody>
        )}
      </EuiFlyout>
    </>
  );
}
