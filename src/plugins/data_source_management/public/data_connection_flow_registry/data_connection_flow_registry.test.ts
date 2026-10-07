/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DataConnectionFlow,
  DataConnectionFlowRegistry,
  findOwningDataConnectionFlow,
  getVisibleDataConnectionFlows,
  isDataConnectionFlowVisible,
} from './data_connection_flow_registry';

const createFlow = (overrides: Partial<DataConnectionFlow> = {}): DataConnectionFlow => ({
  id: 'flowA',
  title: 'Flow A',
  buttonLabel: 'Connect A',
  mount: jest.fn(() => jest.fn()),
  ...overrides,
});

describe('DataConnectionFlowRegistry', () => {
  let registry: DataConnectionFlowRegistry;

  beforeEach(() => {
    registry = new DataConnectionFlowRegistry();
  });

  it('keeps the optional typeLabel of a registered flow', () => {
    registry.registerDataConnectionFlow(createFlow({ typeLabel: 'Example type' }));
    expect(registry.getFlow('flowA')?.typeLabel).toBe('Example type');
  });

  it('is empty by default', () => {
    expect(registry.hasFlows()).toBe(false);
    expect(registry.getAllFlows()).toEqual([]);
    expect(registry.getFlow('flowA')).toBeUndefined();
  });

  it('allows to register flows and retrieve them by id', () => {
    const flowA = createFlow({ id: 'flowA' });
    const flowB = createFlow({ id: 'example-flow' });
    registry.registerDataConnectionFlow(flowA);
    registry.registerDataConnectionFlow(flowB);

    expect(registry.hasFlows()).toBe(true);
    expect(registry.getAllFlows().map((f) => f.id)).toEqual(['flowA', 'example-flow']);
    expect(registry.getFlow('example-flow')).toEqual(flowB);
    expect(registry.getFlow('unknown')).toBeUndefined();
  });

  it('throws when registering the same flow id twice', () => {
    registry.registerDataConnectionFlow(createFlow({ id: 'flowA' }));
    expect(() =>
      registry.registerDataConnectionFlow(createFlow({ id: 'flowA' }))
    ).toThrowErrorMatchingInlineSnapshot(`"Data connection flow 'flowA' is already registered"`);
  });

  it('throws for invalid ids or a missing mount function', () => {
    expect(() => registry.registerDataConnectionFlow(createFlow({ id: '' }))).toThrow(/is invalid/);
    expect(() => registry.registerDataConnectionFlow(createFlow({ id: 'a/b' }))).toThrow(
      /is invalid/
    );
    expect(() =>
      registry.registerDataConnectionFlow(createFlow({ mount: undefined as any }))
    ).toThrow(/must provide a mount function/);
    expect(registry.hasFlows()).toBe(false);
  });

  it('forbids mutating registered flows', () => {
    registry.registerDataConnectionFlow(createFlow());
    const flow = registry.getFlow('flowA')!;
    expect(() => {
      (flow as any).title = 'changed';
    }).toThrow();
  });

  it('does not mutate the registry when altering the returned list', () => {
    registry.registerDataConnectionFlow(createFlow({ id: 'flowA' }));
    registry.registerDataConnectionFlow(createFlow({ id: 'flowB' }));
    registry.getAllFlows().splice(0, 2);
    expect(registry.getAllFlows()).toHaveLength(2);
  });

  describe('#findOwningFlow', () => {
    const so = { id: 'so-1', attributes: { connectionKind: 'EXAMPLE' }, workspaces: ['ws1'] };

    it('returns the first flow whose ownsConnection returns true', () => {
      registry.registerDataConnectionFlow(createFlow({ id: 'noPredicate' }));
      registry.registerDataConnectionFlow(
        createFlow({ id: 'notOwner', ownsConnection: () => false })
      );
      registry.registerDataConnectionFlow(
        createFlow({
          id: 'owner',
          ownsConnection: (o) => o.attributes.connectionKind === 'EXAMPLE',
        })
      );
      expect(registry.findOwningFlow(so)?.id).toBe('owner');
    });

    it('returns undefined when no flow owns the saved object', () => {
      registry.registerDataConnectionFlow(
        createFlow({ id: 'notOwner', ownsConnection: () => false })
      );
      expect(registry.findOwningFlow(so)).toBeUndefined();
    });

    it('treats a throwing ownsConnection as not owned', () => {
      registry.registerDataConnectionFlow(
        createFlow({
          id: 'throws',
          ownsConnection: () => {
            throw new Error('boom');
          },
        })
      );
      registry.registerDataConnectionFlow(createFlow({ id: 'owner', ownsConnection: () => true }));
      expect(registry.findOwningFlow(so)?.id).toBe('owner');
    });
  });
});

describe('isDataConnectionFlowVisible', () => {
  it('defaults to visible when isVisible is not provided', async () => {
    expect(await isDataConnectionFlowVisible(createFlow())).toBe(true);
  });

  it('supports sync and async isVisible', async () => {
    expect(await isDataConnectionFlowVisible(createFlow({ isVisible: () => true }))).toBe(true);
    expect(await isDataConnectionFlowVisible(createFlow({ isVisible: () => false }))).toBe(false);
    expect(
      await isDataConnectionFlowVisible(createFlow({ isVisible: () => Promise.resolve(true) }))
    ).toBe(true);
    expect(
      await isDataConnectionFlowVisible(createFlow({ isVisible: () => Promise.resolve(false) }))
    ).toBe(false);
  });

  it('fails closed when isVisible rejects or throws', async () => {
    expect(
      await isDataConnectionFlowVisible(
        createFlow({ isVisible: () => Promise.reject(new Error('nope')) })
      )
    ).toBe(false);
    expect(
      await isDataConnectionFlowVisible(
        createFlow({
          isVisible: () => {
            throw new Error('nope');
          },
        })
      )
    ).toBe(false);
  });
});

describe('getVisibleDataConnectionFlows', () => {
  it('returns only visible flows, preserving order', async () => {
    const flows = [
      createFlow({ id: 'a' }),
      createFlow({ id: 'b', isVisible: () => Promise.reject(new Error('x')) }),
      createFlow({ id: 'c', isVisible: () => Promise.resolve(true) }),
      createFlow({ id: 'd', isVisible: () => false }),
    ];
    expect((await getVisibleDataConnectionFlows(flows)).map((f) => f.id)).toEqual(['a', 'c']);
  });
});

describe('findOwningDataConnectionFlow', () => {
  const so = { id: 'so-1', attributes: { connectionKind: 'EXAMPLE' } };

  it('only considers the given flows', () => {
    const owner = createFlow({ id: 'owner', ownsConnection: () => true });
    const other = createFlow({ id: 'other', ownsConnection: () => true });
    expect(findOwningDataConnectionFlow([other, owner], so)?.id).toBe('other');
    expect(findOwningDataConnectionFlow([owner], so)?.id).toBe('owner');
    expect(findOwningDataConnectionFlow([], so)).toBeUndefined();
  });
});
