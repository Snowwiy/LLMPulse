export type Metric = {
  label: string;
  value: string;
  progress: number;
  color: string;
  icon: string;
};

export type Metrics = {
  model: string;
  online: boolean;
  generating: boolean;
  metrics: {
    tokPerSec: number | null;
    vramUsedGb: number | null;
    vramTotalGb: number | null;
    ramUsedGb: number | null;
    ramTotalGb: number | null;
    cpuUsage: number | null;
    elapsed: string;
  };
  error: string | null;
};
