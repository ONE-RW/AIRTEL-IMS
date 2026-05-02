type DashboardWaveLoaderProps = {
  title?: string;
  compact?: boolean;
};

function DashboardWaveLoader({
  title = "Loading dashboard",
  compact = false,
}: DashboardWaveLoaderProps) {
  return (
    <div
      className={`dashboard-wave-loader ${compact ? "dashboard-wave-loader-compact" : ""}`}
      role="status"
      aria-live="polite"
      aria-label={title}
    >
      <div className="dashboard-wave-loader-visual" aria-hidden="true">
        <span className="dashboard-wave-bar" />
        <span className="dashboard-wave-bar" />
        <span className="dashboard-wave-bar" />
        <span className="dashboard-wave-bar" />
        <span className="dashboard-wave-bar" />
      </div>
    </div>
  );
}

export default DashboardWaveLoader;
