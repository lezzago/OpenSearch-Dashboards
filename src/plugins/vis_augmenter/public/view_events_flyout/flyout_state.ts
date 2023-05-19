/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { createGetterSetter } from '../../../opensearch_dashboards_utils/public';

export enum VIEW_EVENTS_FLYOUT_STATE {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export const [getFlyoutState, setFlyoutState] = createGetterSetter<
  keyof typeof VIEW_EVENTS_FLYOUT_STATE
>(VIEW_EVENTS_FLYOUT_STATE.CLOSED);
