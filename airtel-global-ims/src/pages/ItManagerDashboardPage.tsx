import WorkflowRoleDashboard from "../components/WorkflowRoleDashboard";
import type { LoggedInUser } from "../types";

type ItManagerDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

function ItManagerDashboardPage({ user, onLogout, onUserUpdate }: ItManagerDashboardPageProps) {
  return <WorkflowRoleDashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} roleView="it-manager" />;
}

export default ItManagerDashboardPage;
