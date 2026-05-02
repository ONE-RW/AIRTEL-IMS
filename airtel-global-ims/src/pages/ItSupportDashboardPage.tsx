import WorkflowRoleDashboard from "../components/WorkflowRoleDashboard";
import type { LoggedInUser } from "../types";

type ItSupportDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

function ItSupportDashboardPage({ user, onLogout, onUserUpdate }: ItSupportDashboardPageProps) {
  return <WorkflowRoleDashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} roleView="it-support" />;
}

export default ItSupportDashboardPage;
