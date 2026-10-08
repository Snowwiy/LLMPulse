import type { Metric } from '../types/metrics';

export function MetricRow({ metric }: { metric: Metric }) {
  return (
    <div className="row">
      <div className="row-top">
        <span className="icon" aria-hidden="true">
          {metric.icon}
        </span>
        <span className="label">{metric.label}</span>
        <span className="value" style={metric.color ? { color: metric.color } : undefined}>
          {metric.value}
        </span>
      </div>
      <div className="bar" style={{ '--fill': metric.color } as React.CSSProperties}>
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, metric.progress))}%` }} />
      </div>
    </div>
  );
}
