/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { mount, ReactWrapper } from 'enzyme';
import { Route, Router } from 'react-router-dom';
import { createMemoryHistory, MemoryHistory } from 'history';
import { coreMock } from '../../../../../core/public/mocks';
import {
  DataConnectionFlow,
  DataConnectionFlowRegistry,
} from '../../data_connection_flow_registry';
import { DataConnectionFlowMountPoint } from './data_connection_flow_mount_point';
import {
  DIRECT_QUERY_CONNECTIONS_LIST_LOCATION,
  getDataConnectionFlowManagePath,
  getDataConnectionFlowPath,
  parseDataConnectionFlowPath,
} from './constants';

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('data connection flow path helpers', () => {
  it('builds flow paths', () => {
    expect(getDataConnectionFlowPath('example-flow')).toBe('/flows/example-flow');
    expect(getDataConnectionFlowManagePath('example-flow', 'abc')).toBe(
      '/flows/example-flow/manage/abc'
    );
  });

  it('parses flow paths', () => {
    expect(parseDataConnectionFlowPath('/flows/a')).toEqual({ flowId: 'a', path: '' });
    expect(parseDataConnectionFlowPath('/flows/a/')).toEqual({ flowId: 'a', path: '' });
    expect(parseDataConnectionFlowPath('/flows/a/manage/x')).toEqual({
      flowId: 'a',
      path: '/manage/x',
    });
    expect(parseDataConnectionFlowPath('/manage/x')).toBeUndefined();
    expect(parseDataConnectionFlowPath('/flows')).toBeUndefined();
  });
});

describe('DataConnectionFlowMountPoint', () => {
  let history: MemoryHistory;
  let registry: DataConnectionFlowRegistry;
  let core: ReturnType<typeof coreMock.createStart>;
  let wrapper: ReactWrapper | undefined;

  const createFlow = (overrides: Partial<DataConnectionFlow> = {}): DataConnectionFlow => ({
    id: 'flowA',
    title: 'Flow A',
    buttonLabel: 'Connect A',
    mount: jest.fn(() => jest.fn()),
    ...overrides,
  });

  const render = async (initialPath: string) => {
    history.push(initialPath);
    await act(async () => {
      wrapper = mount(
        <Router history={history}>
          <Route path={['/flows/:flowId', '/flows/:flowId/*']}>
            <DataConnectionFlowMountPoint registry={registry} core={core} />
          </Route>
        </Router>
      );
    });
    await flush();
    wrapper!.update();
    return wrapper!;
  };

  beforeEach(() => {
    history = createMemoryHistory();
    registry = new DataConnectionFlowRegistry();
    core = coreMock.createStart();
  });

  afterEach(() => {
    if (wrapper) {
      act(() => {
        wrapper!.unmount();
      });
      wrapper = undefined;
    }
  });

  it('mounts the flow with the expected params and unmounts it on leave', async () => {
    const unmount = jest.fn();
    const flow = createFlow({ mount: jest.fn(() => unmount) });
    registry.registerDataConnectionFlow(flow);

    const component = await render('/flows/flowA');
    expect(flow.mount).toHaveBeenCalledTimes(1);
    const params = (flow.mount as jest.Mock).mock.calls[0][0];
    expect(params.path).toBe('');
    expect(params.core).toBe(core);
    expect(params.element).toBeInstanceOf(HTMLElement);
    expect(
      component.find('div[data-test-subj="dataConnectionFlowMountPoint-flowA"]').getDOMNode()
    ).toBe(params.element);

    act(() => {
      component.unmount();
    });
    wrapper = undefined;
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it('passes the manage sub-path and re-mounts when navigating within the flow', async () => {
    const unmount = jest.fn();
    const flow = createFlow({ mount: jest.fn(() => unmount) });
    registry.registerDataConnectionFlow(flow);

    await render('/flows/flowA/manage/so-1');
    expect((flow.mount as jest.Mock).mock.calls[0][0].path).toBe('/manage/so-1');

    const { navigate } = (flow.mount as jest.Mock).mock.calls[0][0];
    await act(async () => {
      navigate('');
    });
    expect(history.location.pathname).toBe('/flows/flowA');
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(flow.mount).toHaveBeenCalledTimes(2);
    expect((flow.mount as jest.Mock).mock.calls[1][0].path).toBe('');
  });

  it('navigateToList returns to the Direct query connections tab', async () => {
    const flow = createFlow();
    registry.registerDataConnectionFlow(flow);
    await render('/flows/flowA');
    const { navigateToList } = (flow.mount as jest.Mock).mock.calls[0][0];
    await act(async () => {
      navigateToList();
    });
    expect(history.location.pathname).toBe('/');
    expect(history.location.state).toEqual(DIRECT_QUERY_CONNECTIONS_LIST_LOCATION.state);
  });

  it('supports async mount and cleans up when unmounted before mount resolves', async () => {
    const unmount = jest.fn();
    let resolveMount: (fn: () => void) => void = () => {};
    const flow = createFlow({
      mount: jest.fn(
        () =>
          new Promise<() => void>((resolve) => {
            resolveMount = resolve;
          })
      ),
    });
    registry.registerDataConnectionFlow(flow);

    const component = await render('/flows/flowA');
    expect(flow.mount).toHaveBeenCalledTimes(1);
    act(() => {
      component.unmount();
    });
    wrapper = undefined;
    expect(unmount).not.toHaveBeenCalled();
    await act(async () => {
      resolveMount(unmount);
    });
    expect(unmount).toHaveBeenCalledTimes(1);
  });

  it('does not mount a flow whose isVisible rejects', async () => {
    const flow = createFlow({ isVisible: () => Promise.reject(new Error('nope')) });
    registry.registerDataConnectionFlow(flow);
    const component = await render('/flows/flowA');
    expect(flow.mount).not.toHaveBeenCalled();
    expect(component.find('[data-test-subj="dataConnectionFlowNotFound"]').exists()).toBe(true);
  });

  it('renders a not-found callout for an unknown flow id', async () => {
    registry.registerDataConnectionFlow(createFlow());
    const component = await render('/flows/unknown');
    expect(component.find('[data-test-subj="dataConnectionFlowNotFound"]').exists()).toBe(true);
  });

  it('shows a danger toast when mount throws', async () => {
    const flow = createFlow({
      mount: jest.fn(() => {
        throw new Error('broken');
      }),
    });
    registry.registerDataConnectionFlow(flow);
    await render('/flows/flowA');
    expect(core.notifications.toasts.addDanger).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'broken' })
    );
  });
});
