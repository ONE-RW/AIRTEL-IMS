import WorkflowRoleDashboard from "../components/WorkflowRoleDashboard";
import type { LoggedInUser } from "../types";

type WarehouseDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

function WarehouseDashboardPage({ user, onLogout, onUserUpdate }: WarehouseDashboardPageProps) {
  return <WorkflowRoleDashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} roleView="warehouse" />;
}

export default WarehouseDashboardPage;
