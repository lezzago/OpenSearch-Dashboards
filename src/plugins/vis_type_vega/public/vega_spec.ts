/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { get, isEmpty, cloneDeep } from 'lodash';
import { i18n } from '@osd/i18n';
import {
  ExecutionContext,
  ExpressionFunctionDefinition,
  OpenSearchDashboardsDatatable,
  Render,
} from '../../expressions/public';
import { VegaVisualizationDependencies } from './plugin';
import { AugmentVisFields, Annotation } from '../../visualizations/public';
import { VegaSpec } from './data_model/types';
// import { createVegaRequestHandler } from './vega_request_handler';
// import { VegaInspectorAdapters } from './vega_inspector/index';
// import { TimeRange, Query } from '../../data/public';
// import { VegaParser } from './data_model/vega_parser';

type Input = OpenSearchDashboardsDatatable;
type Output = Promise<string>;

interface Arguments {
  augmentVisFields: string | null;
}

export type VegaSpecExpressionFunctionDefinition = ExpressionFunctionDefinition<
  'vega_spec',
  Input,
  Arguments,
  Output
  //ExecutionContext<unknown, VegaInspectorAdapters>
>;

/**
 * TODO: this fn is using the raw datatable and not taking into account other
 * vis-related config (like a disabled metric/row, setting explicit timerange, etc).
 * In the old vislib workflow, this was handled by (1) creating dimensions in build_pipeline, and
 * (2) converting the tabular data using vis params + dimensions in vis_type_vislib_vis_fn.
 * We will need to do similar transformations either within here, or somewhere else in
 * the render workflow.
 */
const createSpecFromDatatable = (datatable: OpenSearchDashboardsDatatable): object => {
  // TODO: we can try to use VegaSpec type but it is currently very outdated, where many
  // of the fields and sub-fields don't have other optional params that we want for customizing.
  // For now, we make this more loosely-typed by just specifying it as a generic object.
  let spec = {} as any;
  //let spec = {} as VegaSpec;

  // TODO: update this to v5 when available
  spec.$schema = 'https://vega.github.io/schema/vega-lite/v4.json';
  spec.data = {
    values: datatable.rows,
  };
  spec.config = {
    view: {
      stroke: null,
    },
    concat: {
      spacing: 0,
    },
    // the circle timeline representing annotations
    circle: {
      color: 'blue',
    },
    // the vertical line when user hovers over an annotation circle
    rule: {
      color: 'red',
    },
  };

  // assuming the first column in the datatable represents the x-axis / the time-related field.
  // need to confirm if that's always the case or not
  spec.layer = [] as any[];
  const xAxis = datatable.columns[0];
  datatable.columns.forEach((column, index) => {
    if (index !== 0) {
      spec.layer.push({
        mark: 'line',
        encoding: {
          x: {
            axis: {
              title: xAxis.name,
              grid: false,
              ticks: false,
              labels: false,
            },
            field: xAxis.id,
            type: 'temporal',
          },
          y: {
            axis: {
              title: column.name,
              grid: false,
            },
            field: column.id,
            type: 'quantitative',
          },
        },
      });
    }
  });

  return spec;
};

/**
 * Adding annotations into the correct x-axis key (the time bucket)
 * based on the table. As of now only annotations are supported
 */
