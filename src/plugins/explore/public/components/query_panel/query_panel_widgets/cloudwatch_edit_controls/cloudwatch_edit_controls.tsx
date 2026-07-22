/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPopover,
  EuiPopoverFooter,
  EuiPopoverTitle,
  EuiSelectable,
  EuiSelectableOption,
  EuiSpacer,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { HttpSetup } from 'opensearch-dashboards/public';
import { useOpenSearchDashboards } from '../../../../../../opensearch_dashboards_react/public';
import { Dataset } from '../../../../../../data/common';
import { ExploreServices } from '../../../../types';
import { setQueryWithHistory } from '../../../../application/utils/state_management/slices';
import { selectDataset } from '../../../../application/utils/state_management/selectors';
import './cloudwatch_edit_controls.scss';

// CloudWatch PoC constants. Mirrored from query_enhancements/common (the optimizer
// forbids importing another plugin's internals), and coupled only through the stable
// /api/enhancements/resources HTTP contract below.
const CLOUDWATCH_TYPE = 'CLOUDWATCH';
const CLOUDWATCH_CONNECTION_ID = 'cloudwatch-poc';
const CLOUDWATCH_ACCOUNT_ID = '245861583765';
const RESOURCE_TYPE_LOG_GROUPS = 'log_groups';
const RESOURCE_TYPE_LOG_STREAMS = 'log_streams';
// The catch-all pattern the hardcoded "all log groups" dataset stores; treated as a
// distinct UI state ("All log groups" toggle) rather than a normal wildcard token.
const ALL_GROUPS_PATTERN = '*';
const ALL_GROUPS_KEY = '__ALL_LOG_GROUPS__';
const DEFAULT_REGION = 'us-east-1';
// Common AWS regions offered by the selector (mirrors CLOUDWATCH_REGIONS in
// query_enhancements/common, which can't be imported across plugin bundles).
const CLOUDWATCH_REGIONS = [
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-central-1',
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
];

/**
 * Minimal client for the shared /api/enhancements/resources route, dispatched to the
 * CloudWatch manager by connection type. Mirrors CloudWatchResourceClient in
 * query_enhancements/public/resources (which can't be imported across plugin bundles).
 * The region is passed as content so the server targets that region's CloudWatch.
 */
const fetchResource = async (
  http: HttpSetup,
  resourceType: string,
  resourceName: string | undefined,
  region: string
): Promise<string[]> => {
  const response = await http.post('/api/enhancements/resources', {
    body: JSON.stringify({
      connection: { id: CLOUDWATCH_CONNECTION_ID, type: CLOUDWATCH_TYPE },
      resource: { type: resourceType, name: resourceName },
      content: { region },
    }),
  });
  return (response?.data as string[]) ?? [];
};

const isWildcard = (value: string) => value.includes('*');

const shortName = (name: string) => (name.length > 28 ? `…${name.slice(-26)}` : name);

interface CloudWatchMeta {
  logGroups: string[];
  logGroupPatterns: string[];
  logStreams: string[];
  region: string;
}

const readMeta = (dataset: Dataset | undefined): CloudWatchMeta => {
  const meta = (dataset?.dataSource?.meta ?? {}) as {
    logGroups?: string[];
    logGroupPatterns?: string[];
    logStreams?: string[];
    region?: string;
  };
  return {
    logGroups: Array.isArray(meta.logGroups) ? meta.logGroups : [],
    logGroupPatterns: Array.isArray(meta.logGroupPatterns) ? meta.logGroupPatterns : [],
    logStreams: Array.isArray(meta.logStreams) ? meta.logStreams : [],
    region: typeof meta.region === 'string' && meta.region ? meta.region : DEFAULT_REGION,
  };
};

/**
 * Search-bar scope controls for the active CloudWatch dataset, modeled on the
 * "scope prototype": two compact chips — **Log groups** and **Streams** — that each
 * open their own dropdown, instead of a growing row of badges. The Streams chip is
 * subordinate: it is only enabled when exactly one concrete log group is selected
 * (no "All", no wildcard pattern, not multiple groups), since CloudWatch Logs Insights
 * can only meaningfully scope streams within a single group.
 *
 * Renders nothing unless the active dataset is a CloudWatch dataset. Applying a chip's
 * selection writes it back onto the active dataset (setQuery) and re-runs the query.
 */
