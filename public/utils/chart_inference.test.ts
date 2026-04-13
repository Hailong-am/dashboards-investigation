/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { buildChartOption } from './chart_inference';

describe('buildChartOption', () => {
  it('returns null for empty data', () => {
    expect(buildChartOption([], [])).toBeNull();
    expect(buildChartOption([{ name: 'a' }], [{ a: 1 }])).toBeNull(); // < 2 rows
  });

  it('builds bar chart from aggregation-like data', () => {
    const schema = [{ name: 'service' }, { name: 'doc_count' }];
    const data = [
      { service: 'payment', doc_count: 120 },
      { service: 'auth', doc_count: 85 },
      { service: 'gateway', doc_count: 45 },
    ];
    const option = buildChartOption(schema, data, 'bar');
    expect(option).not.toBeNull();
    expect(option!.xAxis).toEqual(
      expect.objectContaining({ type: 'category', data: ['payment', 'auth', 'gateway'] })
    );
    expect(option!.series).toHaveLength(1);
    expect((option!.series as any)[0].type).toBe('bar');
    expect((option!.series as any)[0].data).toEqual([120, 85, 45]);
  });

  it('builds line chart for time-series data', () => {
    const schema = [{ name: 'key' }, { name: 'errors' }];
    const data = [
      { key: '2024-01-15T10:00:00Z', errors: 10 },
      { key: '2024-01-15T10:05:00Z', errors: 25 },
      { key: '2024-01-15T10:10:00Z', errors: 42 },
    ];
    const option = buildChartOption(schema, data, 'line');
    expect(option).not.toBeNull();
    expect((option!.series as any)[0].type).toBe('line');
    expect((option!.series as any)[0].smooth).toBe(true);
  });

  it('defaults to bar when no chartType specified', () => {
    const schema = [{ name: 'x' }, { name: 'y' }];
    const data = [
      { x: 'a', y: 1 },
      { x: 'b', y: 2 },
    ];
    const option = buildChartOption(schema, data);
    expect((option!.series as any)[0].type).toBe('bar');
  });

  it('skips non-numeric value columns', () => {
    const schema = [{ name: 'key' }, { name: 'label' }, { name: 'count' }];
    const data = [
      { key: 'a', label: 'foo', count: 10 },
      { key: 'b', label: 'bar', count: 20 },
    ];
    const option = buildChartOption(schema, data, 'bar');
    expect(option!.series).toHaveLength(1);
    expect((option!.series as any)[0].name).toBe('count');
  });

  it('handles multiple numeric series (max 3)', () => {
    const schema = [
      { name: 'time' },
      { name: 'cpu' },
      { name: 'mem' },
      { name: 'disk' },
      { name: 'net' },
    ];
    const data = [
      { time: 't1', cpu: 80, mem: 60, disk: 40, net: 20 },
      { time: 't2', cpu: 85, mem: 65, disk: 45, net: 25 },
    ];
    const option = buildChartOption(schema, data, 'line');
    // Max 3 series
    expect(option!.series).toHaveLength(3);
  });
});
