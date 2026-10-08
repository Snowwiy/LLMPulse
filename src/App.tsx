import { MetricRow } from './components/MetricRow';
import type { Metric } from './types/metrics';
import { useMetrics } from './hooks/useMetrics';

type Icon = '◉' | '▣' | '▤' | '⚙' | '◷';

const COLORS: Record<Icon, string> = {
  '◉': '#4d9fff',
  '▣': '#a78bfa',
  '▤': '#5ec8ff',
  '⚙': '#5ec8ff',
  '◷': '#7d8aa0'
};

function row(icon: Icon, label: string, value: string, progress: number, color: string): Metric {
  return { icon, label, value, progress, color };
}

export default function App() {
  const m = useMetrics();

  const model =
    m.model === 'NO MODEL' ? 'NO MODEL' : m.model.replace(/\s+/g, ' ').trim();

  // tok/s: llama.cpp exposes no absolute ceiling, so the bar is scaled 0–100 tok/s.
  const tok = m.metrics.tokPerSec;
  const tokRow =
    m.generating && tok !== null && tok !== undefined
      ? row('◉', 'Tok/s', tok.toFixed(1), Math.min(100, tok / 100), COLORS['◉'])
      : row('◉', 'Tok/s', 'IDLE', 0, COLORS['◉']);

  const vramUsed = m.metrics.vramUsedGb;
  const vramTotal = m.metrics.vramTotalGb;
  const vramRow =
    vramTotal !== null && vramTotal !== undefined && vramUsed !== null
      ? row(
          '▣',
          'VRAM GPU',
          `${vramUsed.toFixed(1)} GB / ${vramTotal.toFixed(1)} GB`,
          Math.min(100, (vramUsed / vramTotal) * 100),
          COLORS['▣']
        )
      : row('▣', 'VRAM GPU', 'N/D', 0, COLORS['▣']);

  const ramUsed = m.metrics.ramUsedGb;
  const ramTotal = m.metrics.ramTotalGb;
  const ramRow =
    ramTotal !== null && ramTotal !== undefined && ramUsed !== null
      ? row(
          '▤',
          'RAM Usage',
          `${ramUsed.toFixed(1)} GB / ${ramTotal.toFixed(1)} GB`,
          Math.min(100, (ramUsed / ramTotal) * 100),
          COLORS['▤']
        )
      : row('▤', 'RAM Usage', 'N/D', 0, COLORS['▤']);

  const cpu = m.metrics.cpuUsage;
  const cpuRow =
    cpu !== null && cpu !== undefined
      ? row('⚙', 'CPU Usage', `${Math.round(cpu)}%`, Math.min(100, Math.round(cpu)), COLORS['⚙'])
      : row('⚙', 'CPU Usage', 'N/D', 0, COLORS['⚙']);

  const time = m.metrics.elapsed;

  return (
    <div className="widget">
      <div className="header">
        <div className="title">MONITOR MODELO IA</div>
        <div className="model">{model}</div>
      </div>

      <div className="body">
        <MetricRow metric={tokRow} />
        <MetricRow metric={vramRow} />
        <MetricRow metric={ramRow} />
        <MetricRow metric={cpuRow} />
        <div className="row time-row">
          <span className="icon" style={{ color: COLORS['◷'] }} aria-hidden="true">
            ◷
          </span>
          <span className="label">Tiempo Activo</span>
          <span className="value" style={{ color: COLORS['◷'] }}>
            {time}
          </span>
        </div>
      </div>
    </div>
  );
}
