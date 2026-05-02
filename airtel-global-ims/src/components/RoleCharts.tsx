type ChartDatum = {
  label: string;
  value: number;
  color?: string;
};

type SharedChartProps = {
  data: ChartDatum[];
  emptyLabel?: string;
  activeLabel?: string | null;
  onSelect?: (label: string) => void;
};

const defaultPalette = [
  "#d40909",
  "#f25b5b",
  "#1d6fa5",
  "#16824f",
  "#f59e0b",
  "#7c3aed",
];

function resolveChartData(data: ChartDatum[]) {
  return data.map((item, index) => ({
    ...item,
    color: item.color || defaultPalette[index % defaultPalette.length],
  }));
}

export function HorizontalBarChart({ data, emptyLabel = "No data available.", activeLabel = null, onSelect }: SharedChartProps) {
  const resolved = resolveChartData(data);
  const maxValue = Math.max(...resolved.map((item) => item.value), 0);

  if (resolved.length === 0 || maxValue === 0) {
    return <p className="chart-empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="chart-stack">
      {resolved.map((item) => (
        <button
          className={`chart-bar-row chart-interactive-row${activeLabel === item.label ? " is-active" : ""}`}
          key={item.label}
          type="button"
          onClick={() => onSelect?.(item.label)}
        >
          <div className="chart-bar-meta">
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </div>
          <div className="chart-bar-track">
            <div
              className="chart-bar-fill"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                background: item.color,
              }}
            />
          </div>
        </button>
      ))}
    </div>
  );
}

export function DonutChart({ data, emptyLabel = "No data available.", activeLabel = null, onSelect }: SharedChartProps) {
  const resolved = resolveChartData(data).filter((item) => item.value > 0);
  const total = resolved.reduce((sum, item) => sum + item.value, 0);

  if (resolved.length === 0 || total === 0) {
    return <p className="chart-empty-state">{emptyLabel}</p>;
  }

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offsetAccumulator = 0;

  return (
    <div className="chart-donut-layout">
      <div className="chart-donut-wrap" aria-hidden="true">
        <svg className="chart-donut-svg" viewBox="0 0 120 120">
          <circle className="chart-donut-ring" cx="60" cy="60" r={radius} />
          {resolved.map((item) => {
            const segmentLength = (item.value / total) * circumference;
            const strokeDasharray = `${segmentLength} ${circumference - segmentLength}`;
            const strokeDashoffset = -offsetAccumulator;
            offsetAccumulator += segmentLength;

            return (
              <circle
                key={item.label}
                className={`chart-donut-segment${activeLabel === item.label ? " is-active" : ""}`}
                cx="60"
                cy="60"
                r={radius}
                stroke={item.color}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                onClick={() => onSelect?.(item.label)}
              />
            );
          })}
        </svg>
        <div className="chart-donut-center">
          <strong>{total}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="chart-legend">
        {resolved.map((item) => (
          <button
            className={`chart-legend-row chart-legend-button${activeLabel === item.label ? " is-active" : ""}`}
            key={item.label}
            type="button"
            onClick={() => onSelect?.(item.label)}
          >
            <span className="chart-legend-swatch" style={{ background: item.color }} />
            <strong>{item.label}</strong>
            <span>{item.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
