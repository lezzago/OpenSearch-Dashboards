# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenSearch Dashboards is a browser-based data visualization and exploration tool for OpenSearch. It is a large-scale Node.js + React monorepo with a plugin-based architecture. The project was forked from Kibana and adapted for the OpenSearch ecosystem.

## Common Commands

```bash
# Bootstrap (install deps + build internal packages) — run after pulling changes
yarn osd bootstrap

# Start dev server (requires a running OpenSearch instance on localhost:9200)
yarn start

# Run all unit tests
yarn test:jest

# Run a single test file
yarn test:jest path/to/file.test.ts

# Run integration tests
yarn test:jest_integration

# Lint (ESLint + Stylelint)
yarn lint

# Lint with autofix
node scripts/eslint --fix

# Type check
yarn typecheck

# Run Cypress functional tests (no security plugin)
yarn cypress:run-without-security

# Run a specific Cypress test
yarn cypress:run-without-security --spec path/to/test.ts

# Clean build artifacts and node_modules
yarn osd clean

# Accept Core API signature changes after modifying Core public/server APIs
yarn docs:acceptApiChanges

# Start dev server with example plugins loaded
yarn start --run-examples

# Start OpenSearch snapshot for local development
yarn opensearch snapshot

# Pre-commit checks (lint + type check)
node scripts/precommit_hook.js --fix
```

## Architecture

### Monorepo Structure

- **`src/core/`** — Core platform providing HTTP, plugin system, saved objects, logging, config, and both public (browser) and server APIs. Plugins depend on Core's `setup` and `start` contracts.
- **`src/plugins/`** — Built-in plugins (~67). Each plugin has `public/` (React UI) and/or `server/` (Hapi routes) directories.
- **`packages/`** — Internal workspace packages (prefixed `osd-`): optimizer, dev-utils, plugin-helpers, i18n, test utilities, Monaco editor integration, etc.
- **`examples/`** — Example plugins demonstrating plugin development patterns. Load with `yarn start --run-examples`.
- **`test/`** — Test infrastructure: `functional/` (Selenium FTR), `api_integration/`, `plugin_functional/`.
- **`cypress/`** — Cypress end-to-end tests (preferred over Selenium for new tests).

### Plugin System

Every plugin has an `opensearch_dashboards.json` manifest declaring its `id`, `requiredPlugins`, `optionalPlugins`, and whether it has `server`/`ui` sides.

Plugin lifecycle:
1. **`setup(core, deps)`** — Registration phase. Register routes, saved object types, UI applications, and services here.
2. **`start(core, deps)`** — Running phase. Start listeners or expose runtime APIs.
3. **`stop()`** — Cleanup.

Standard plugin file structure:
```
my_plugin/
├── opensearch_dashboards.json    # Manifest
├── public/
│   ├── index.ts                  # Exports plugin initializer + types
│   ├── plugin.ts                 # Plugin class (setup/start/stop)
│   ├── applications/             # UI apps (lazy-loaded via dynamic import)
│   └── services/                 # Client-side services
└── server/
    ├── index.ts                  # Exports plugin + config
    ├── plugin.ts                 # Server plugin class
    ├── routes/                   # HTTP API routes (must start with /api/)
    ├── saved_objects/            # Saved object type definitions + migrations
    └── services/                 # Server-side services
```

Use `core.getStartServices()` in application mount handlers rather than storing `start` references as class fields.

### Key Technologies

- **Frontend:** React 18, React Router 5, Redux, RxJS, EUI/OUI component library
- **Backend:** Node.js 22, Hapi.js
- **Build:** Webpack/Rspack, Babel, `@osd/optimizer`
- **Package manager:** Yarn 1 (workspaces)

## Local Dev Against the Observability Docker Stack

This checkout is run **from source** against a local Docker "observability stack" OpenSearch
cluster (not the Docker OSD — that runs separately on 5601).

- **Node must be 22** (`.nvmrc` pins 22; engine requires `<23`). Run `nvm use 22` before any
  yarn command — the machine default (v24) fails immediately.
- **Start it** with the gitignored helper `./scripts/start-dev.sh`, which exports the env vars
  (OpenSearch creds + CloudWatch STS creds, see below) and then runs
  `yarn start --config config/opensearch_dashboards.dev.yml`.
- **Config** (`config/opensearch_dashboards.dev.yml`, gitignored): OSD serves on `server.port: 5602`
  and points at the cluster at `opensearch.hosts: https://localhost:9200` with the local admin
  credentials (see that file), SSL `verificationMode: none`. `workspace.enabled`,
  `data_source.enabled`, `explore.enabled`, and `query:enhancements:enabled` are on. The cluster
  is an OpenSearch 3.x observability-stack container (from its own docker-compose, separate repo).
- **Basepath rotates per restart.** In dev, a basepath proxy serves on 5602 and forwards to the
  backend on 5603 with a random basepath (e.g. `/eni`, `/zea`). Find the current one by grepping
  the log: `grep "http server running" /tmp/osd-dev.log`. Open **http://localhost:5602/<basepath>**.
