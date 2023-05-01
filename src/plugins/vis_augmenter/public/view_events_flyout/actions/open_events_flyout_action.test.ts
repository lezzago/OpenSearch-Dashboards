/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreMock } from '../../../../../core/public/mocks';
import { CoreStart } from 'opensearch-dashboards/public';
import { OpenEventsFlyoutAction } from './open_events_flyout_action';

let coreStart: CoreStart;
beforeEach(async () => {
  coreStart = coreMock.createStart();
});

describe('OpenEventsFlyoutAction', () => {
  it('is incompatible with null saved obj id', async () => {
    const action = new OpenEventsFlyoutAction(coreStart);
    const savedObjectId = null;
    // @ts-ignore
    expect(await action.isCompatible({ savedObjectId })).toBe(false);
  });

  it('is incompatible with undefined saved obj id', async () => {
    const action = new OpenEventsFlyoutAction(coreStart);
    const savedObjectId = undefined;
    // @ts-ignore
    expect(await action.isCompatible({ savedObjectId })).toBe(false);
  });

  it('is incompatible with empty saved obj id', async () => {
    const action = new OpenEventsFlyoutAction(coreStart);
    const savedObjectId = '';
    expect(await action.isCompatible({ savedObjectId })).toBe(false);
  });

  it('execute throws error if incompatible saved obj id', async () => {
    const action = new OpenEventsFlyoutAction(coreStart);
    async function check(id: any) {
      await action.execute({ savedObjectId: id });
    }
    await expect(check(null)).rejects.toThrow(Error);
    await expect(check(undefined)).rejects.toThrow(Error);
    await expect(check('')).rejects.toThrow(Error);
  });

  it('execute calls openFlyout if compatible saved obj id', async () => {
    const savedObjectId = 'test-id';
    const action = new OpenEventsFlyoutAction(coreStart);
    await action.execute({ savedObjectId });
    expect(coreStart.overlays.openFlyout).toHaveBeenCalledTimes(1);
  });

  it('Returns display name', async () => {
    const action = new OpenEventsFlyoutAction(coreStart);
    expect(action.getDisplayName()).toBeDefined();
  });

  it('Returns undefined icon type', async () => {
    const action = new OpenEventsFlyoutAction(coreStart);
    expect(action.getIconType()).toBeUndefined();
  });
});
