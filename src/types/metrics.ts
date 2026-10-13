export type Metric = {
  label: string;
  value: string;
  progress: number;
  color: string;
  icon: string;
  temp?: number | null;
};

export type Metrics = {
  model: string;
  online: boolean;
  generating: boolean;
  tokPerSec: number | null;
  tokPerSecLast: number | null;
  tokPerSecIn: number | null;
  tokPerSecOut: number | null;
  vramUsedGb: number | null;
  vramTotalGb: number | null;
  gpuUsage: number | null;
  gpuTemp: number | null;
  ramUsedGb: number | null;
  ramTotalGb: number | null;
  cpuUsage: number | null;
  cpuTemp: number | null;
  elapsed: string;
  error: string | null;
};
