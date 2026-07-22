<!--
  CloudWatch Discover/Explore PoC — living status doc.
  This is prototype tracking, not product docs. Update it as the PoC iterates.
  Last updated: 2026-07-21b
-->

# CloudWatch Logs PoC — Status & Tracking

Prototype wiring a virtual **CloudWatch Logs** dataset into the Explore/Logs (Discover)
page. Querying it runs a CloudWatch Logs **Insights** query server-side against a hardcoded
account. This file tracks what's built, which CloudWatch APIs are called and why, and the
known gaps — so the current state is legible as the PoC iterates.

- **Account (hardcoded):** `245861583765`, region from env (`AWS_REGION`, default `us-east-1`).
- **Credentials:** read-only STS session tokens from the server env (`AWS_ACCESS_KEY_ID`,
  `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`), supplied via the gitignored
  `scripts/start-dev.sh`. They expire — refresh when resource/search calls start 503'ing with
  "security token is expired". Server-side changes require an OSD restart (optimizer only
  hot-reloads browser bundles).

---

## Architecture at a glance

Browser never calls AWS directly. It hits two OSD server routes, which call the AWS SDK.

```
UI (explore + query_enhancements public)
  │
  ├─ log-group / log-stream pickers ── POST /api/enhancements/resources ──┐
  │                                                                       │
  └─ run query ── cloudwatchlogs search strategy ────────────────────────┤
                                                                          ▼
                                              server/connections/clients/cloudwatch_logs_client.ts
                                                          │  (@aws-sdk/client-cloudwatch-logs)
                                                          ▼
                                                   AWS CloudWatch Logs
```

### Key files

| File | Role |
|---|---|
| `server/connections/clients/cloudwatch_logs_client.ts` | **All AWS SDK calls.** Client singleton + the 4 API wrappers + wildcard resolution + Insights poll loop. |
| `server/connections/managers/cloudwatch_manager.ts` | Dispatches `/api/enhancements/resources` requests (`log_groups`, `log_streams`) to the client. |
| `server/search/cloudwatch_logs_search_strategy.ts` | `cloudwatchlogs` search strategy: reads dataset meta, resolves groups, injects stream filter, runs Insights, builds the DataFrame. |
| `public/datasets/cloudwatch_type.ts` | Dataset type config: `toDataset`, `fetch` (returns a hardcoded "all log groups" child for the flat picker AND the `DataStructureCreator` for the advanced flow), fields, search strategy mapping. |
| `public/datasets/cloudwatch_log_group_selector.tsx` | Log-group multi-select + wildcard picker used in the dataset-picker "Create dataset" flow. |
| `public/resources/cloudwatch_resource_client.ts` | Thin client for `/api/enhancements/resources` (`getLogGroups`, `getLogStreams`). |
| `public/search/cloudwatch_logs_search_interceptor.ts` | Wires the CloudWatch language to the `cloudwatchlogs` strategy. |
| `../explore/.../query_panel_widgets/cloudwatch_edit_controls/` | **Search-bar scope chips** (in the `explore` plugin): two compact `EuiPopover` chips — **Log groups** and **Streams** — that edit the active dataset's scope in place. Streams chip is disabled unless exactly one concrete group is selected. Inlines its own `fetchResource()` because the optimizer forbids importing `query_enhancements` internals across bundles. |

---

## CloudWatch APIs in use

Single SDK package: **`@aws-sdk/client-cloudwatch-logs`** (CloudWatch **Logs** only — not the
metrics/alarms `@aws-sdk/client-cloudwatch` API). Auth via `@aws-sdk/client-sts` +
`@aws-sdk/credential-provider-node`.

| API | Wrapper fn | Called for | Notes / caps |
|---|---|---|---|
| **DescribeLogGroups** | `describeLogGroups(prefix?)` | Populating the log-group combo boxes (picker + edit popover); also wildcard pattern expansion via `resolveLogGroupPatterns`. | `limit: 50`/page, follows `nextToken`. **Capped at `MAX_PAGES = 5` → 250 groups max.** `logGroupNamePrefix` supported but **UI never sends a prefix** today. |
| **DescribeLogStreams** | `describeLogStreams(logGroupName, prefix?)` | Log-stream combo box in the edit popover. Fetched only when exactly **one concrete group** is selected. | `limit: 50`, single page (no pagination). Ordered by `LastEventTime` desc unless a prefix is given. |
| **StartQuery** | `runInsightsQuery(...)` | Running a query (search strategy). Starts the Insights query. | `logGroupNames` **hard-capped at 50 by AWS**; strategy caps at `MAX_LOG_GROUPS = 50` and truncates. Time window from the global time picker. Default limit 1000. |
| **GetQueryResults** | `runInsightsQuery(...)` poll loop | Fetching Insights results after StartQuery. | Polled server-side up to `MAX_POLLS = 60` at 1s intervals (~60s ceiling). Synchronous to the UI. |

