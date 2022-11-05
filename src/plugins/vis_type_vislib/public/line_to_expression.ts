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

// import { get } from 'lodash';
import { getVisSchemas, SchemaConfig, Vis } from '../../visualizations/public';
import {
  buildExpression,
  buildExpressionFunction,
  ExecutionContext,
  formatExpression,
} from '../../expressions/public';
import { OpenSearchaggsExpressionFunctionDefinition } from '../../data/common/search/expressions';
import { VegaInspectorAdapters } from '../../vis_type_vega/public/vega_inspector';
import {
  VegaExpressionFunctionDefinition,
  VegaSpecExpressionFunctionDefinition,
} from '../../vis_type_vega/public';

export const toExpressionAst = (vis: Vis, params: any) => {
  // Construct the existing expr fns that are ran for vislib line chart, up until the render fn.
  // That way we get the exact same data table of results as if it was a vislib chart.
  const opensearchaggsFn = buildExpressionFunction<OpenSearchaggsExpressionFunctionDefinition>(
    'opensearchaggs',
    {
      index: vis.data.indexPattern!.id!,
      metricsAtAllLevels: vis.isHierarchical(),
      partialRows: vis.params.showPartialRows || false,
      aggConfigs: JSON.stringify(vis.data.aggs!.aggs),
      includeFormatHints: false,
    }
  );

  // adding the new expr fn here that takes the datatable and converts to a vega spec
  const vegaSpecFn = buildExpressionFunction<VegaSpecExpressionFunctionDefinition>('vega_spec', {
    augmentVisFields: JSON.stringify(params.augmentVisFields),
  });
  const vegaSpecFnExpressionBuilder = buildExpression([vegaSpecFn]);

  // build vega expr fn. use nested expression fn syntax to first construct the
  // spec via 'vega_spec' fn, then set as the arg for the final 'vega' fn
  const vegaFn = buildExpressionFunction<VegaExpressionFunctionDefinition>('vega', {
    spec: vegaSpecFnExpressionBuilder,
  });

  const ast = buildExpression([opensearchaggsFn, vegaFn]);
  //console.log('final pipeline: ', formatExpression(ast.toAst()));
  return ast.toAst();

  // var aggs = '';
  // var yval = 'doc_count';
  // var ylayer = '';
  // let interval = '1h';
  // let minDocCount = 0;
  // var transform = '';
  // var flatten = '';
  // var xField = '';
  // var hasAgg = false;
  // var hasCount = false;
  // var gotCount = false;
  // var doc_field = '';

  // vis.data.aggs!.aggs.forEach((agg) => {
  //   if (agg.type.name === 'date_histogram') {
  //     interval = String(agg.getParam('interval'));
  //     if (interval === 'auto') {
  //       interval = '{%autointerval%: true}';
  //     } else if (interval.length === 1) {
  //       interval = '1' + interval;
  //     }
  //     minDocCount = agg.getParam('min_doc_count');
  //     doc_field = agg.getParam('field.displayName');
  //   }
  //   if (['min', 'max', 'median', 'avg', 'sum'].indexOf(agg.type.name) !== -1) {
  //     hasAgg = true;
  //   }
  //   if (agg.type.name === 'count') {
  //     hasCount = true;
  //   }
  // });

  // vis.data.aggs!.aggs.forEach((agg) => {
  //   const field = agg.getParam('field.displayName');
  //   // if (agg.type.name === 'date_histogram') {
  //   //   interval = String(agg.getParam('interval'));
  //   //   if (interval === 'auto') {
  //   //     interval = '{%autointerval%: true}';
  //   //   } else if (interval.length === 1) {
  //   //     interval = '1' + interval;
  //   //   }
  //   //   minDocCount = agg.getParam('min_doc_count');
  //   //   // alert(interval);
  //   //   // aggs +=
  //   //   //   'time_buckets: {' +
  //   //   //   'date_histogram: {\n' +
  //   //   //   ' field: ' + field + '\n' +
  //   //   //   ' interval: ' + interval + '\n' +
  //   //   //   ' extended_bounds: {\n' +
  //   //   //   '   min: {%timefilter%: "min"}\n' +
  //   //   //   '   max: {%timefilter%: "max"}\n' +
  //   //   //   ' }\n' +
  //   //   //   ' min_doc_count: ' + minDocCount + '\n' +
  //   //   //   '}' +
  //   //   //   '},\n';
  //   // }
  //   if (['min', 'max', 'median', 'avg', 'sum'].indexOf(agg.type.name) !== -1) {
  //     var aggName = agg.type.name;
  //     if (aggName === 'median') {
  //       aggName = 'median_absolute_deviation';
  //     }
  //     const flatVal = 'aggregations.' + aggName + '_value.buckets';
  //     flatten += '"' + flatVal + '",';
  //     yval = aggName + '_value.value';
  //     transform +=
  //       '{"calculate": "datum[\'' + flatVal + "']." + yval + '", "as": "' + aggName + '"},';
  //     transform += '{"calculate": "datum[\'' + flatVal + '\'].key", "as": "' + aggName + '_key"},';
  //     if (hasCount && !gotCount) {
  //       gotCount = true;
  //       transform += '{"calculate": "datum[\'' + flatVal + '\'].doc_count", "as": "count_key"},';
  //       ylayer +=
  //         '    {mark: line\n' +
  //         '  encoding: {\n' +
  //         '    y: {\n' +
  //         '      field: count_key\n' +
  //         '      type: quantitative\n' +
  //         '      axis: { title: "count" }\n' +
  //         '    }\n' +
  //         '  }},\n';
  //     }
  //     // each part needs the encoding with mark and with y axis
  //     xField = aggName + '_key';

  //     aggs +=
  //       aggName +
  //       '_value: {' +
  //       'date_histogram: {\n' +
  //       ' field: ' +
  //       doc_field +
  //       '\n' +
  //       ' interval: ' +
  //       interval +
  //       '\n' +
  //       ' extended_bounds: {\n' +
  //       '   min: {%timefilter%: "min"}\n' +
  //       '   max: {%timefilter%: "max"}\n' +
  //       ' }\n' +
  //       ' min_doc_count: ' +
  //       minDocCount +
  //       '\n' +
  //       '},' +
  //       '                aggs:{ "' +
  //       aggName +
  //       '_value' +
  //       '": {\n' +
  //       '                    "' +
  //       aggName +
  //       '":{\n' +
  //       '                        "field":"' +
  //       field +
  //       '"\n' +
  //       '                    }\n' +
  //       '                }}\n' +
  //       '},\n';
  //     ylayer +=
  //       '    {mark: line\n' +
  //       '  encoding: {\n' +
  //       '    y: {\n' +
  //       '      field: ' +
  //       aggName +
  //       '\n' +
  //       '      type: quantitative\n' +
  //       '      axis: { title: "' +
  //       aggName +
  //       '" }\n' +
  //       '    }\n' +
  //       '  }},\n';
  //   }
  //   if (agg.type.name === 'count' && !hasAgg) {
  //     const flatVal = 'aggregations.' + agg.type.name + '_value.buckets';
  //     flatten += '"' + flatVal + '",';
  //     yval = agg.type.name + '_value.value';
  //     xField = agg.type.name + '_key';
  //     transform +=
  //       '{"calculate": "datum[\'' + flatVal + '\'].doc_count", "as": "' + agg.type.name + '"},';
  //     transform += '{"calculate": "datum[\'' + flatVal + '\'].key", "as": "' + xField + '"},';

  //     aggs +=
  //       agg.type.name +
  //       '_value: {' +
  //       'date_histogram: {\n' +
  //       ' field: order_date\n' +
  //       ' interval: ' +
  //       interval +
  //       '\n' +
  //       ' extended_bounds: {\n' +
  //       '   min: {%timefilter%: "min"}\n' +
  //       '   max: {%timefilter%: "max"}\n' +
  //       ' }\n' +
  //       ' min_doc_count: ' +
  //       minDocCount +
  //       '\n' +
  //       '}' +
  //       '},\n';
  //     const yField = agg.type.name + '_value.buckets.doc_count';
  //     ylayer +=
  //       '    {mark: line\n' +
  //       '  encoding: {\n' +
  //       '    y: {\n' +
  //       '      field: ' +
  //       agg.type.name +
  //       '\n' +
  //       '      type: quantitative\n' +
  //       '      axis: { title: "' +
  //       agg.type.name +
  //       '" }\n' +
  //       '    }\n' +
  //       '  }},\n';
  //   }
  // });
  // transform = '{ flatten: [' + flatten + ' ] },\n' + transform;

  // const dat =
  //   '{\n' +
  //   '  $schema: https://vega.github.io/schema/vega-lite/v4.json\n' +
  //   '  title: Event counts from ecommerce\n' +
  //   '  data: {\n' +
  //   '    url: {\n' +
  //   '      %context%: true\n' +
  //   '      %timefield%: order_date\n' +
  //   '      index: opensearch_dashboards_sample_data_ecommerce\n' +
  //   '      body: {\n' +
  //   '        aggs: {\n' +
  //   aggs +
  //   '        }\n' +
  //   '        size: 0\n' +
  //   '      }\n' +
  //   '    }\n' +
  //   '  }\n' +
  //   'transform: [' +
  //   transform +
  //   ']' +
  //   '  \n' +
  //   '  encoding: {\n' +
  //   '    x: {\n' +
  //   '      field: ' +
  //   xField +
  //   '\n' +
  //   '      type: temporal\n' +
  //   '      axis: { title: null }\n' +
  //   '    }\n' +
  //   '  }\n' +
  //   '\n' +
  //   '  layer: [\n' +
  //   ylayer +
  //   '  ]\n' +
  //   '}\n' +
  //   '\n';

  // console.log('dat: ', dat);

  // const vislib = buildExpressionFunction<VegaExpressionFunctionDefinition>('vega', {
  //   spec: dat,
  // });

  // const ast = buildExpression([vislib]);
  // return ast.toAst();
};
