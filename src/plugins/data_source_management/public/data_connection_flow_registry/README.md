# Data connection flows

A data connection flow is a plugin-provided "connect a data source" experience that the data
sources management app renders for it. Core stays source-agnostic: it provides a header button,
routes and a container, and links the connections a flow owns to the flow's manage page. The
plugin owns the UI, its API calls and any credentials; core never sees or stores credentials.

Contract version: `DATA_CONNECTION_FLOW_CONTRACT_VERSION` (currently `1`), also exposed as
`dataConnectionFlowContractVersion` on the setup contract. It is bumped on breaking contract
changes only; adding an optional field does not bump it.

## Registering a flow

Call `dataSourceManagement.registerDataConnectionFlow(flow)` during your plugin's `setup`.
Registering after data source management has started throws, as do an invalid or duplicate `id`
and a missing `mount`.

| Field            | Required | Meaning                                                                                                                          |
| ---------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | yes      | Unique id used in the URL. Must match `/^[A-Za-z0-9_.-]+$/`.                                                                     |
| `title`          | yes      | Display name of the flow (e.g. in the "Could not load ..." error toast).                                                         |
| `buttonLabel`    | yes      | Label of the header button on the Direct query connections tab.                                                                  |
| `description`    | no       | Short description. Informational; core does not render it.                                                                       |
| `typeLabel`      | no       | Shown in the Type column for owned connections instead of the stored `attributes.type` (which is never changed).                 |
| `isVisible`      | no       | `() => boolean \| Promise<boolean>`. Defaults to visible.                                                                        |
| `mount`          | yes      | `(params) => unmount` (or a promise of it). Renders into `params.element`.                                                       |
| `ownsConnection` | no       | `(savedObject) => boolean`. Whether a `data-connection` saved object (`id`, `attributes`, `workspaces`) is managed by this flow. |

`mount` receives `element`, `path` (the sub-path after `/flows/<id>`: `''` or
`'/manage/<savedObjectId>'`), `navigate(subPath)`, `navigateToList()` (back to the Direct query
connections tab) and `core` (core start services). The flow is re-mounted when the sub-path changes
and unmounted when the route is left.

## When flows are shown

A flow is shown only to dashboard admins (`capabilities.dashboards.isDashboardAdmin === true`) and
only when its `isVisible()` resolves `true`. This is independent of `dataSource.canManage`, which
keeps gating the generic Create button and the `/create` and `/configure/*` routes.

Fail closed:

- A missing admin capability hides all flows: no button, no `/flows` routes, no row links.
- `isVisible` returning anything other than `true`, rejecting or throwing hides the flow; its
  routes show a "not available" message.
- A throwing `ownsConnection` is treated as "not owned".

## Routes

- `/flows/<id>`: the flow's create page (`path === ''`).
- `/flows/<id>/manage/<savedObjectId>`: the flow's manage page. Rows of the Direct query
  connections table that the flow owns link here, use `typeLabel`, and list their workspaces.

Path helpers: `getDataConnectionFlowPath`, `getDataConnectionFlowManagePath` and
`parseDataConnectionFlowPath` in `components/data_connection_flow`.
