/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreMock } from '../../../../../core/public/mocks';
import { CoreStart } from 'opensearch-dashboards/public';
import { ViewEventsOptionAction } from './view_events_option_action';
import { createMockErrorEmbeddable, createMockVisEmbeddable } from '../../mocks';

let coreStart: CoreStart;
beforeEach(async () => {
  coreStart = coreMock.createStart();
});

describe('ViewEventsOptionAction', () => {
  // TODO: following commented out tests can be enabled when compatibility function is finalized

  // it('is incompatible with ErrorEmbeddables', async () => {
  //   const action = new ViewEventsOptionAction(coreStart);
  //   const errorEmbeddable = createMockErrorEmbeddable();
  //   expect(await action.isCompatible({ embeddable: errorEmbeddable })).toBe(false);
  // });

  // it('is compatible with VisualizeEmbeddables', async () => {
  //   const visEmbeddable = createMockVisEmbeddable('test-saved-obj-id', 'test-title');
  //   const action = new ViewEventsOptionAction(coreStart);
  //   expect(await action.isCompatible({ embeddable: visEmbeddable })).toBe(true);
  // });

  // it('execute throws error if incompatible embeddable', async () => {
  //   const errorEmbeddable = createMockErrorEmbeddable();
  //   const action = new ViewEventsOptionAction(coreStart);
  //   async function check() {
  //     await action.execute({ embeddable: errorEmbeddable });
  //   }
  //   await expect(check()).rejects.toThrow(Error);
  // });

  it('execute calls openFlyout if compatible embeddable', async () => {
    const visEmbeddable = createMockVisEmbeddable('test-saved-obj-id', 'test-title');
    const action = new ViewEventsOptionAction(coreStart);
    await action.execute({ embeddable: visEmbeddable });
    expect(coreStart.overlays.openFlyout).toHaveBeenCalledTimes(1);
  });

  it('Returns display name', async () => {
    const action = new ViewEventsOptionAction(coreStart);
    expect(action.getDisplayName()).toBeDefined();
  });

  it('Returns an icon type', async () => {
    const action = new ViewEventsOptionAction(coreStart);
    expect(action.getIconType()).toBeDefined();
  });
});
