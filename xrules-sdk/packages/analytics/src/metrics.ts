import { Execution, ExecutionMetrics } from '@xrules/core';
import { MetricDataPoint, TimeRange } from './types';

export class MetricsCalculator {
  calculateExecutionMetrics(executions: Execution[]): ExecutionMetrics {
    const total = executions.length;
    const successful = executions.filter((e) => e.status === 'completed').length;
    const durations = executions
      .filter((e) => e.completedAt && e.startedAt)
      .map((e) => e.completedAt!.getTime() - e.startedAt.getTime());

    const sortedDurations = [...durations].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedDurations.length * 0.95);
    const p99Index = Math.floor(sortedDurations.length * 0.99);

    const errorsByType: Record<string, number> = {};
    executions.forEach((e) => {
      if (e.error) {
        errorsByType[e.error.code] = (errorsByType[e.error.code] || 0) + 1;
      }
    });

    const executionsByDay: Record<string, number> = {};
    executions.forEach((e) => {
      const day = e.startedAt.toISOString().split('T')[0];
      executionsByDay[day] = (executionsByDay[day] || 0) + 1;
    });

    return {
      totalExecutions: total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      avgDuration: durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0,
      p95Duration: sortedDurations[p95Index] || 0,
      p99Duration: sortedDurations[p99Index] || 0,
      errorsByType,
      executionsByDay,
    };
  }

  calculateTimeSeries(
    executions: Execution[],
    granularity: 'hour' | 'day' | 'week' | 'month'
  ): MetricDataPoint[] {
    const grouped = new Map<string, number>();

    executions.forEach((e) => {
      const key = this.getTimeKey(e.startedAt, granularity);
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });

    return Array.from(grouped.entries())
      .map(([timestamp, value]) => ({
        timestamp: new Date(timestamp),
        value,
      }))
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  private getTimeKey(date: Date, granularity: string): string {
    const d = new Date(date);
    switch (granularity) {
      case 'hour':
        d.setMinutes(0, 0, 0);
        break;
      case 'day':
        d.setHours(0, 0, 0, 0);
        break;
      case 'week':
        d.setDate(d.getDate() - d.getDay());
        d.setHours(0, 0, 0, 0);
        break;
      case 'month':
        d.setDate(1);
        d.setHours(0, 0, 0, 0);
        break;
    }
    return d.toISOString();
  }
}

export function createMetricsCalculator(): MetricsCalculator {
  return new MetricsCalculator();
}
