import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

type OverviewShortcutCardProps = {
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  actionLabel: string;
  onClick: () => void;
  className?: string;
  kicker?: string;
  insight?: string;
};

function OverviewShortcutCard({
  title,
  value,
  description,
  icon: Icon,
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
        <span className="metric-card-icon" aria-hidden="true">
          <Icon size={20} strokeWidth={2.2} />
        </span>
      </div>
      {insight ? <span className="metric-insight">{insight}</span> : null}
      <strong>{value}</strong>
      <p>{description}</p>
      <span className="metric-card-action">
        {actionLabel}
        <ArrowRight size={16} strokeWidth={2.4} />
      </span>
    </button>
  );
}

export default OverviewShortcutCard;
