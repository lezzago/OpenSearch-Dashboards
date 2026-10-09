/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { CoreStart } from 'src/core/public';

/**
 * Version of the data connection flow contract ({@link DataConnectionFlow},
 * {@link DataConnectionFlowMountParams} and {@link DataConnectionFlowSavedObject}). Bumped on
 * breaking contract changes only; adding an optional field does not bump it. See README.md.
 */
export const DATA_CONNECTION_FLOW_CONTRACT_VERSION = 1;

/**
 * Minimal structural view of a `data-connection` saved object that is handed to
 * {@link DataConnectionFlow.ownsConnection}.
 */
export interface DataConnectionFlowSavedObject {
  /** Saved object id. */
  id: string;
  /** Saved object attributes, passed through unchanged. */
  attributes: Record<string, any>;
  /** Workspace ids the saved object belongs to, if any. */
  workspaces?: string[];
}

export interface DataConnectionFlowMountParams {
  /** Container the flow renders into. */
  element: HTMLElement;
  /** Sub-path after `/flows/<id>`, e.g. `''` (create page) or `'/manage/<savedObjectId>'`. */
  path: string;
  /** Navigate within the flow. `''` is the create page, `'/manage/<id>'` a manage page. */
  navigate: (subPath: string) => void;
  /** Navigate back to the Direct query connections tab of the data sources app. */
  navigateToList: () => void;
  /** Core start services of the data sources app. */
  core: CoreStart;
}

/**
 * A pluggable "connect a data source" experience that is rendered inside the
 * data sources management app under `/flows/<id>`. Shown to dashboard admins only, and only when
 * {@link DataConnectionFlow.isVisible} resolves true. See README.md.
 */
export interface DataConnectionFlow {
  /** Unique id, used in the URL (`/flows/<id>`). */
  id: string;
  /** Display name of the flow, e.g. in the "Could not load <title>" error toast. */
  title: string;
  /** Label of the header button rendered on the Direct query connections tab. */
  buttonLabel: string;
  /** Optional short description of the flow. Informational; core does not render it. */
  description?: string;
  /**
   * Label shown in the Type column of the Direct query connections table for the connections this
   * flow owns (see `ownsConnection`), e.g. a more specific product name. Optional: without it (or
   * when blank) the row shows the stored `attributes.type`. The stored value itself is never changed.
   */
  typeLabel?: string;
  /**
   * Whether the flow is offered. Defaults to visible. Anything other than `true` (including a
   * rejected promise or a thrown error) hides the flow (fail closed).
   */
  isVisible?: () => Promise<boolean> | boolean;
  /**
   * Renders the flow into `params.element` and returns an unmount callback. The flow owns its UI,
   * API calls and any credentials; core only provides the container and navigation.
   */
  mount: (params: DataConnectionFlowMountParams) => (() => void) | Promise<() => void>;
  /**
   * Whether the given `data-connection` saved object is managed by this flow. Owned rows in the
   * Direct query connections table link to `/flows/<id>/manage/<savedObjectId>`. A throwing
   * predicate is treated as "not owned".
   */
  ownsConnection?: (savedObject: DataConnectionFlowSavedObject) => boolean;
}

export type IDataConnectionFlowRegistry = Omit<
  DataConnectionFlowRegistry,
  'registerDataConnectionFlow'
>;

const FLOW_ID_PATTERN = /^[A-Za-z0-9_.-]+$/;

export class DataConnectionFlowRegistry {
  private readonly flows = new Map<string, DataConnectionFlow>();

  /**
   * Register a data connection flow. A flow id can only be registered once; subsequent
   * calls with the same id will throw an error.
   */
  public registerDataConnectionFlow(flow: DataConnectionFlow) {
    if (!flow || typeof flow.id !== 'string' || !FLOW_ID_PATTERN.test(flow.id)) {
      throw new Error(
        `Data connection flow id '${flow?.id}' is invalid; it must match ${FLOW_ID_PATTERN}`
      );
    }
    if (typeof flow.mount !== 'function') {
      throw new Error(`Data connection flow '${flow.id}' must provide a mount function`);
    }
    if (this.flows.has(flow.id)) {
      throw new Error(`Data connection flow '${flow.id}' is already registered`);
    }
    this.flows.set(flow.id, Object.freeze({ ...flow }));
  }

  public hasFlows() {
    return this.flows.size > 0;
  }

  public getAllFlows() {
    return [...this.flows.values()];
  }

  public getFlow(id: string) {
    return this.flows.get(id);
  }

  /**
   * Returns the first registered flow that owns the given saved object, if any. A throwing
   * `ownsConnection` is treated as "not owned".
   */
  public findOwningFlow(savedObject: DataConnectionFlowSavedObject) {
    return findOwningDataConnectionFlow(this.getAllFlows(), savedObject);
  }
}

/**
 * Returns the first of the given flows that owns the given saved object, if any. A throwing
 * `ownsConnection` is treated as "not owned".
 */
export const findOwningDataConnectionFlow = (
  flows: DataConnectionFlow[],
  savedObject: DataConnectionFlowSavedObject
): DataConnectionFlow | undefined => {
  for (const flow of flows) {
    if (!flow.ownsConnection) continue;
    try {
      if (flow.ownsConnection(savedObject) === true) {
        return flow;
      }
    } catch (e) {
      // fail closed: a broken predicate never claims a connection
    }
  }
  return undefined;
};

/**
 * Resolves a flow's visibility. Missing `isVisible` means visible; any error or rejection means
 * hidden.
 */
export const isDataConnectionFlowVisible = async (flow: DataConnectionFlow): Promise<boolean> => {
  if (!flow.isVisible) {
    return true;
  }
  try {
    return (await flow.isVisible()) === true;
  } catch (e) {
    return false;
  }
};

/**
 * Resolves the visibility of all given flows and returns the visible ones, preserving order.
 */
export const getVisibleDataConnectionFlows = async (
  flows: DataConnectionFlow[]
): Promise<DataConnectionFlow[]> => {
  const visibility = await Promise.all(flows.map(isDataConnectionFlowVisible));
  return flows.filter((_, i) => visibility[i]);
};
