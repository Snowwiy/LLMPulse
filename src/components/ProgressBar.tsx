export function ProgressBar({ progress }: { progress: number }) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="bar">
      <div className="bar-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