### How the query is built
- Empty query box → `DEFAULT_INSIGHTS_QUERY` (`fields @timestamp, @message, @logStream | sort @timestamp desc | limit 1000`).
- Selected log streams → `applyStreamFilter` injects `filter @logStream in ["a","b"]` after a
  leading `fields` command (else prepends). Empty list = all streams. Best-effort across all
  selected groups (Insights has no per-group stream scoping).

---

## Current gaps

### A. Within the Logs Insights approach (robustness / correctness)
1. **DescribeLogGroups capped at 250 (`MAX_PAGES = 5`), silently.** This is *our* guardrail, not
   an AWS limit — the API paginates unbounded via `nextToken`. Accounts with >250 groups see an
   incomplete picker with no warning. **Same function backs wildcard resolution**, so wildcard
   matches beyond 250 are silently dropped at query time (correctness bug, not just UX).
2. **UI sends no prefix / no type-ahead.** Combo boxes fetch once with no prefix and filter
   client-side only. The server + `getLogGroups(id, prefix)` already support
   `logGroupNamePrefix`; it's just not wired to `onSearchChange`. Wiring it would make the 250
   cap irrelevant for browsing.
3. **StartQuery 50-group cap truncates silently** (only a server log line, no UI toast).
4. **Wildcard resolution re-lists groups on every query** (uncached DescribeLogGroups per pattern).
5. **Stream filter is text injection**, not native scoping — can interact oddly with a
   user-authored query that already touches `@logStream`. No validation.
6. **Synchronous 60s server-side polling**, no cancellation (see B: StopQuery).
7. **DescribeLogStreams: single group only, 50 streams, no pagination.**

### B. Missing CloudWatch Logs APIs (not yet built)
- **GetLogEvents / FilterLogEvents** — raw event "tail a stream" view; today everything routes through Insights.
- **StopQuery** — no cancel for an in-flight Insights query.
- **GetLogGroupFields** — could replace the hardcoded field list in `cloudwatch_type.ts`.
- **DescribeQueries** / result caching — no query history or reuse.

### C. Missing service families (out of current scope)
- **CloudWatch Metrics** (`@aws-sdk/client-cloudwatch`): GetMetricData, ListMetrics, etc. — needed for a Metrics flavor.
- **CloudWatch Alarms**: DescribeAlarms, etc.
- **Cross-account / cross-region**: hardcoded to one account/region; no STS role assumption despite the STS dep.

---

## Verification status (2026-07-16)

- Lint + typecheck clean on changed files (repo has unrelated pre-existing rootDir/scss noise).
- `applyStreamFilter` unit-checked via standalone script (all branches incl. quote-escaping).
- **Live end-to-end (fresh STS creds):** Create dataset → CloudWatch → real groups loaded → 1,000
  hits of real audit-log rows over 30d. Edit popover: 7 real streams loaded for a single group →
  selected one → Apply → all rendered rows belonged to that stream; server logged
  `querying 1 log group(s) [1 stream(s)]`. Swapped group + cleared streams → results changed,
  server logged `querying 1 log group(s)`.

---

## Change log
- **2026-07-21c** — Restyled the three scope chips (Region / Log groups / Streams) to match the
  **Recent queries / Saved queries** buttons: `EuiButtonEmpty size="xs"` wrapping a flex div with
  the shared `exploreQueryPanelButton` mixin (`__buttonTextWrapper`, `gap: $ouiSizeXS`), an
  `EuiText size="xs"` label, and a trailing `arrowDown` `EuiIcon size="s"`. Dropped the custom
  `<strong>`/`<span>` weights so font + sizing match the sibling buttons. New scss:
  `cloudwatch_edit_controls.scss` (`@import "../../shared"`).
