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
  variant?: "default" | "hero";
};

const chartPalette = ["#9fc5f8", "#e8b6ea", "#ffe0a3", "#b8efbf", "#7fd9e2", "#b8baf5", "#f7b0b0", "#f5d38a"];

function getChartColor(item: ChartDatum, index: number) {
  return item.color || chartPalette[index % chartPalette.length];
}

function formatChartValue(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return String(value);
}

function formatPercent(value: number, total: number) {
  if (!total) {
    return "0%";
  }

  const percent = (value / total) * 100;
  return `${percent >= 10 ? Math.round(percent) : percent.toFixed(1)}%`;
}

function renderEmptyState(emptyLabel?: string) {
  return <p className="chart-empty-state">{emptyLabel || "No chart data available."}</p>;
}

export function HorizontalBarChart({ data, emptyLabel, activeLabel, onSelect }: SharedChartProps) {
  return <BarChart data={data} emptyLabel={emptyLabel} activeLabel={activeLabel} onSelect={onSelect} />;
}

export function BarChart({ data, emptyLabel, activeLabel, onSelect }: SharedChartProps) {
  const chartData = data.filter((item) => Number.isFinite(item.value) && item.value >= 0);
  const maxValue = Math.max(...chartData.map((item) => item.value), 0);
  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (chartData.length === 0 || maxValue === 0 || total === 0) {
    return renderEmptyState(emptyLabel);
  }

  return (
    <div className="bar-chart-grid">
      {chartData.map((item, index) => {
        const isActive = activeLabel === item.label;
        const height = `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 5 : 0)}%`;
        const color = getChartColor(item, index);

        return (
          <button
            key={item.label}
            className={`bar-chart-item${isActive ? " is-active" : ""}`}
            type="button"
            onClick={() => onSelect?.(item.label)}
          >
            <span className="bar-chart-value">{formatPercent(item.value, total)}</span>
            <div className="bar-chart-column-wrap">
              <span className="bar-chart-column" style={{ height, background: color }} />
            </div>
            <span className="bar-chart-label">{item.label}</span>
            <small className="bar-chart-subvalue">{formatChartValue(item.value)}</small>
          </button>
        );
      })}
    </div>
  );
}

export function DonutChart({ data, emptyLabel, activeLabel, onSelect, variant = "default" }: SharedChartProps) {
  const chartData = data.filter((item) => Number.isFinite(item.value) && item.value > 0);
  const total = chartData.reduce((sum, item) => sum + item.value, 0);

  if (chartData.length === 0 || total === 0) {
    return renderEmptyState(emptyLabel);
  }

  const activeItem = chartData.find((item) => item.label === activeLabel) || chartData[0];
  const svgSize = variant === "hero" ? 240 : 180;
  const center = svgSize / 2;
  const radius = variant === "hero" ? 92 : 68;
  let currentAngle = -Math.PI / 2;

  const describeSlice = (startAngle: number, endAngle: number) => {
    const startX = center + radius * Math.cos(startAngle);
    const startY = center + radius * Math.sin(startAngle);
    const endX = center + radius * Math.cos(endAngle);
    const endY = center + radius * Math.sin(endAngle);
    const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

    return [
      `M ${center} ${center}`,
      `L ${startX} ${startY}`,
      `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}`,
      "Z",
    ].join(" ");
  };

  return (
    <div className={variant === "hero" ? "chart-donut-layout chart-donut-layout-hero chart-pie-layout" : "chart-donut-layout chart-pie-layout"}>
      <div className="chart-donut-wrap chart-pie-wrap">
        <svg
          className={variant === "hero" ? "chart-donut-svg chart-donut-svg-hero chart-pie-svg" : "chart-donut-svg chart-pie-svg"}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          role="img"
          aria-label={`${activeItem.label}: ${activeItem.value}`}
        >
          {chartData.map((item, index) => {
            const sliceAngle = (item.value / total) * Math.PI * 2;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sliceAngle;
            currentAngle = endAngle;
            const color = getChartColor(item, index);
            const isActive = item.label === activeItem.label;

            return (
              <path
                key={item.label}
                className={`chart-pie-slice${isActive ? " is-active" : ""}`}
                d={describeSlice(startAngle, endAngle)}
                fill={color}
                onClick={() => onSelect?.(item.label)}
              />
            );
          })}
        </svg>
      </div>
      <div className="chart-pie-summary">
        <div className="chart-pie-highlight">
          <span>{activeItem.label}</span>
          <strong>{formatPercent(activeItem.value, total)}</strong>
          <small>{formatChartValue(activeItem.value)} items</small>
        </div>
        <div className="chart-legend">
        {chartData.map((item, index) => {
          const isActive = item.label === activeItem.label;
          const color = getChartColor(item, index);

          return (
            <button
              key={item.label}
              className={`chart-legend-button${isActive ? " is-active" : ""}`}
              type="button"
              onClick={() => onSelect?.(item.label)}
            >
              <div className="chart-legend-row">
                <span className="chart-legend-swatch" style={{ background: color }} />
                <strong>{item.label}</strong>
                <span>{formatPercent(item.value, total)}</span>
                <span>{formatChartValue(item.value)}</span>
              </div>
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}

export function PercentageTrendChart({ data, emptyLabel, activeLabel, onSelect }: SharedChartProps) {
  return <BarChart data={data} emptyLabel={emptyLabel} activeLabel={activeLabel} onSelect={onSelect} />;
}
