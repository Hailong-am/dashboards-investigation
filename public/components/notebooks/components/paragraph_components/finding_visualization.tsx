/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useContext } from 'react';
import { EuiLoadingChart, EuiSpacer } from '@elastic/eui';
import { useObservable } from 'react-use';
import type { EChartsOption } from 'echarts';
import { EChartsVisualization } from './echarts_visualization';
import { buildChartOption } from '../../../../../utils/chart_inference';
import { getQueryOutputData, QueryObject } from './ppl';
import { executePPLQuery } from '../../../../../utils/query';
import { callOpenSearchCluster } from '../../../../../plugin_helpers/plugin_proxy_call';
import { getClient } from '../../../../../services';
import { NotebookReactContext } from '../../../context_provider/context_provider';

interface FindingQuery {
  index: string;
  type: 'dsl' | 'ppl';
  body: string;
}

const dslAggsToQueryObject = (response: any): QueryObject | null => {
  const aggs = response?.aggregations;
  if (!aggs) return null;
  const aggKey = Object.keys(aggs).find((k) => aggs[k]?.buckets);
  if (!aggKey) return null;
  const buckets = aggs[aggKey].buckets;
  if (!buckets?.length) return null;

  const first = buckets[0];
  const metricKeys = Object.keys(first).filter(
    (k) => !['key', 'key_as_string', 'doc_count'].includes(k) && typeof first[k] === 'object'
  );
  const schema: Array<{ name: string }> = [
    { name: first.key_as_string !== undefined ? 'key' : aggKey },
  ];
  if (metricKeys.length) metricKeys.forEach((k) => schema.push({ name: k }));
  else schema.push({ name: 'doc_count' });

  const datarows = buckets.map((b: any) => {
    const row: any[] = [b.key_as_string ?? b.key];
    if (metricKeys.length) metricKeys.forEach((k) => row.push(b[k]?.value ?? b[k]?.doc_count ?? 0));
    else row.push(b.doc_count);
    return row;
  });
  return { schema: schema.map((s) => ({ name: s.name, type: 'string' })), datarows };
};

const detectChartType = (data: any[][]): 'line' | 'bar' => {
  if (!data.length) return 'bar';
  const v = String(data[0][0]);
  return /^\d{4}-\d{2}/.test(v) || /^\d{13,}$/.test(v) ? 'line' : 'bar';
};

export const FindingVisualization: React.FC<{ query?: FindingQuery }> = ({ query }) => {
  const [chartOption, setChartOption] = useState<EChartsOption | null>(null);
  const [loading, setLoading] = useState(false);

  const context = useContext(NotebookReactContext);
  const { dataSourceId } = useObservable(
    context.state.value.context.getValue$(),
    context.state.value.context.value
  );

  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    setLoading(true);
    setChartOption(null);

    const run = async () => {
      const http = getClient();

      if (query.type === 'ppl') {
        const res = await executePPLQuery({ http, dataSourceId, query: query.body }, true);
        if (!cancelled && res?.schema) {
          const data = getQueryOutputData(res);
          setChartOption(buildChartOption(res.schema, data, 'bar'));
        }
      } else {
        const res = await callOpenSearchCluster({
          http,
          dataSourceId,
          request: {
            path: `/${query.index}/_search`,
            method: 'POST',
            body: query.body,
          },
        });
        if (cancelled) return;
        const qo = dslAggsToQueryObject(res);
        if (qo) {
          const data = getQueryOutputData(qo);
          setChartOption(buildChartOption(qo.schema, data, detectChartType(qo.datarows)));
        }
      }
    };

    run()
      .catch(() => {}) // Chart is optional — fail silently
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, dataSourceId]);

  if (!query) return null;
  if (loading)
    return (
      <>
        <EuiSpacer size="s" />
        <EuiLoadingChart size="m" />
      </>
    );
  if (!chartOption) return null;

  return (
    <>
      <EuiSpacer size="s" />
      <EChartsVisualization option={chartOption} height={250} />
    </>
  );
};
