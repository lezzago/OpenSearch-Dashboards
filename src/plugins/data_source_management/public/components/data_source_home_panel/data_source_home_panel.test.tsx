/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { shallow, mount } from 'enzyme';
import { RouteComponentProps } from 'react-router-dom';
import { EuiTab } from '@elastic/eui';
import { DataSourceHomePanel } from './data_source_home_panel';
import { DataSourceTableWithRouter } from '../data_source_table/data_source_table';
import { ManageDirectQueryDataConnectionsTableWithRouter } from '../direct_query_data_sources_components/direct_query_data_connection/manage_direct_query_data_connections_table';
import { useOpenSearchDashboards } from '../../../../opensearch_dashboards_react/public';
import { getListBreadcrumbs } from '../breadcrumbs';
import { navigationPluginMock } from 'src/plugins/navigation/public/mocks';
import { act } from 'react';
import {
  DataConnectionFlow,
  DataConnectionFlowRegistry,
} from '../../data_connection_flow_registry';

jest.mock('../../../../opensearch_dashboards_react/public');
jest.mock('../breadcrumbs');
jest.mock('../data_source_table/data_source_table', () => ({
  DataSourceTableWithRouter: () => <div>DataSourceTableWithRouter</div>,
}));
jest.mock(
  '../direct_query_data_sources_components/direct_query_data_connection/manage_direct_query_data_connections_table',
  () => ({
    ManageDirectQueryDataConnectionsTableWithRouter: () => (
      <div>ManageDirectQueryDataConnectionsTableWithRouter</div>
    ),
  })
);
jest.mock('../create_button', () => ({
  // @ts-expect-error TS7031 TODO(ts-error): fixme
  CreateButton: ({ history, dataTestSubj }) => (
    <button data-test-subj={dataTestSubj} onClick={() => history.push('/create')}>
      Create Data Source
    </button>
  ),
}));

