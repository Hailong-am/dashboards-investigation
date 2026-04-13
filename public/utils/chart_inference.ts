/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import type { EChartsOption } from 'echarts';

export type ChartType = 'bar' | 'line';

/**
 * Build an ECharts option from query result schema + data.
 * chartType is provided by the LLM (defaults to 'bar').
 */
export function buildChartOption(
  schema: Array<{ name: string; type?: string }>,
  data: Array<Record<string, unknown>>,
  chartType: ChartType = 'bar'
): EChartsOption | null {
  if (!schema?.length || !data?.length || data.length < 2) return null;

  // First column = category axis, remaining numeric columns = series
  const categoryCol = schema[0].name;
  const valueCols = schema.slice(1).filter((col) => {
    const sample = data.find((row) => row[col.name] != null);
    return sample && !isNaN(Number(sample[col.name]));
  });

  if (valueCols.length === 0) return null;

  const categories = data.map((row) => String(row[categoryCol] ?? ''));

  return {
    tooltip: { trigger: 'axis' },
    legend: valueCols.length > 1 ? { data: valueCols.map((c) => c.name) } : undefined,
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { rotate: categories.length > 10 ? 30 : 0 },
    },
    yAxis: { type: 'value' },
    series: valueCols.slice(0, 3).map((col) => ({
      name: col.name,
      type: chartType,
      data: data.map((row) => Number(row[col.name]) || 0),
      smooth: chartType === 'line',
    })),
  };
}
