import WorkflowRoleDashboard from "../components/WorkflowRoleDashboard";
import type { LoggedInUser } from "../types";

type EmployeeDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

function EmployeeDashboardPage({ user, onLogout, onUserUpdate }: EmployeeDashboardPageProps) {
  return <WorkflowRoleDashboard user={user} onLogout={onLogout} onUserUpdate={onUserUpdate} roleView="employee" />;
}

export default EmployeeDashboardPage;