describe('DataSourceHomePanel', () => {
  const mockedContext = {
    services: {
      setBreadcrumbs: jest.fn(),
      notifications: {},
      http: {},
      savedObjects: {},
      uiSettings: {},
      application: { capabilities: { dataSource: { canManage: true } } },
      docLinks: {
        links: {
          opensearchDashboards: {
            dataSource: {
              guide: 'https://opensearch.org/docs/latest/dashboards/discover/multi-data-sources/',
            },
          },
        },
      },
      navigation: navigationPluginMock.createStartContract(),
    },
  };

  beforeAll(() => {
    (useOpenSearchDashboards as jest.Mock).mockReturnValue(mockedContext);
    (getListBreadcrumbs as jest.Mock).mockReturnValue([{ text: 'Data sources' }]);
  });

  const defaultProps: RouteComponentProps & { featureFlagStatus: boolean } = {
    featureFlagStatus: true,
    history: { push: jest.fn() } as any,
    location: {} as any,
    match: {} as any,
  };

  const shallowComponent = (props = defaultProps) =>
    shallow(<DataSourceHomePanel useNewUX={false} {...props} />);
  const mountComponent = (props = defaultProps) =>
    mount(<DataSourceHomePanel useNewUX={false} {...props} />);

  test('renders correctly', () => {
    const wrapper = shallowComponent();
    expect(wrapper).toMatchSnapshot();
  });

  test('renders DataSourceTableWithRouter when manageOpensearchDataSources tab is selected', () => {
    const wrapper = mountComponent();
    wrapper.find(EuiTab).at(0).simulate('click');
    expect(wrapper.find(DataSourceTableWithRouter)).toHaveLength(1);
    expect(wrapper.find(ManageDirectQueryDataConnectionsTableWithRouter)).toHaveLength(0);
  });

  test('renders ManageDirectQueryDataConnectionsTable when manageDirectQueryDataSources tab is selected', () => {
    const wrapper = mountComponent();
    wrapper.find(EuiTab).at(1).simulate('click');
    expect(wrapper.find(ManageDirectQueryDataConnectionsTableWithRouter)).toHaveLength(1);
    expect(wrapper.find(DataSourceTableWithRouter)).toHaveLength(0);
  });

  test('handles tab changes', () => {
    const wrapper = mountComponent();
    expect(wrapper.find(DataSourceTableWithRouter)).toHaveLength(1);
    wrapper.find(EuiTab).at(1).simulate('click');
    expect(wrapper.find(ManageDirectQueryDataConnectionsTableWithRouter)).toHaveLength(1);
  });

  test('does not render any tab when featureFlagStatus is false', () => {
    const wrapper = shallowComponent({ ...defaultProps, featureFlagStatus: false });
    expect(wrapper.find(EuiTab)).toHaveLength(0);
  });

  test('calls history.push when CreateButton is clicked', () => {
    const historyMock = { push: jest.fn() };
    // @ts-expect-error TS2740 TODO(ts-error): fixme
    const wrapper = mountComponent({ ...defaultProps, history: historyMock });
    wrapper.find('button[data-test-subj="createDataSourceButton"]').simulate('click');
    expect(historyMock.push).toHaveBeenCalledWith('/create');
  });

  describe('data connection flows', () => {
    const flowButton = (id: string) => `button[data-test-subj="dataConnectionFlowButton-${id}"]`;
    const createFlow = (overrides: Partial<DataConnectionFlow> = {}): DataConnectionFlow => ({
      id: 'example-flow',
      title: 'Example connections',
      buttonLabel: 'Connect example data connection',
      mount: jest.fn(() => jest.fn()),
      ...overrides,
    });
    const withFlows = (
      flows: DataConnectionFlow[],
      {
        canManage = true,
        dashboards = { isDashboardAdmin: true },
      }: { canManage?: boolean; dashboards?: { isDashboardAdmin?: boolean } | null } = {}
    ) => {
      const registry = new DataConnectionFlowRegistry();
      flows.forEach((flow) => registry.registerDataConnectionFlow(flow));
      const navigation = navigationPluginMock.createStartContract();
      const application = {
        capabilities: { dataSource: { canManage }, ...(dashboards ? { dashboards } : {}) },
        setAppRightControls: jest.fn(),
        setAppDescriptionControls: jest.fn(),
      };
      (useOpenSearchDashboards as jest.Mock).mockReturnValue({
        services: {
          ...mockedContext.services,
          application,
          navigation,
          dataConnectionFlowRegistry: registry,
        },
      });
      return { registry, navigation, application };
    };
    const rightControlsCalls = (navigation: any, application: any) =>
      (navigation.ui.HeaderControl as jest.Mock).mock.calls
        .map(([controlProps]) => controlProps)
        .filter((controlProps) => controlProps.setMountPoint === application.setAppRightControls)
        .map((controlProps) => controlProps.controls);
    const mountAndFlush = async (props: any, useNewUX = false) => {
      let wrapper: any;
      await act(async () => {
        wrapper = mount(<DataSourceHomePanel useNewUX={useNewUX} {...props} />);
      });
      // resolve isVisible promises
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      wrapper.update();
      return wrapper;
    };

    afterEach(() => {
      (useOpenSearchDashboards as jest.Mock).mockReturnValue(mockedContext);
    });

    test('renders a header button for a visible flow on the DQ connections tab', async () => {
      withFlows([createFlow({ isVisible: () => Promise.resolve(true) })]);
      const historyMock = { push: jest.fn() };
      const wrapper = await mountAndFlush({ ...defaultProps, history: historyMock });
      // OpenSearch connections tab is selected by default
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(false);

      wrapper.find(EuiTab).at(1).simulate('click');
      wrapper.update();
      const button = wrapper.find(flowButton('example-flow'));
      expect(button.exists()).toBe(true);
      expect(button.text()).toContain('Connect example data connection');
      button.simulate('click');
      expect(historyMock.push).toHaveBeenCalledWith('/flows/example-flow');
    });

    test('renders flow buttons when the feature flag is disabled (direct query only)', async () => {
      withFlows([createFlow()]);
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(true);
    });

    test('hides the button when isVisible resolves false', async () => {
      withFlows([createFlow({ isVisible: () => Promise.resolve(false) })]);
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(false);
    });

    test('hides the button when isVisible rejects (fail closed)', async () => {
      withFlows([createFlow({ isVisible: () => Promise.reject(new Error('boom')) })]);
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(false);
      expect(wrapper.find('button[data-test-subj="createDataSourceButton"]').exists()).toBe(true);
    });

    test('shows flows to a dashboard admin without canManage, without the generic Create', async () => {
      withFlows([createFlow({ isVisible: () => true })], { canManage: false });
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(true);
      expect(wrapper.find('button[data-test-subj="createDataSourceButton"]').exists()).toBe(false);
    });

    test('hides flows from a non-admin; the generic Create still follows canManage', async () => {
      withFlows([createFlow()], { dashboards: { isDashboardAdmin: false } });
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(false);
      expect(wrapper.find('button[data-test-subj="createDataSourceButton"]').exists()).toBe(true);
    });

    test.each([
      ['no dashboards capability', null],
      ['no isDashboardAdmin', {}],
    ])(
      'hides flows when the admin capability is absent (fail closed): %s',
      async (_, dashboards) => {
        withFlows([createFlow()], { dashboards });
        const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
        expect(wrapper.find(flowButton('example-flow')).exists()).toBe(false);
      }
    );

    test('renders neither flows nor Create for a non-admin without canManage', async () => {
      withFlows([createFlow()], { canManage: false, dashboards: { isDashboardAdmin: false } });
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(false);
      expect(wrapper.find('button[data-test-subj="createDataSourceButton"]').exists()).toBe(false);
    });

    test('adds flow buttons to the HeaderControl in the new UX', async () => {
      const { navigation } = withFlows([createFlow()]);
      const historyMock = { push: jest.fn() };
      const props = { ...defaultProps, featureFlagStatus: false, history: historyMock };
      await mountAndFlush(props, true);
      const HeaderControl = navigation.ui.HeaderControl as jest.Mock;
      const lastRightControls = HeaderControl.mock.calls
        .map(([controlProps]) => controlProps.controls)
        .filter((controls) => controls.some((c: any) => c.id === 'Create data source'))
        .pop();
      expect(lastRightControls.map((c: any) => c.id)).toEqual([
        'dataConnectionFlow-example-flow',
        'Create data source',
      ]);
      lastRightControls[0].run();
      expect(historyMock.push).toHaveBeenCalledWith('/flows/example-flow');
    });

    test('new UX: only flow buttons for a dashboard admin without canManage', async () => {
      const { navigation, application } = withFlows([createFlow()], { canManage: false });
      await mountAndFlush({ ...defaultProps, featureFlagStatus: false }, true);
      const calls = rightControlsCalls(navigation, application);
      expect(calls.pop().map((c: any) => c.id)).toEqual(['dataConnectionFlow-example-flow']);
      expect(calls.flat().some((c: any) => c.id === 'Create data source')).toBe(false);
    });

    test('new UX: only the generic Create for a non-admin with canManage', async () => {
      const { navigation, application } = withFlows([createFlow()], {
        dashboards: { isDashboardAdmin: false },
      });
      await mountAndFlush({ ...defaultProps, featureFlagStatus: false }, true);
      const calls = rightControlsCalls(navigation, application);
      expect(calls.length).toBeGreaterThan(0);
      calls.forEach((controls) =>
        expect(controls.map((c: any) => c.id)).toEqual(['Create data source'])
      );
    });

    test('new UX: no right controls for a non-admin without canManage', async () => {
      const { navigation, application } = withFlows([createFlow()], {
        canManage: false,
        dashboards: { isDashboardAdmin: false },
      });
      await mountAndFlush({ ...defaultProps, featureFlagStatus: false }, true);
      expect(rightControlsCalls(navigation, application)).toEqual([]);
    });

    test('pre-selects the Direct query connections tab from location state', async () => {
      withFlows([createFlow()]);
      const wrapper = await mountAndFlush({
        ...defaultProps,
        location: { state: { selectedTabId: 'manageDirectQueryDataSources' } },
      });
      expect(wrapper.find(ManageDirectQueryDataConnectionsTableWithRouter)).toHaveLength(1);
      expect(wrapper.find(flowButton('example-flow')).exists()).toBe(true);
    });

    test('renders nothing extra when the registry is empty', async () => {
      withFlows([]);
      const wrapper = await mountAndFlush({ ...defaultProps, featureFlagStatus: false });
      expect(wrapper.find('button[data-test-subj^="dataConnectionFlowButton-"]')).toHaveLength(0);
    });
  });
});
