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

function DisabledChart(_: SharedChartProps) {
  return null;
}

export const HorizontalBarChart = DisabledChart;
export const BarChart = DisabledChart;
export const PercentageTrendChart = DisabledChart;
export const DonutChart = DisabledChart;
