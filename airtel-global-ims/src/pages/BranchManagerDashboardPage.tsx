import WorkflowRoleDashboard from "../components/WorkflowRoleDashboard";
import type { LoggedInUser } from "../types";

type BranchManagerDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

function BranchManagerDashboardPage({ user, onLogout, onUserUpdate }: BranchManagerDashboardPageProps) {
  return <WorkflowRoleDashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} roleView="branch-manager" />;
}

export default BranchManagerDashboardPage;