- **2026-07-21b** — Added a **region selector** and surfaced the **AWS account number**.
  - Region is now a **third chip** ("Region: <region>") placed **before** the Log groups chip.
    Picking a region resets scope to "all log groups" in the new region and re-runs immediately
    (groups are region-specific). Region list = `CLOUDWATCH_REGIONS` (common 10) in
    `common/constants.ts`, mirrored as a local const in the explore component (no cross-bundle import).
  - **Fully functional server-side:** region is stored on `dataSource.meta.region`
    (`DataSourceMeta.region` added in `data/common/datasets/types.ts`) and threaded end-to-end.
    The client changed from a single cached singleton to **per-region caching**
    (`clientsByRegion` map); `getCloudWatchLogsClient(region, logger)` and all four wrappers
    (`describeLogGroups`, `resolveLogGroupPatterns`, `describeLogStreams`, `runInsightsQuery`) take
    an optional `region`. The resources route already allows arbitrary `content`, so the UI passes
    `content.region`; `cloudwatch_manager.ts` reads it. The search strategy reads `meta.region` and
    passes it to pattern-resolution + `runInsightsQuery`; log line now includes the region.
    `cloudwatch_type.ts` `toDataset` + the hardcoded all-groups child seed `region` (default
    `us-east-1`). Precedence: UI region → `AWS_REGION`/`AWS_DEFAULT_REGION` → PoC default.
  - **Account number** shows in the group chip for the All scope ("Log groups: All (245861583765)")
    and in the group popover header ("Account 245861583765 · <region>").
- **2026-07-21** — Redesigned the search-bar scope controls (`cloudwatch_edit_controls.tsx`) from
  a single "Select log groups" popover + growing badge row into **two compact chips** (idea from
  `~/Downloads/cloudwatchscopeprototype.html`, built with native EUI — `EuiPopover` +
  `EuiSelectable` + `EuiFieldSearch`, not the prototype's raw HTML): **"Log groups: <summary>"**
  and **"Streams: <summary>"**. Chips summarize as `All` / `Select` / `<name>` / `N selected` and
  don't expand. The **Streams chip is disabled** (with an `EuiToolTip` explaining why) unless
  exactly one concrete log group is selected — no "All", no wildcard pattern, not multiple groups —
  and a stale stream selection is auto-cleared when scope stops being a single group. The group
  popover has a pinned "All log groups" toggle, wildcard "Add pattern" affordance, pattern token
  badges, and multi-select; each popover has its own Apply that writes meta + re-runs.
  **GOTCHA:** this EUI's `EuiSelectable.onChange` passes only `(options)` — no `changed` arg — so
  the handlers derive selection by reading each option's `checked` and preserve selections hidden
  by the active search filter. Verified live: All→disabled streams; pick one group→streams enable
  + real streams load; pick a stream→Apply writes `logStreams`; add 2nd group→streams disable +
  clear.
- **2026-07-17** — Hardcoded "CloudWatch (all log groups)" dataset now appears **directly in the
  flat dataset picker** (no advanced flow needed). Implemented by returning one hardcoded child
  from `cloudwatch_type.ts` `fetch()` with `logGroupPatterns: ['*']` (`children` feeds the flat
  picker; `DataStructureCreator` still drives the advanced flow — the two don't collide because
  the advanced explorer prefers the creator). `toDataset` gives the `*`-only case a friendly
  title ("CloudWatch (all log groups)"). The search-bar button was renamed **"Select log groups"**
  (same `cloudwatch_edit_controls` popover, now also the entry point for the all-groups dataset);
  chips show "All log groups" for the `*` case. No server change — the existing
  `resolveLogGroupPatterns('*')` matches all groups (prefix=undefined, regex `^.*$`), subject to
  the documented 250-group `DescribeLogGroups` cap. `dataset_change_middleware` auto-caches the
  non-index dataset on select, so query execution works from the flat picker. Verified live:
  picker shows the dataset → select → 1,000 hits over 7d → "Select log groups" popover loads real
  groups/streams → narrowing + Apply rewrites meta (`*` → concrete groups + stream) and re-runs.
- **2026-07-16** — Search-bar quick-edit popover added (`cloudwatch_edit_controls`); log streams
  restored end-to-end (`logStreams` meta + `applyStreamFilter`). Verified live.
- **2026-07-15** — Log groups moved into the dataset (picker "Create dataset" flow, multi-select +
  wildcards); search-bar group/stream dropdowns removed. Statistics/Visualization tabs fixed
  (`schema` in DataFrame; `cacheKey != null` guard in `useTabResults`). Initial server-side
  implementation + browser verification.
