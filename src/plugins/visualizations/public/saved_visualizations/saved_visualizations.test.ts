/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { getMockSavedVisLoader } from './mocks';

describe('SavedObjectLoaderVisualize', () => {
  //   const fn = {
  //     type: VisLayerTypes.PointInTimeEvents,
  //     name: 'test-fn',
  //     args: {
  //       testArg: 'test-value',
  //     },
  //   } as VisLayerExpressionFn;
  //   const validObj1 = generateAugmentVisSavedObject('valid-obj-id-1', fn, 'test-vis-id');
  //   const validObj2 = generateAugmentVisSavedObject('valid-obj-id-2', fn, 'test-vis-id');
  //   const invalidFnTypeObj = generateAugmentVisSavedObject(
  //     'invalid-fn-obj-id-1',
  //     {
  //       ...fn,
  //       // @ts-ignore
  //       type: 'invalid-type',
  //     },
  //     'test-vis-id'
  //   );

  //   const missingFnObj = generateAugmentVisSavedObject(
  //     'missing-fn-obj-id-1',
  //     {} as VisLayerExpressionFn,
  //     'test-vis-id'
  //   );

  describe('delete', () => {
    it('1 vis saved obj, 0 augment-vis saved objs', async () => {
      const mockAugmentVisDelete = jest.fn();
      const mockVisDelete = jest.fn();
      await getMockSavedVisLoader(mockAugmentVisDelete, mockVisDelete, []).delete(
        'test-vis-saved-obj-id'
      );

      expect(mockAugmentVisDelete).toHaveBeenCalledTimes(0);
      expect(mockVisDelete).toHaveBeenCalledTimes(1);
    });
  });
});
