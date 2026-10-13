import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Metrics } from '../types/metrics';

const INTERVAL_MS = 1000;
const STORAGE_KEY = 'llmpulse_port';

function loadPersistedPort(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) {
      const p = parseInt(raw, 10);
      if (p >= 1 && p <= 65535) return p;
    }
  } catch {
    // localStorage unavailable
  }
  return null;
}

export function useMetrics(): Metrics {
  const [state, setState] = useState<Metrics>({
    model: 'NO MODEL',
    online: false,
    generating: false,
    tokPerSec: null,
    tokPerSecLast: null,
    tokPerSecIn: null,
    tokPerSecOut: null,
    vramUsedGb: null,
    vramTotalGb: null,
    gpuUsage: null,
    gpuTemp: null,
    ramUsedGb: null,
    ramTotalGb: null,
    cpuUsage: null,
    cpuTemp: null,
    elapsed: '--:--:--',
    error: null
  });

  loadPersistedPort();

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        if (!alive) return;
        const data = await invoke<Record<string, unknown>>('get_metrics');
        setState({
          model: (data.model as string) || 'NO MODEL',
          online: !!data.online,
          generating: !!data.generating,
          tokPerSec: data.tok_per_sec != null ? (data.tok_per_sec as number) : null,
          tokPerSecLast: data.tok_per_sec_last != null ? (data.tok_per_sec_last as number) : null,
          tokPerSecIn: data.tok_per_sec_in != null ? (data.tok_per_sec_in as number) : null,
          tokPerSecOut: data.tok_per_sec_out != null ? (data.tok_per_sec_out as number) : null,
          vramUsedGb: data.vram_used_gb != null ? (data.vram_used_gb as number) : null,
          vramTotalGb: data.vram_total_gb != null ? (data.vram_total_gb as number) : null,
          gpuUsage: data.gpu_usage != null ? (data.gpu_usage as number) : null,
          gpuTemp: data.gpu_temp != null ? (data.gpu_temp as number) : null,
          ramUsedGb: data.ram_used_gb != null ? (data.ram_used_gb as number) : null,
          ramTotalGb: data.ram_total_gb != null ? (data.ram_total_gb as number) : null,
          cpuUsage: data.cpu_usage != null ? (data.cpu_usage as number) : null,
          cpuTemp: data.cpu_temp != null ? (data.cpu_temp as number) : null,
          elapsed: (data.elapsed as string) || '--:--:--',
          error: null
        });
      } catch {
        if (alive) {
          setState((prev) => ({ ...prev, error: null }));
        }
      }
    };

    tick();
    const id = window.setInterval(tick, INTERVAL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return state;
}
