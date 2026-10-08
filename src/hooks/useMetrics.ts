import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Metrics } from '../types/metrics';

const INTERVAL_MS = 1000;

export function useMetrics(): Metrics {
  const [state, setState] = useState<Metrics>({
    model: 'NO MODEL',
    online: false,
    generating: false,
    metrics: {
      tokPerSec: null,
      vramUsedGb: null,
      vramTotalGb: null,
      ramUsedGb: null,
      ramTotalGb: null,
      cpuUsage: null,
      elapsed: '--:--:--'
    },
    error: null
  });

  useEffect(() => {
    let alive = true;

    const tick = async () => {
      try {
        if (!alive) return;
        setState(await invoke<Metrics>('getMetrics'));
      } catch {
        if (alive) {
          setState((prev) => ({ ...prev, error: 'N/D' }));
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
