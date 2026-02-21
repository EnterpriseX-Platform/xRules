import { ExecutionMetrics } from '@xrules/core';

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  label?: string;
}

export interface ChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color?: string;
  }>;
}

export interface DashboardConfig {
  title: string;
  description?: string;
  widgets: WidgetConfig[];
  refreshInterval?: number;
}

export interface WidgetConfig {
  id: string;
  type: 'metric' | 'chart' | 'table' | 'heatmap';
  title: string;
  metric: string;
  timeRange: TimeRange;
  dimensions?: { width: number; height: number };
}

export interface HeatmapData {
  x: string[];
  y: string[];
  data: number[][];
}

export interface ReportConfig {
  name: string;
  type: 'execution' | 'coverage' | 'performance' | 'custom';
  timeRange: TimeRange;
  filters?: Record<string, unknown>;
  format: 'pdf' | 'csv' | 'json';
}

export { ExecutionMetrics };
