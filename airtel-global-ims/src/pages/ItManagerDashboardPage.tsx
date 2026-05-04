import WorkflowRoleDashboard from "../components/WorkflowRoleDashboard";
import type { LoggedInUser } from "../types";

type ItManagerDashboardPageProps = {
  user: LoggedInUser;
  onLogout: () => void;
  onUserUpdate: (user: LoggedInUser) => void;
};

function ItManagerDashboardPage({ user, onLogout, onUserUpdate }: ItManagerDashboardPageProps) {
  const normalizedRole = user.role.trim().toLowerCase();
  const roleView = normalizedRole === "it security manager"
    ? "it-security"
    : normalizedRole === "it infrastructure manager"
      ? "it-infrastructure"
      : "it-manager";

  return (
    <WorkflowRoleDashboard
      user={user}
      onLogout={onLogout}
      onUserUpdate={onUserUpdate}
      roleView={roleView}
    />
  );
}

export default ItManagerDashboardPage;
