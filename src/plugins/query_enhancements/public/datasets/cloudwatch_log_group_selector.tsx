/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { EuiComboBox, EuiComboBoxOptionOption, EuiFormRow, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import {
  DATA_STRUCTURE_META_TYPES,
  DataStructure,
  DataStructureCreatorProps,
} from '../../../data/common';
import { IDataPluginServices } from '../../../data/public';
import { CLOUDWATCH_POC, DATASET } from '../../common';
import { CloudWatchResourceClient } from '../resources';

interface CloudWatchLogGroupSelectorProps extends DataStructureCreatorProps {
  services?: IDataPluginServices;
}

type Option = EuiComboBoxOptionOption<string>;

const isWildcard = (value: string) => value.includes('*');

/**
 * Custom dataset-picker column for CloudWatch. Lets the user multi-select log groups
 * from the account AND type wildcard patterns (e.g. "/aws/lambda/*"). The chosen groups
 * and patterns are folded into a single DataStructure whose meta the CloudWatch dataset
 * type reads in toDataset — so the log-group selection becomes part of the dataset.
 */
export const CloudWatchLogGroupSelector: React.FC<CloudWatchLogGroupSelectorProps> = ({
  path,
  index,
  selectDataStructure,
  services,
}) => {
  const [options, setOptions] = useState<Option[]>([]);
  const [selected, setSelected] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const client = useMemo(() => {
    if (!services?.http) return undefined;
    return new CloudWatchResourceClient(services.http);
  }, [services]);

  // Load the available log groups for the account once.
  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    setIsLoading(true);
    client
      .getLogGroups(CLOUDWATCH_POC.CONNECTION_ID)
      .then((groups) => {
        if (!cancelled) {
          setOptions(groups.map((name) => ({ label: name, value: name })));
        }
      })
      .catch((error) => {
        if (!cancelled) {
          services?.notifications?.toasts.addError(error, {
            title: i18n.translate('queryEnhancements.cloudwatch.logGroups.loadError', {
              defaultMessage: 'Failed to load CloudWatch log groups',
            }),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, services]);

  // Fold the current selection into a combined DataStructure and hand it to the explorer.
  const emitSelection = useCallback(
    (next: Option[]) => {
      if (next.length === 0) {
        selectDataStructure(undefined, path.slice(0, index + 1));
        return;
      }

      const values = next.map((o) => o.value ?? o.label);
      const exactGroups = values.filter((v) => !isWildcard(v));
      const patterns = values.filter((v) => isWildcard(v));

      const combined: DataStructure = {
        id: `${CLOUDWATCH_POC.CONNECTION_ID}::${values.join(',')}`,
        title: values.join(', '),
        type: DATASET.CLOUDWATCH,
        meta: {
          type: DATA_STRUCTURE_META_TYPES.CUSTOM,
          accountId: CLOUDWATCH_POC.ACCOUNT_ID,
          logGroups: exactGroups,
          logGroupPatterns: patterns,
        } as DataStructure['meta'],
      };

      selectDataStructure(combined, path.slice(0, index + 1));
    },
    [path, index, selectDataStructure]
  );

  const onChange = useCallback(
    (next: Option[]) => {
      setSelected(next);
      emitSelection(next);
    },
    [emitSelection]
  );

  // Accept a typed value that isn't in the list as a wildcard/custom log-group entry.
  const onCreateOption = useCallback(
    (searchValue: string) => {
      const value = searchValue.trim();
      if (!value) return;
      const next = [...selected, { label: value, value }];
      setSelected(next);
      emitSelection(next);
    },
    [selected, emitSelection]
  );

  return (
    <div className="cloudwatchLogGroupSelector" data-test-subj="cloudwatchLogGroupSelector">
      <EuiFormRow
        label={i18n.translate('queryEnhancements.cloudwatch.logGroups.label', {
          defaultMessage: 'Log groups',
        })}
        helpText={i18n.translate('queryEnhancements.cloudwatch.logGroups.help', {
          defaultMessage:
            'Select one or more log groups, or type a wildcard pattern such as /aws/lambda/* and press Enter.',
        })}
        fullWidth
      >
        <EuiComboBox
          fullWidth
          isLoading={isLoading}
          placeholder={i18n.translate('queryEnhancements.cloudwatch.logGroups.placeholder', {
            defaultMessage: 'Select or type log group(s)',
          })}
          options={options}
          selectedOptions={selected}
          onChange={onChange}
          onCreateOption={onCreateOption}
          data-test-subj="cloudwatchLogGroupComboBox"
        />
      </EuiFormRow>
      <EuiSpacer size="s" />
      <EuiText size="xs" color="subdued">
        {i18n.translate('queryEnhancements.cloudwatch.logGroups.accountNote', {
          defaultMessage: 'Account {accountId}',
          values: { accountId: CLOUDWATCH_POC.ACCOUNT_ID },
        })}
      </EuiText>
    </div>
  );
};
