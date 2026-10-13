import type { Metric } from '../types/metrics';

// SVG icons for each metric type — all use stroke="currentColor" so they inherit color
const ICONS: Record<string, string> = {
  lightning: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  wind: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M15 4a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M13 16v-2"/><path d="M7 16v-2"/><path d="M10 18v2"/><path d="M4 18v2"/></svg>',
  chip: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M6 12h12"/></svg>',
  gpu: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>',
  memory: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16"/><path d="M4 12V7"/><path d="M20 12V7"/><path d="M4 12v9"/><path d="M20 12v9"/><path d="M2 16h20"/></svg>',
  cpu: '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.38 18.38l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/></svg>',
  thermometer: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8.04V4a2 2 0 0 0-2 0v4"/><path d="M12 12a3 3 0 1 0 0 .01"/><path d="M14 8.04a4 4 0 0 1 2 3.48 3.97 3.97 0 0 0 0 5.96 4 4 0 0 1-2 1.52V20a2 2 0 0 0 2 0V8.04"/></svg>',
};

// Map emoji keys to SVG icon keys
const ICON_MAP: Record<string, string> = {
  '⚡': 'lightning',
  '💨': 'wind',
  '🟣': 'chip',
  '🟢': 'gpu',
  '🔵': 'memory',
  '🟡': 'cpu',
  '🌡': 'thermometer',
};

export function MetricRow({ metric }: { metric: Metric }) {
  const iconKey = ICON_MAP[metric.icon] || 'gpu';
  const iconSvg = ICONS[iconKey] || ICONS['gpu'];
  const tempColor = metric.temp != null
    ? (metric.temp >= 85 ? '#ff4444' : metric.temp >= 70 ? '#f59e0b' : metric.color)
    : undefined;

  return (
    <div className="row">
      <div className="row-top">
        <span className="icon" aria-hidden="true" style={{ color: metric.color }} dangerouslySetInnerHTML={{ __html: iconSvg }} />
        <span className="label">{metric.label}</span>
        <span className="value" style={{ color: metric.color }}>
          {metric.value}
          {metric.temp != null && (
            <span className="temp-badge" style={{ color: tempColor, marginLeft: 4, fontSize: 9, fontWeight: 600 }}>
              {Math.round(metric.temp)}°C
            </span>
          )}
        </span>
      </div>
      <div className="bar">
        <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, metric.progress))}%`, backgroundColor: metric.color }} />
      </div>
    </div>
  );
}