export const CloudWatchEditControls = () => {
  const { services } = useOpenSearchDashboards<ExploreServices>();
  const dispatch = useDispatch();
  const dataset = useSelector(selectDataset) as Dataset | undefined;
  const http = services?.http;

  const isCloudWatch = dataset?.type === CLOUDWATCH_TYPE;

  const meta = useMemo(() => readMeta(dataset), [dataset]);

  // Whether the active dataset scopes to every log group (stored as the "*" pattern).
  const metaIsAllGroups =
    meta.logGroups.length === 0 &&
    meta.logGroupPatterns.length === 1 &&
    meta.logGroupPatterns[0] === ALL_GROUPS_PATTERN;

  // Primitive "fingerprints" of the meta arrays, so effects can depend on their
  // contents (not the object identity) without complex expressions in deps arrays.
  const metaGroupsKey = meta.logGroups.join(',');
  const metaPatternsKey = meta.logGroupPatterns.join(',');
  const metaStreamsKey = meta.logStreams.join(',');

  // ---- local (uncommitted) selection state, seeded from the dataset meta ----
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [allGroups, setAllGroups] = useState(false);
  const [selGroups, setSelGroups] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);
  const [selStreams, setSelStreams] = useState<string[]>([]);

  const [regionPopoverOpen, setRegionPopoverOpen] = useState(false);
  const [groupPopoverOpen, setGroupPopoverOpen] = useState(false);
  const [streamPopoverOpen, setStreamPopoverOpen] = useState(false);

  const [groupResults, setGroupResults] = useState<string[]>([]);
  const [streamResults, setStreamResults] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState('');
  const [streamSearch, setStreamSearch] = useState('');
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [isLoadingStreams, setIsLoadingStreams] = useState(false);

  // Re-seed local state whenever the active dataset's scope changes.
  useEffect(() => {
    if (metaIsAllGroups) {
      setAllGroups(true);
      setSelGroups([]);
      setPatterns([]);
    } else {
      setAllGroups(false);
      setSelGroups(meta.logGroups);
      setPatterns(meta.logGroupPatterns);
    }
    setSelStreams(meta.logStreams);
    setRegion(meta.region);
    // Depend on the primitive contents, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metaIsAllGroups, metaGroupsKey, metaPatternsKey, metaStreamsKey, meta.region]);

  // Streams can only be scoped when exactly one concrete group is selected.
  const streamsEnabled = !allGroups && patterns.length === 0 && selGroups.length === 1;
  const selGroupsKey = selGroups.join(',');

  // Drop any stale stream selection the moment the group scope stops supporting streams.
  useEffect(() => {
    if (!streamsEnabled && selStreams.length) setSelStreams([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamsEnabled]);

  // Load the account's log groups when the group popover opens.
  useEffect(() => {
    if (!groupPopoverOpen || !http) return;
    let cancelled = false;
    setIsLoadingGroups(true);
    fetchResource(http, RESOURCE_TYPE_LOG_GROUPS, undefined, region)
      .then((groups) => !cancelled && setGroupResults(groups))
      .catch((error) => {
        if (!cancelled) {
          services?.notifications?.toasts.addError(error, {
            title: i18n.translate('explore.cloudwatch.scope.logGroups.loadError', {
              defaultMessage: 'Failed to load CloudWatch log groups',
            }),
          });
        }
      })
      .finally(() => !cancelled && setIsLoadingGroups(false));
    return () => {
      cancelled = true;
    };
  }, [groupPopoverOpen, http, services, region]);

  // Load streams when the stream popover opens (only reachable when exactly one group).
  useEffect(() => {
    if (!streamPopoverOpen || !http || selGroups.length !== 1) return;
    let cancelled = false;
    setIsLoadingStreams(true);
    fetchResource(http, RESOURCE_TYPE_LOG_STREAMS, selGroups[0], region)
      .then((streams) => !cancelled && setStreamResults(streams))
      .catch((error) => {
        if (!cancelled) {
          services?.notifications?.toasts.addError(error, {
            title: i18n.translate('explore.cloudwatch.scope.logStreams.loadError', {
              defaultMessage: 'Failed to load CloudWatch log streams',
            }),
          });
        }
      })
      .finally(() => !cancelled && setIsLoadingStreams(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPopoverOpen, http, selGroupsKey, services, region]);

  // ---- write the current selection back onto the dataset and re-run ----
  const applyScope = useCallback(() => {
    if (!dataset) return;
    const logGroups = allGroups ? [] : selGroups;
    const logGroupPatterns = allGroups ? [ALL_GROUPS_PATTERN] : patterns;
    const logStreams = streamsEnabled ? selStreams : [];

    const {
      data: {
        query: { queryString },
      },
    } = services;

    const updated: Dataset = {
      ...dataset,
      dataSource: {
        ...(dataset.dataSource ?? {
          id: dataset.id,
          title: dataset.title,
          type: dataset.type,
          version: '',
        }),
        meta: {
          ...(dataset.dataSource?.meta ?? {}),
          region,
          logGroups,
          logGroupPatterns,
          logStreams,
        },
      },
    };

    queryString.setQuery({ ...queryString.getQuery(), dataset: updated });
    dispatch(setQueryWithHistory({ ...queryString.getQuery() }));
  }, [
    dataset,
    region,
    allGroups,
    selGroups,
    patterns,
    streamsEnabled,
    selStreams,
    services,
    dispatch,
  ]);

  const applyGroups = useCallback(() => {
    applyScope();
    setGroupPopoverOpen(false);
  }, [applyScope]);

  const applyStreams = useCallback(() => {
    applyScope();
    setStreamPopoverOpen(false);
  }, [applyScope]);

  // Changing region: log groups/streams are region-specific, so reset the scope back to
  // "all log groups" in the new region and re-run immediately (no separate Apply needed).
  const onSelectRegion = useCallback(
    (nextRegion: string) => {
      setRegionPopoverOpen(false);
      if (!dataset || nextRegion === region) return;

      const {
        data: {
          query: { queryString },
        },
      } = services;

      const updated: Dataset = {
        ...dataset,
        dataSource: {
          ...(dataset.dataSource ?? {
            id: dataset.id,
            title: dataset.title,
            type: dataset.type,
            version: '',
          }),
          meta: {
            ...(dataset.dataSource?.meta ?? {}),
            region: nextRegion,
            logGroups: [],
            logGroupPatterns: [ALL_GROUPS_PATTERN],
            logStreams: [],
          },
        },
      };

      queryString.setQuery({ ...queryString.getQuery(), dataset: updated });
      dispatch(setQueryWithHistory({ ...queryString.getQuery() }));
    },
    [dataset, region, services, dispatch]
  );

  // ---- group popover: search + "All" toggle + wildcard patterns + multi-select ----
  const filteredGroups = useMemo(() => {
    const q = groupSearch.replace(/\*/g, '').toLowerCase();
    return groupResults.filter((n) => n.toLowerCase().includes(q));
  }, [groupResults, groupSearch]);

  const groupOptions: EuiSelectableOption[] = useMemo(() => {
    const opts: EuiSelectableOption[] = [
      {
        label: i18n.translate('explore.cloudwatch.scope.allLogGroups', {
          defaultMessage: 'All log groups',
        }),
        key: ALL_GROUPS_KEY,
        checked: allGroups ? 'on' : undefined,
        append: (
          <EuiText size="xs" color="subdued">
            {i18n.translate('explore.cloudwatch.scope.groupCount', {
              defaultMessage: '{count}+ groups',
              values: { count: groupResults.length },
            })}
          </EuiText>
        ),
      },
      ...filteredGroups.map((name) => ({
        label: name,
        key: name,
        checked: (!allGroups && selGroups.includes(name) ? 'on' : undefined) as 'on' | undefined,
      })),
    ];
    return opts;
  }, [filteredGroups, groupResults.length, allGroups, selGroups]);

  // This EUI's EuiSelectable.onChange only passes the full options array (no "changed"
  // arg), so derive the new selection by reading each option's checked state. Only the
  // currently-visible (search-filtered) options are present, so preserve any selected
  // groups that are filtered out of the current view.
  const onGroupOptionsChange = useCallback((newOptions: EuiSelectableOption[]) => {
    const allOpt = newOptions.find((o) => o.key === ALL_GROUPS_KEY);
    const visibleKeys = new Set(
      newOptions.filter((o) => o.key !== ALL_GROUPS_KEY).map((o) => String(o.key))
    );
    const visibleChecked = newOptions
      .filter((o) => o.key !== ALL_GROUPS_KEY && o.checked === 'on')
      .map((o) => String(o.key));

    setSelGroups((prev) => {
      // keep prior selections that are hidden by the current search, add visible checks
      const preservedHidden = prev.filter((g) => !visibleKeys.has(g));
      const next = [...new Set([...preservedHidden, ...visibleChecked])];

      if (next.length > 0) {
        // A concrete group is selected — "All" cannot apply.
        setAllGroups(false);
      } else if (allOpt?.checked === 'on') {
        setAllGroups(true);
        setPatterns([]);
      } else {
        setAllGroups(false);
      }
      return next;
    });
  }, []);

  const addPattern = useCallback(() => {
    const value = groupSearch.trim();
    if (!isWildcard(value)) return;
    setAllGroups(false);
    setPatterns((prev) => [...new Set([...prev, value])]);
    setGroupSearch('');
  }, [groupSearch]);

  const removePattern = useCallback((p: string) => {
    setPatterns((prev) => prev.filter((x) => x !== p));
  }, []);

  const clearGroups = useCallback(() => {
    setAllGroups(false);
    setSelGroups([]);
    setPatterns([]);
  }, []);

  // ---- stream popover: search + multi-select (empty = all streams) ----
  const filteredStreams = useMemo(() => {
    const q = streamSearch.toLowerCase();
    return streamResults.filter((n) => n.toLowerCase().includes(q));
  }, [streamResults, streamSearch]);

  const streamOptions: EuiSelectableOption[] = useMemo(
    () =>
      filteredStreams.map((name) => ({
        label: name,
        key: name,
        checked: (selStreams.includes(name) ? 'on' : undefined) as 'on' | undefined,
      })),
    [filteredStreams, selStreams]
  );

  const onStreamOptionsChange = useCallback((newOptions: EuiSelectableOption[]) => {
    const visibleKeys = new Set(newOptions.map((o) => String(o.key)));
    const visibleChecked = newOptions.filter((o) => o.checked === 'on').map((o) => String(o.key));
    setSelStreams((prev) => {
      const preservedHidden = prev.filter((s) => !visibleKeys.has(s));
      return [...new Set([...preservedHidden, ...visibleChecked])];
    });
  }, []);

  if (!isCloudWatch) return null;

  // ---- compact chip summaries (no growing badge row) ----
  const groupCount = selGroups.length + patterns.length;
  const groupSummary = allGroups
    ? // "All" scope surfaces the AWS account it spans.
      i18n.translate('explore.cloudwatch.scope.chip.allWithAccount', {
        defaultMessage: 'All ({account})',
        values: { account: CLOUDWATCH_ACCOUNT_ID },
      })
    : groupCount === 0
      ? i18n.translate('explore.cloudwatch.scope.chip.select', { defaultMessage: 'Select' })
      : groupCount === 1
        ? shortName(selGroups[0] ?? patterns[0])
        : i18n.translate('explore.cloudwatch.scope.chip.count', {
            defaultMessage: '{count} selected',
            values: { count: groupCount },
          });

  const regionOptions: EuiSelectableOption[] = CLOUDWATCH_REGIONS.map((r) => ({
    label: r,
    key: r,
    checked: (r === region ? 'on' : undefined) as 'on' | undefined,
  }));

  const regionChipButton = (
    <EuiButtonEmpty
      size="xs"
      onClick={() => setRegionPopoverOpen((open) => !open)}
      data-test-subj="cloudwatchRegionChip"
    >
      <div className="exploreCloudWatchScopeControls__buttonTextWrapper">
        <EuiText size="xs">
          {i18n.translate('explore.cloudwatch.scope.regionLabel', {
            defaultMessage: 'Region: {region}',
            values: { region },
          })}
        </EuiText>
        <EuiIcon type="arrowDown" size="s" />
      </div>
    </EuiButtonEmpty>
  );

  const streamSummary = selStreams.length
    ? i18n.translate('explore.cloudwatch.scope.chip.count', {
        defaultMessage: '{count} selected',
        values: { count: selStreams.length },
      })
    : i18n.translate('explore.cloudwatch.scope.chip.all', { defaultMessage: 'All' });

  const groupChipButton = (
    <EuiButtonEmpty
      size="xs"
      onClick={() => setGroupPopoverOpen((open) => !open)}
      data-test-subj="cloudwatchGroupChip"
    >
      <div className="exploreCloudWatchScopeControls__buttonTextWrapper">
        <EuiText size="xs">
          {i18n.translate('explore.cloudwatch.scope.logGroupsLabel', {
            defaultMessage: 'Log groups: {summary}',
            values: { summary: groupSummary },
          })}
        </EuiText>
        <EuiIcon type="arrowDown" size="s" />
      </div>
    </EuiButtonEmpty>
  );

  const streamChipButton = (
    <EuiButtonEmpty
      size="xs"
      isDisabled={!streamsEnabled}
      onClick={() => setStreamPopoverOpen((open) => !open)}
      data-test-subj="cloudwatchStreamChip"
    >
      <div className="exploreCloudWatchScopeControls__buttonTextWrapper">
        <EuiText size="xs">
          {i18n.translate('explore.cloudwatch.scope.streamsLabel', {
            defaultMessage: 'Streams: {summary}',
            values: { summary: streamSummary },
          })}
        </EuiText>
        <EuiIcon type="arrowDown" size="s" />
      </div>
    </EuiButtonEmpty>
  );

  return (
    <div className="exploreCloudWatchScopeControls" data-test-subj="cloudwatchEditControls">
      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
        {/* ---- Region selector (before log groups; groups are region-specific) ---- */}
        <EuiFlexItem grow={false}>
          <EuiPopover
            button={regionChipButton}
            isOpen={regionPopoverOpen}
            closePopover={() => setRegionPopoverOpen(false)}
            anchorPosition="downLeft"
            panelPaddingSize="none"
          >
            <div style={{ width: 240 }}>
              <EuiPopoverTitle paddingSize="s">
                {i18n.translate('explore.cloudwatch.scope.regionTitle', {
                  defaultMessage: 'AWS region',
                })}
              </EuiPopoverTitle>
              <EuiSelectable
                options={regionOptions}
                onChange={(newOptions) => {
                  const picked = newOptions.find((o) => o.checked === 'on');
                  if (picked) onSelectRegion(String(picked.key));
                }}
                singleSelection="always"
                listProps={{ bordered: false, rowHeight: 32 }}
                data-test-subj="cloudwatchRegionSelectable"
              >
                {(list) => <div style={{ maxHeight: 300, overflowY: 'auto' }}>{list}</div>}
              </EuiSelectable>
            </div>
          </EuiPopover>
        </EuiFlexItem>

        {/* ---- Log groups chip ---- */}
        <EuiFlexItem grow={false}>
          <EuiPopover
            button={groupChipButton}
            isOpen={groupPopoverOpen}
            closePopover={() => setGroupPopoverOpen(false)}
            anchorPosition="downLeft"
            panelPaddingSize="none"
          >
            <div style={{ width: 430 }}>
              <EuiPopoverTitle paddingSize="s">
                <EuiFieldSearch
                  compressed
                  fullWidth
                  value={groupSearch}
                  onChange={(e) => setGroupSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addPattern();
                  }}
                  placeholder={i18n.translate(
                    'explore.cloudwatch.scope.logGroups.searchPlaceholder',
                    {
                      defaultMessage: 'Search log groups, or type a pattern like /aws/lambda/*',
                    }
                  )}
                  data-test-subj="cloudwatchGroupSearch"
                />
              </EuiPopoverTitle>

              {/* account + region context */}
              <div style={{ padding: '6px 12px 0' }}>
                <EuiText size="xs" color="subdued" data-test-subj="cloudwatchGroupAccountHeader">
                  {i18n.translate('explore.cloudwatch.scope.accountRegionHeader', {
                    defaultMessage: 'Account {account} · {region}',
                    values: { account: CLOUDWATCH_ACCOUNT_ID, region },
                  })}
                </EuiText>
              </div>

              {/* wildcard "add pattern" affordance */}
              {isWildcard(groupSearch) && (
                <div style={{ padding: '6px 12px' }}>
                  <EuiButtonEmpty
                    size="xs"
                    iconType="plusInCircle"
                    onClick={addPattern}
                    data-test-subj="cloudwatchAddPattern"
                  >
                    {i18n.translate('explore.cloudwatch.scope.addPattern', {
                      defaultMessage: 'Add pattern "{pattern}"',
                      values: { pattern: groupSearch.trim() },
                    })}
                  </EuiButtonEmpty>
                </div>
              )}

              {/* pattern tokens */}
              {patterns.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '4px 12px' }}>
                  {patterns.map((p) => (
                    <EuiBadge
                      key={p}
                      color="hollow"
                      iconType="cross"
                      iconSide="right"
                      iconOnClick={() => removePattern(p)}
                      iconOnClickAriaLabel={i18n.translate(
                        'explore.cloudwatch.scope.removePattern',
                        {
                          defaultMessage: 'Remove pattern',
                        }
                      )}
                    >
                      {p}
                    </EuiBadge>
                  ))}
                </div>
              )}

              <EuiSelectable
                options={groupOptions}
                onChange={onGroupOptionsChange}
                isLoading={isLoadingGroups}
                listProps={{ bordered: false, rowHeight: 32 }}
                data-test-subj="cloudwatchGroupSelectable"
              >
                {(list) => <div style={{ maxHeight: 270, overflowY: 'auto' }}>{list}</div>}
              </EuiSelectable>

              <EuiPopoverFooter paddingSize="s">
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem>
                    <EuiText size="xs" color="subdued">
                      {allGroups
                        ? i18n.translate('explore.cloudwatch.scope.allLogGroups', {
                            defaultMessage: 'All log groups',
                          })
                        : groupCount
                          ? i18n.translate('explore.cloudwatch.scope.chip.count', {
                              defaultMessage: '{count} selected',
                              values: { count: groupCount },
                            })
                          : i18n.translate('explore.cloudwatch.scope.noneSelected', {
                              defaultMessage: 'None selected',
                            })}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="xs"
                      onClick={clearGroups}
                      data-test-subj="cloudwatchClearGroups"
                    >
                      {i18n.translate('explore.cloudwatch.scope.clear', {
                        defaultMessage: 'Clear',
                      })}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      size="s"
                      fill
                      onClick={applyGroups}
                      data-test-subj="cloudwatchApplyGroups"
                    >
                      {i18n.translate('explore.cloudwatch.scope.apply', {
                        defaultMessage: 'Apply',
                      })}
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPopoverFooter>
            </div>
          </EuiPopover>
        </EuiFlexItem>

        {/* ---- Streams chip (disabled unless exactly one concrete group) ---- */}
        <EuiFlexItem grow={false}>
          <EuiPopover
            button={
              streamsEnabled ? (
                streamChipButton
              ) : (
                <EuiToolTip
                  position="bottom"
                  content={i18n.translate('explore.cloudwatch.scope.streamsDisabledTip', {
                    defaultMessage:
                      'Stream filtering is available when exactly one log group is selected.',
                  })}
                >
                  {streamChipButton}
                </EuiToolTip>
              )
            }
            isOpen={streamPopoverOpen}
            closePopover={() => setStreamPopoverOpen(false)}
            anchorPosition="downLeft"
            panelPaddingSize="none"
          >
            <div style={{ width: 390 }}>
              <EuiPopoverTitle paddingSize="s">
                <EuiFieldSearch
                  compressed
                  fullWidth
                  value={streamSearch}
                  onChange={(e) => setStreamSearch(e.target.value)}
                  placeholder={i18n.translate(
                    'explore.cloudwatch.scope.logStreams.searchPlaceholder',
                    {
                      defaultMessage: 'Search streams…',
                    }
                  )}
                  data-test-subj="cloudwatchStreamSearch"
                />
              </EuiPopoverTitle>

              <div style={{ padding: '6px 12px 0' }}>
                <EuiText size="xs" color="subdued">
                  {i18n.translate('explore.cloudwatch.scope.streamsHint', {
                    defaultMessage: 'Streams in {group} · most recent first',
                    values: { group: shortName(selGroups[0] ?? '') },
                  })}
                </EuiText>
              </div>
              <EuiSpacer size="xs" />

              <EuiSelectable
                options={streamOptions}
                onChange={onStreamOptionsChange}
                isLoading={isLoadingStreams}
                listProps={{ bordered: false, rowHeight: 32 }}
                data-test-subj="cloudwatchStreamSelectable"
              >
                {(list) => <div style={{ maxHeight: 270, overflowY: 'auto' }}>{list}</div>}
              </EuiSelectable>

              <EuiPopoverFooter paddingSize="s">
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem>
                    <EuiText size="xs" color="subdued">
                      {selStreams.length
                        ? i18n.translate('explore.cloudwatch.scope.chip.count', {
                            defaultMessage: '{count} selected',
                            values: { count: selStreams.length },
                          })
                        : i18n.translate('explore.cloudwatch.scope.allStreams', {
                            defaultMessage: 'All streams',
                          })}
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty
                      size="xs"
                      onClick={() => setSelStreams([])}
                      data-test-subj="cloudwatchResetStreams"
                    >
                      {i18n.translate('explore.cloudwatch.scope.resetToAll', {
                        defaultMessage: 'Reset to All',
                      })}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiButton
                      size="s"
                      fill
                      onClick={applyStreams}
                      data-test-subj="cloudwatchApplyStreams"
                    >
                      {i18n.translate('explore.cloudwatch.scope.apply', {
                        defaultMessage: 'Apply',
                      })}
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiPopoverFooter>
            </div>
          </EuiPopover>
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
