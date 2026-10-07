/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { withRegisteredSupportedTypes } from './supported_dataset_types';

const type = (id: string, meta: Record<string, unknown> = {}) =>
  ({ id, title: id, meta: { icon: { type: 'database' }, ...meta } }) as any;

describe('withRegisteredSupportedTypes', () => {
  it('returns the base types unchanged when no registered type opts in', () => {
    const service = {
      getTypes: () => [
        type('INDEX_PATTERN'),
        type('FILTERED_TYPE', { supportedAppNames: ['explore'] }),
        type('OTHER', { appendToSupportedTypes: ['discover'] }),
      ],
    };
    expect(withRegisteredSupportedTypes(['INDEXES', 'INDEX_PATTERN'], service)).toEqual([
      'INDEXES',
      'INDEX_PATTERN',
    ]);
  });

  it('appends registered types that opt in to explore, without duplicates', () => {
    const service = {
      getTypes: () => [
        type('EXAMPLE_TYPE', { appendToSupportedTypes: ['explore'] }),
        type('INDEX_PATTERN', { appendToSupportedTypes: ['explore'] }),
      ],
    };
    expect(withRegisteredSupportedTypes(['INDEXES', 'INDEX_PATTERN'], service)).toEqual([
      'INDEXES',
      'INDEX_PATTERN',
      'EXAMPLE_TYPE',
    ]);
  });

  it('does not mutate the base array and tolerates a missing or throwing service', () => {
    const base = ['INDEX_PATTERN'];
    expect(withRegisteredSupportedTypes(base, undefined)).toEqual(['INDEX_PATTERN']);
    expect(
      withRegisteredSupportedTypes(base, {
        getTypes: () => {
          throw new Error('boom');
        },
      })
    ).toEqual(['INDEX_PATTERN']);
    expect(base).toEqual(['INDEX_PATTERN']);
  });
});
