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
import { buildExpression, buildExpressionFunction, ExecutionContext } from '../../expressions/public';
import { OpenSearchaggsExpressionFunctionDefinition } from '../../data/common/search/expressions';
import { VegaInspectorAdapters } from '../../vis_type_vega/public/vega_inspector';
import { VegaExpressionFunctionDefinition } from '../../vis_type_vega/public';

// const prepareDimension = (params: SchemaConfig) => {
//   const visdimension = buildExpressionFunction('visdimension', { accessor: params.accessor });
//
//   if (params.format) {
//     visdimension.addArgument('format', params.format.id);
//     visdimension.addArgument('formatParams', JSON.stringify(params.format.params));
//   }
//
//   return buildExpression([visdimension]);
// };

export const toExpressionAst = (vis: Vis, params: any) => {
  const opensearchaggs = buildExpressionFunction<OpenSearchaggsExpressionFunctionDefinition>(
    'opensearchaggs',
    {
      index: vis.data.indexPattern!.id!,
      metricsAtAllLevels: vis.isHierarchical(),
      partialRows: vis.params.showPartialRows || false,
      aggConfigs: JSON.stringify(vis.data.aggs!.aggs),
      includeFormatHints: false,
    }
  );
  // "$schema": "https://vega.github.io/schema/vega-lite/v5.json"
  // const dat =
  //   '{\n' +
  //   '  "$schema": "https://vega.github.io/schema/vega-lite/v5.json",\n' +
  //   '  "data": {\n' +
  //   '    "url": {' +
  //   '    %context%: true\n' +
  //   '      %timefield%: order_date\n' +
  //   '      index: ' +
  //   vis.data.indexPattern!.title +
  //   '\n      body: {' +
  //   JSON.stringify(vis.data) +
  //   '  }}},\n' +
  //   '  "mark": "line",\n' +
  //   '  "encoding": {\n' +
  //   '    "x": {"field": "x", "type": "quantitative"},\n' +
  //   '    "y": {"field": "y", "type": "quantitative"}\n' +
  //   '  }\n' +
  //   '}';

  var aggs = '';
  var yval = 'doc_count';
  vis.data.aggs!.aggs.forEach((agg) => {
    const field = agg.getParam('field.displayName');
    if (agg.type.name === 'date_histogram') {
      let interval = String(agg.getParam('interval'));
      if (interval === 'auto') {
        interval = '{%autointerval%: true}';
      } else if (interval.length === 1) {
        interval = '1' + interval;
      }
      const minDocCount = agg.getParam('min_doc_count');
      // alert(interval);
      aggs +=
        'date_histogram: {\n' +
        ' field: ' + field + '\n' +
        ' interval: ' + interval + '\n' +
        ' extended_bounds: {\n' +
        '   min: {%timefilter%: "min"}\n' +
        '   max: {%timefilter%: "max"}\n' +
        ' }\n' +
        ' min_doc_count: ' + minDocCount + '\n' +
        '},\n';
    }
    if (['min', 'max', 'median', 'avg', 'sum'].indexOf(agg.type.name) === -1) {
      // each part needs the encoding with mark and with y axis
      yval = agg.type.name + '_value.value';
      aggs += '"aggs":{\n' +
        '                "' + agg.type.name + '_value' + '":{\n' +
        '                    "' + agg.type.name + '":{\n' +
        '                        "field":"' + field + '"\n' +
        '                    }\n' +
        '                }\n' +
        '            },\n';
    }
  });

  const dat = '{\n' +
    '  $schema: https://vega.github.io/schema/vega-lite/v4.json\n' +
    '  title: Event counts from ecommerce\n' +
    '  data: {\n' +
    '    url: {\n' +
    '      %context%: true\n' +
    '      %timefield%: order_date\n' +
    '      index: opensearch_dashboards_sample_data_ecommerce\n' +
    '      body: {\n' +
    '        aggs: {\n' +
    '          time_buckets: {\n' +
    aggs +
    '          }\n' +
    '        }\n' +
    '        size: 0\n' +
    '      }\n' +
    '    }\n' +
    '    format: {property: "aggregations.time_buckets.buckets" }\n' +
    '  }\n' +
    '  \n' +
    '  encoding: {\n' +
    '    x: {\n' +
    '      field: key\n' +
    '      type: temporal\n' +
    '      axis: { title: null }\n' +
    '    }\n' +
    '    y: {\n' +
    '      field: ' + yval + '\n' +
    '      type: quantitative\n' +
    '      axis: { title: "Document count" }\n' +
    '      stack: true\n' +
    '    }\n' +
    '  }\n' +
    '\n' +
    '  layer: [{\n' +
    '    mark: line\n' +
    '  }, {\n' +
    '    mark: point\n' +
    '\n' +
    '  }]\n' +
    '}\n' +
    '\n';
  // alert(dat);

  // const dat =
  //   '{\n' +
  //   '  $schema: https://vega.github.io/schema/vega-lite/v4.json\n' +
  //   '  title: Event counts from ecommerce\n' +
  //   '  data: {\n' +
  //   '    url: {\n' +
  //   '      %context%: true\n' +
  //   '      %timefield%: order_date\n' +
  //   '      index: opensearch_dashboards_sample_data_ecommerce' +
  //   // vis.data.indexPattern!.title +
  //   '\n' +
  //   '      body: {\n' +
  //   '            aggs: {\n' +
  //   '              time_buckets: {\n' +
  //   '                date_histogram: {\n' +
  //   '                  field: order_date\n' +
  //   '                  interval: 6h\n' +
  //   '                  extended_bounds: {\n' +
  //   '                    min: {%timefilter%: "min"}\n' +
  //   '                    max: {%timefilter%: "max"}\n' +
  //   '                  }\n' +
  //   '                  min_doc_count: 0\n' +
  //   '                }\n' +
  //   '              }\n' +
  //   '            }\n' +
  //   '        size: 0\n' +
  //   '      }\n' +
  //   '    }\n' +
  //   '    format: {property: "aggregations.time_buckets.buckets" }\n' +
  //   '  }\n' +
  //   '  \n' +
  //   '  encoding: {\n' +
  //   '    x: {\n' +
  //   '      field: key\n' +
  //   '      type: temporal\n' +
  //   '      axis: { title: null }\n' +
  //   '    }\n' +
  //   '    y: {\n' +
  //   '      field: doc_count\n' +
  //   '      type: quantitative\n' +
  //   '      axis: { title: "Document count" }\n' +
  //   '      stack: true\n' +
  //   '    }\n' +
  //   '  }\n' +
  //   '\n' +
  //   '  layer: [{\n' +
  //   '    mark: line\n' +
  //   '  }, {\n' +
  //   '    mark: point\n' +
  //   '\n' +
  //   '  }]\n' +
  //   '}\n' +
  //   '\n';

    // '{\n' +
    // ' "$schema": "https://vega.github.io/schema/vega-lite/v5.json",\n' +
    // '  "data": [\n' +
    // '    {\n' +
    // '      "name": "table",\n' +
    // '      "values": [\n' +
    // '        {"x": 0, "y": 28},' +
    // '        {"x": 1, "y": 43},' +
    // '        {"x": 2, "y": 81},\n' +
    // '        {"x": 3, "y": 19},\n' +
    // '        {"x": 4, "y": 52},\n' +
    // '        {"x": 5, "y": 24},\n' +
    // '        {"x": 6, "y": 87},\n' +
    // '        {"x": 7, "y": 17},\n' +
    // '        {"x": 8, "y": 68},\n' +
    // '        {"x": 9, "y": 49}\n' +
    // '      ]\n' +
    // '    }\n' +
    // '  ],\n' +
    // '  "mark": "line",\n' +
    // '  "encoding": {\n' +
    // '    "x": {"scale": "x", "field": "x", "type": "quantitative", "title": "XField"},\n' +
    // '    "y": {"scale": "y", "field": "y", "type": "quantitative", "title": "YField"}\n' +
    // '  }' +
    // '}';
  // const dat =
  //   '{\n' +
  //   '  "$schema": "https://vega.github.io/schema/vega/v5.json",\n' +
  //   '  "title": "' +
  //   vis.title +
  //   '  "description": "' +
  //   vis.description +
  //   '",\n' +
  //   '  "width": 500,\n' +
  //   '  "height": 200,\n' +
  //   '  "padding": 5,\n' +
  //   '\n' +
  //   '  "signals": [\n' +
  //   '    {\n' +
  //   '      "name": "interpolate",\n' +
  //   '      "value": "linear",\n' +
  //   '      "bind": {\n' +
  //   '        "input": "select",\n' +
  //   '        "options": [\n' +
  //   '          "basis",\n' +
  //   '          "cardinal",\n' +
  //   '          "catmull-rom",\n' +
  //   '          "linear",\n' +
  //   '          "monotone",\n' +
  //   '          "natural",\n' +
  //   '          "step",\n' +
  //   '          "step-after",\n' +
  //   '          "step-before"\n' +
  //   '        ]\n' +
  //   '      }\n' +
  //   '    }\n' +
  //   '  ],\n' +
  //   '\n' +
  //   '  "data": [\n' +
  //   '    {\n' +
  //   '      "name": "table",\n' +
  //   '      "values": [\n' +
  //   '        {"x": 0, "y": 28, "c":0}, {"x": 0, "y": 20, "c":1},\n' +
  //   '        {"x": 1, "y": 43, "c":0}, {"x": 1, "y": 35, "c":1},\n' +
  //   '        {"x": 2, "y": 81, "c":0}, {"x": 2, "y": 10, "c":1},\n' +
  //   '        {"x": 3, "y": 19, "c":0}, {"x": 3, "y": 15, "c":1},\n' +
  //   '        {"x": 4, "y": 52, "c":0}, {"x": 4, "y": 48, "c":1},\n' +
  //   '        {"x": 5, "y": 24, "c":0}, {"x": 5, "y": 28, "c":1},\n' +
  //   '        {"x": 6, "y": 87, "c":0}, {"x": 6, "y": 66, "c":1},\n' +
  //   '        {"x": 7, "y": 17, "c":0}, {"x": 7, "y": 27, "c":1},\n' +
  //   '        {"x": 8, "y": 68, "c":0}, {"x": 8, "y": 16, "c":1},\n' +
  //   '        {"x": 9, "y": 49, "c":0}, {"x": 9, "y": 25, "c":1}\n' +
  //   '      ]\n' +
  //   '    }\n' +
  //   '  ],\n' +
  //   '\n' +
  //   '  "scales": [\n' +
  //   '    {\n' +
  //   '      "name": "x",\n' +
  //   '      "type": "point",\n' +
  //   '      "range": "width",\n' +
  //   '      "domain": {"data": "table", "field": "x"}\n' +
  //   '    },\n' +
  //   '    {\n' +
  //   '      "name": "y",\n' +
  //   '      "type": "linear",\n' +
  //   '      "range": "height",\n' +
  //   '      "nice": true,\n' +
  //   '      "zero": true,\n' +
  //   '      "domain": {"data": "table", "field": "y"}\n' +
  //   '    },\n' +
  //   '    {\n' +
  //   '      "name": "color",\n' +
  //   '      "type": "ordinal",\n' +
  //   '      "range": "category",\n' +
  //   '      "domain": {"data": "table", "field": "c"}\n' +
  //   '    }\n' +
  //   '  ],\n' +
  //   '\n' +
  //   '  "axes": [\n' +
  //   '    {"orient": "bottom", "scale": "x", "title": "TESTX"},\n' +
  //   '    {"orient": "left", "scale": "y", "title": "TESTY"}\n' +
  //   '  ],\n' +
  //   '\n' +
  //   '  "marks": [\n' +
  //   '    {\n' +
  //   '      "type": "group",\n' +
  //   '      "from": {\n' +
  //   '        "facet": {\n' +
  //   '          "name": "series",\n' +
  //   '          "data": "table",\n' +
  //   '          "groupby": "c"\n' +
  //   '        }\n' +
  //   '      },\n' +
  //   '      "marks": [\n' +
  //   '        {\n' +
  //   '          "type": "line",\n' +
  //   '          "from": {"data": "series"},\n' +
  //   '          "encode": {\n' +
  //   '            "enter": {\n' +
  //   '              "x": {"scale": "x", "field": "x"},\n' +
  //   '              "y": {"scale": "y", "field": "y"},\n' +
  //   '              "stroke": {"scale": "color", "field": "c"},\n' +
  //   '              "strokeWidth": {"value": 2}\n' +
  //   '            },\n' +
  //   '            "update": {\n' +
  //   '              "interpolate": {"signal": "interpolate"},\n' +
  //   '              "strokeOpacity": {"value": 1}\n' +
  //   '            },\n' +
  //   '            "hover": {\n' +
  //   '              "strokeOpacity": {"value": 0.5}\n' +
  //   '            }\n' +
  //   '          }\n' +
  //   '        }\n' +
  //   '      ]\n' +
  //   '    }\n' +
  //   '  ]\n' +
  //   '}';
  const vislib = buildExpressionFunction<VegaExpressionFunctionDefinition>('vega', {
    spec: dat,
  });

  const ast = buildExpression([vislib]);
  return ast.toAst();
  // soon this becomes: const opensearchaggs = vis.data.aggs!.toExpressionAst();
  // const opensearchaggs = buildExpressionFunction<OpenSearchaggsExpressionFunctionDefinition>(
  //   'opensearchaggs',
  //   {
  //     index: vis.data.indexPattern!.id!,
  //     metricsAtAllLevels: vis.isHierarchical(),
  //     partialRows: vis.params.showPartialRows || false,
  //     aggConfigs: JSON.stringify(vis.data.aggs!.aggs),
  //     includeFormatHints: false,
  //   }
  // );
  //
  // const schemas = getVisSchemas(vis, params);
  //
  // const {
  //   percentageMode,
  //   useRanges,
  //   colorSchema,
  //   metricColorMode,
  //   colorsRange,
  //   labels,
  //   invertColors,
  //   style,
  // } = vis.params.metric;
  //
  // // fix formatter for percentage mode
  // if (get(vis.params, 'metric.percentageMode') === true) {
  //   schemas.metric.forEach((metric: SchemaConfig) => {
  //     metric.format = { id: 'percent' };
  //   });
  // }
  //
  // const metricVis = buildExpressionFunction<any>('vega', {
  //   percentageMode,
  //   colorSchema,
  //   colorMode: metricColorMode,
  //   useRanges,
  //   invertColors,
  //   showLabels: labels && labels.show,
  // });
  //
  // if (style) {
  //   metricVis.addArgument('bgFill', style.bgFill);
  //   metricVis.addArgument('font', buildExpression(`font size=${style.fontSize}`));
  //   metricVis.addArgument('subText', style.subText);
  // }
  //
  // if (colorsRange) {
  //   colorsRange.forEach((range: any) => {
  //     metricVis.addArgument(
  //       'colorRange',
  //       buildExpression(`range from=${range.from} to=${range.to}`)
  //     );
  //   });
  // }
  //
  // if (schemas.group) {
  //   metricVis.addArgument('bucket', prepareDimension(schemas.group[0]));
  // }
  //
  // schemas.metric.forEach((metric) => {
  //   metricVis.addArgument('metric', prepareDimension(metric));
  // });
  //
  // const ast = buildExpression([opensearchaggs, metricVis]);
  //
  // return ast.toAst();
};