- **Discover lives inside a workspace.** Classic Discover is forwarded to the Explore **Logs
  flavor**. The URL is `/<basepath>/w/<workspaceId>/app/explore/logs` — bare `/app/explore/logs`
  gives "Application Not Found". The observability workspace id has been `D7w5QJ`.
- **Bootstrap gotcha:** `yarn osd bootstrap` can fail a `single_version_dependencies` gate on the
  external plugins under `plugins/` (`alerting-dashboards-plugin`, `dashboards-observability`).
  Workaround: move them out of `plugins/` (they're gitignored), bootstrap, move them back.
- Server-side changes require a full **restart** (`./scripts/start-dev.sh`); the optimizer only
  hot-reloads browser bundles.

## CloudWatch Logs PoC

There is an in-progress prototype wiring a virtual **CloudWatch Logs** dataset into
Explore/Logs, so querying it runs a CloudWatch Logs Insights query against a hardcoded AWS
account (`245861583765`). Most code lives in the `query_enhancements` plugin (server client +
search strategy + dataset type + pickers) plus a search-bar edit popover in the `explore` plugin.

- **Source of truth for current state:** `src/plugins/query_enhancements/CLOUDWATCH_POC.md` — a
  living tracking doc covering the architecture, key files, which CloudWatch APIs are called and
  why (DescribeLogGroups, DescribeLogStreams, StartQuery, GetQueryResults), known gaps, and a
  change log. **Read and update that file** when working on CloudWatch.
- **AWS credentials:** read-only, temporary STS session tokens read from the server env
  (`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_SESSION_TOKEN`), set in the gitignored
  `scripts/start-dev.sh`. They expire — if `/api/enhancements/resources` or search calls 503 with
  "security token is expired", the creds need refreshing (ask the user to paste new ones). Never
  commit credentials.

## Code Conventions

- **Filenames:** Always `snake_case` (e.g., `index_pattern.ts`, not `IndexPattern.ts`).
- **Language:** TypeScript for all new code. Avoid `any` (use `unknown` or generics). Avoid non-null assertions (`!.`) and `@ts-ignore`.
- **Exports:** Use named exports, not default exports.
- **Modules:** ES2015 import/export syntax. Only import top-level module APIs, never reach into internal paths.
- **Strings:** Single quotes, 100-char print width, ES5 trailing commas (enforced by Prettier).
- **API routes:** Must start with `/api/`, use `snake_case` for paths, params, and body fields.
- **HTML attributes:** `id` and `data-test-subj` values should be camelCase.
- **SASS:** Import `.scss` files at the top of the component file. Use a 3-letter prefix on class names for scoping (e.g., `plgComponent`).
- **React:** Prefer functional components. Name action props as `on<Subject><Change>`.
- **Saved objects types:** Define in `server/saved_objects/`, one file per type, with migration functions keyed by version.

## Testing Conventions

- **Unit tests** (`*.test.ts`): Jest. Aim for 80%+ coverage (enforced by Codecov). Use react-testing-library for components, not enzyme snapshots.
- **Integration tests** (`**/integration_tests/**/*.test.ts`): Jest, run with `yarn test:jest_integration`.
- **Functional tests**: Cypress (preferred). Selenium is legacy — do not write new Selenium tests.
- **Cypress best practices:** Use `data-test-subj` attributes for selectors. Use `cy.intercept()` instead of hard-coded delays. Always use UTC time.

## Core API Changes

When modifying `src/core/public/` or `src/core/server/` APIs, run `yarn docs:acceptApiChanges` to regenerate API review files, then commit the updated `.api.md` files.

## Pull Request Requirements

- All commits must include a DCO sign-off: `Signed-off-by: Name <email>` (use `git commit -s`).
- PRs must include appropriate test coverage and pass CI checks.
- Do not write new Selenium/FTR tests; use Cypress instead.

## Analyzing CI Failures for a PR

When given a PR link, use this sequence:

```bash
# 1. Get overall check status — tells you which workflows failed
gh pr checks <pr-url>

# 2. Read the bot comment for the structured failure list (fastest path)
gh pr view <pr-url> --comments --json body \
  | jq -r '.[] | select(.body | contains("ci-test-failure-summary")) | .body'

# 3. If you need Cypress failures too (no bot comment for those yet):
gh run list --pr <pr-number> --json databaseId,name,conclusion \
  | jq '.[] | select(.conclusion == "failure")'
gh run download <run-id> -n "cypress-junit-*" --dir cypress-results
node scripts/summarize_jest_failures.js --dir=cypress-results
```

**What the bot comment covers:** Jest unit test failures from `build-test` jobs (all 4 groups, Linux + Windows). Posted automatically by the `pr-test-results-comment` job and updated on every push — including a ✅ green banner when tests recover.

**What requires manual artifact download:** Cypress failures, FTR functional test failures, lint/typecheck failures (those appear only in the step logs — use `gh run view <run-id> --log-failed`).

**FTR Cypress groups 1–9** (`ftr-cypress-junit-*`): test source lives in `opensearch-project/opensearch-dashboards-functional-test`, not this repo — check there if you need to read the test implementation.