import { ArrowRight } from "lucide-react";

type OverviewShortcutCardProps = {
  title: string;
  value: string | number;
  actionLabel?: string;
  onClick: () => void;
  className?: string;
  kicker?: string;
  insight?: string;
};

function OverviewShortcutCard({
  title,
  value,
  actionLabel,
  onClick,
  className = "",
  kicker,
  insight,
}: OverviewShortcutCardProps) {
  return (
    <button className={`dashboard-metric-card clickable-metric-card ${className}`.trim()} type="button" onClick={onClick}>
      <div className="metric-card-head">
        <div>
          {kicker ? <p className="metric-kicker">{kicker}</p> : null}
          <h3>{title}</h3>
        </div>
      </div>
      <strong>{value}</strong>
      {insight ? <span className="metric-insight">{insight}</span> : null}
      {actionLabel ? (
        <span className="metric-card-action">
          {actionLabel}
          <ArrowRight size={16} strokeWidth={2.4} />
        </span>
      ) : null}
    </button>
  );
}

export default OverviewShortcutCard;