const augmentTable = (
  datatable: OpenSearchDashboardsDatatable,
  augmentVisFields: AugmentVisFields
): OpenSearchDashboardsDatatable => {
  let augmentedTable = cloneDeep(datatable);

  // assuming the first column in the datatable represents the x-axis / the time-related field.
  // need to confirm if that's always the case or not
  const xAxis = datatable.columns[0];
  const annotations = augmentVisFields.annotations;

  // Uncomment below to test with alert annotations as well
  // const annotations = get(augmentVisFields, 'annotations', []) as Annotation[];
  // annotations.push({
  //   name: 'alert',
  //   timestamps: [665458100000],
  // } as Annotation);

  if (annotations !== undefined && !isEmpty(annotations)) {
    annotations.every((annotation) => {
      // TODO: how to persist an ID? can we re-use name field?
      const annotationId = annotation.name + '-annotation-id';
      augmentedTable.columns.push({
        id: annotationId,
        name: annotation.name,
      });

      // special case: no rows
      if (augmentedTable.rows.length == 0) {
        return false;
      }

      // special case: only one row - put all timestamps for this annotation
      // in the one bucket and iterate to the next one
      if (augmentedTable.rows.length == 1) {
        augmentedTable.rows[0] = {
          ...augmentedTable.rows[0],
          annotationId: annotation.timestamps.length,
        };
        return false;
      }

      // Bin the timestamps to the closest x-axis key, adding
      // an entry for this annotation ID.
      let rowIndex = 0;
      const sortedTimestamps = annotation.timestamps.sort((n1, n2) => n1 - n2);
      sortedTimestamps.forEach((timestamp) => {
        while (rowIndex < augmentedTable.rows.length - 1) {
          const smallerVal = augmentedTable.rows[rowIndex][xAxis.id] as number;
          const higherVal = augmentedTable.rows[rowIndex + 1][xAxis.id] as number;
          let rowIndexToInsert;

          // timestamp is on the left bounds of the chart
          if (timestamp <= smallerVal) {
            rowIndexToInsert = rowIndex;

            // timestamp is in between the right 2 buckets. now need to determine which one it is closer to
          } else if (timestamp <= higherVal) {
            const smallerValDiff = Math.abs(timestamp - smallerVal);
            const higherValDiff = Math.abs(timestamp - higherVal);
            rowIndexToInsert = smallerValDiff <= higherValDiff ? rowIndex : rowIndex + 1;
          }

          // timestamp is on the right bounds of the chart
          else if (rowIndex + 1 == augmentedTable.rows.length - 1) {
            rowIndexToInsert = rowIndex + 1;
          } else {
            rowIndex += 1;
            continue;
          }

          // inserting the value. increment if the mapping/property already exists
          augmentedTable.rows[rowIndexToInsert][annotationId] =
            (get(augmentedTable.rows[rowIndexToInsert], annotationId, 0) as number) + 1;
          break;
        }
      });
      // iterate to the next annotation
      return true;
    });
  }

  return augmentedTable;
};

const augmentSpec = (
  datatable: OpenSearchDashboardsDatatable,
  spec: object,
  augmentVisFields: AugmentVisFields
): object => {
  let newSpec = cloneDeep(spec) as any;

  /**
   * It is expected at this point that all of the data is in one layer
   * We need to do several things to the spec:
   * 1. add a rule to the existing layer for showing lines on the chart if a dot is hovered on
   * 2. add a second view below the existing one for showing a timeline of dots
   *    representing different annotations (alerts/anomalies)
   */

  // assuming the first column in the datatable represents the x-axis / the time-related field.
  // need to confirm if that's always the case or not
  // const xAxis = datatable.columns[0];
  // newSpec.layer.push({
  //   mark: 'rule',
  //   encoding: {
  //     x: {
  //       field: xAxis.id,
  //       type: 'temporal',
  //     },
  //   },
  // });

  // this can be uncommented later, when we are ready to add both
  // vconcat layers
  // newSpec.vconcat = [] as any[];
  // newSpec.vconcat.push({
  //   layer: newSpec.layer,
  // });
  // delete newSpec.layer;

  return newSpec;
};

export const createVegaSpecFn = (
  dependencies: VegaVisualizationDependencies
): VegaSpecExpressionFunctionDefinition => ({
  name: 'vega_spec',
  type: 'string',
  inputTypes: ['opensearch_dashboards_datatable'],
  help: i18n.translate('visTypeVega.function.help', {
    defaultMessage: 'Construct vega spec',
  }),
  args: {
    augmentVisFields: {
      types: ['string', 'null'],
      default: '',
      help: '',
    },
  },
  async fn(input, args, context) {
    let table = cloneDeep(input);

    const augmentVisFields = args.augmentVisFields
      ? (JSON.parse(args.augmentVisFields) as AugmentVisFields)
      : {};

    // if we have augmented fields, update the source datatable first
    if (!isEmpty(augmentVisFields)) {
      table = augmentTable(table, augmentVisFields);
    }

    console.log('augmented table: ', table);

    // creating initial spec from table
    let spec = createSpecFromDatatable(table);

    // if we have augmented fields, update the spec
    if (!isEmpty(augmentVisFields)) {
      spec = augmentSpec(table, spec, augmentVisFields);
    }

    //console.log('spec as string: ', JSON.stringify(spec));

    return JSON.stringify(spec);
  },
});
