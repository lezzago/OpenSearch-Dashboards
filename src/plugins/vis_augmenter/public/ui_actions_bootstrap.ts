/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from 'opensearch-dashboards/public';
import {
  OpenEventsFlyoutAction,
  ViewEventsOptionAction,
  OPEN_EVENTS_FLYOUT_ACTION,
  VIEW_EVENTS_OPTION_ACTION,
} from './view_events_flyout';
import { AugmentVisContext, openEventsFlyoutTrigger } from './view_events_flyout/triggers';
import { OPEN_EVENTS_FLYOUT_TRIGGER } from '../../ui_actions/public';
import { CONTEXT_MENU_TRIGGER, EmbeddableContext } from '../../embeddable/public';
import { getUiActions } from './services';

// Overriding the mappings defined in UIActions plugin so that
// the new trigger and action definitions resolve.
// This is a common pattern among internal Dashboards plugins.
declare module '../../ui_actions/public' {
  export interface TriggerContextMapping {
    [OPEN_EVENTS_FLYOUT_TRIGGER]: AugmentVisContext;
  }

  export interface ActionContextMapping {
    [OPEN_EVENTS_FLYOUT_ACTION]: AugmentVisContext;
    [VIEW_EVENTS_OPTION_ACTION]: EmbeddableContext;
  }
}

export const registerTriggersAndActions = (core: CoreStart) => {
  const openEventsFlyoutAction = new OpenEventsFlyoutAction(core);
  const viewEventsOptionAction = new ViewEventsOptionAction(core);

  getUiActions().registerAction(openEventsFlyoutAction);
  getUiActions().registerAction(viewEventsOptionAction);
  getUiActions().registerTrigger(openEventsFlyoutTrigger);
  // Opening View Events flyout from the chart
  getUiActions().addTriggerAction(OPEN_EVENTS_FLYOUT_TRIGGER, openEventsFlyoutAction);
  // Opening View Events flyout from the context menu
  getUiActions().addTriggerAction(CONTEXT_MENU_TRIGGER, viewEventsOptionAction);
};
