import { useEffect, useRef, useState } from "react";
import { SESSION_KEY } from "./config";
import LoginPage from "./pages/LoginPage";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import HrDashboardPage from "./pages/HrDashboardPage";
import ItManagerDashboardPage from "./pages/ItManagerDashboardPage";
import ItSupportDashboardPage from "./pages/ItSupportDashboardPage";
import WarehouseDashboardPage from "./pages/WarehouseDashboardPage";
import EmployeeDashboardPage from "./pages/EmployeeDashboardPage";
import HRDirectorDashboard from "./pages/HRDirectorDashboard";
import AiChatAssistant from "./components/AiChatAssistant";
import { fetchJson, getApiMessage } from "./api";
import { API_BASE_URL } from "./config";
import type { LoggedInUser } from "./types";

const INACTIVITY_LIMIT_MS = 5 * 60 * 1000;
const WARNING_WINDOW_MS = 60 * 1000;
const SESSION_ACTIVITY_KEY = "airtel-ims-last-activity";

function navigateTo(path: string, replace = false) {
  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function normalizePath(path: string) {
  if (!path || path === "/") {
    return "/";
  }

  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function normalizeRoleName(role: string | null | undefined) {
  return String(role || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAdminRole(role: string | null | undefined) {
  return normalizeRoleName(role) === "admin";
}

function isHrDirectorRole(role: string | null | undefined) {
  const normalizedRole = normalizeRoleName(role);
  return normalizedRole === "hr director" || normalizedRole === "hrd";
}

function isHrRole(role: string | null | undefined) {
  const normalizedRole = normalizeRoleName(role);
  return normalizedRole === "hr department" || normalizedRole === "hr recruitment officer" || normalizedRole === "hr";
}

function isItDirectorRole(role: string | null | undefined) {
  const normalizedRole = normalizeRoleName(role);
  return normalizedRole === "it director" || normalizedRole === "it infrastructure manager" || normalizedRole === "itd";
}

function isItSupportRole(role: string | null | undefined) {
  const normalizedRole = normalizeRoleName(role);
  return (
    normalizedRole === "it support engineer" ||
    normalizedRole === "it officer" ||
    normalizedRole === "it security manager" ||
    normalizedRole.includes("it support")
  );
}

function isWarehouseRole(role: string | null | undefined) {
  const normalizedRole = normalizeRoleName(role);
  return (
    normalizedRole === "warehouse manager" ||
    normalizedRole === "warehouse officer" ||
    normalizedRole === "storekeeper" ||
    normalizedRole.includes("warehouse")
  );
}

function getPathForRole(role: string) {
  if (isAdminRole(role)) {
    return "/admin";
  }

  if (isHrDirectorRole(role)) {
    return "/hr-director";
  }

  if (isItDirectorRole(role)) {
    return "/it-director";
  }

  if (isItSupportRole(role)) {
    return "/it-support";
  }

  if (isWarehouseRole(role)) {
    return "/warehouse";
  }

  const normalizedRole = normalizeRoleName(role);
  if (normalizedRole === "it security manager") {
    return "/it-security";
  }

  if (normalizedRole === "hr recruitment officer") {
    return "/hrms";
  }

  if (normalizedRole === "hr department") {
    return "/hr-dept";
  }

  if (normalizedRole === "it officer") {
    return "/it-officer";
  }

  if (normalizedRole === "it infrastructure manager") {
    return "/it-infra";
  }

  if (normalizedRole === "employee") {
    return "/employee";
  }

  return "/admin";
}

function pathMatchesRoleBase(currentPath: string, basePath: string) {
  return currentPath === basePath || currentPath.startsWith(`${basePath}/`);
}

function App() {
  const [pathname, setPathname] = useState(normalizePath(window.location.pathname));
  const [user, setUser] = useState<LoggedInUser | null>(() => {
    const saved = window.sessionStorage.getItem(SESSION_KEY);
    return saved ? (JSON.parse(saved) as LoggedInUser) : null;
  });
  const [isSessionWarningVisible, setIsSessionWarningVisible] = useState(false);
  const [sessionWarningSeconds, setSessionWarningSeconds] = useState(60);
  const [forcedPasswordForm, setForcedPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [forcedPasswordError, setForcedPasswordError] = useState("");
  const [isForcedPasswordSaving, setIsForcedPasswordSaving] = useState(false);
  const inactivityTimeoutRef = useRef<number | null>(null);
  const warningTimeoutRef = useRef<number | null>(null);
  const warningIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleRouteChange = () => setPathname(normalizePath(window.location.pathname));
    window.addEventListener("popstate", handleRouteChange);
    return () => window.removeEventListener("popstate", handleRouteChange);
  }, []);

  useEffect(() => {
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_ACTIVITY_KEY);
  }, []);

  useEffect(() => {
    const currentPath = normalizePath(pathname);
    const expectedPath = user ? getPathForRole(user.role) : "/";

    if (user && currentPath === "/") {
      navigateTo(expectedPath, true);
      return;
    }

    if (!user && currentPath !== "/") {
      navigateTo("/", true);
      return;
    }

    if (user && currentPath !== "/" && !pathMatchesRoleBase(currentPath, expectedPath)) {
      navigateTo(expectedPath, true);
    }
  }, [pathname, user]);

  const handleLoginSuccess = (loggedInUser: LoggedInUser) => {
    setUser(loggedInUser);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(loggedInUser));
    window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
    window.localStorage.removeItem(SESSION_KEY);
    window.localStorage.removeItem(SESSION_ACTIVITY_KEY);
    navigateTo(getPathForRole(loggedInUser.role), true);
  };

  const handleLogout = () => {
    setUser(null);
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_ACTIVITY_KEY);
    setIsSessionWarningVisible(false);
    navigateTo("/", true);
  };

  const handleUserUpdate = (updatedUser: LoggedInUser) => {
    setUser(updatedUser);
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(updatedUser));
  };

  const handleForcedPasswordSubmit = async () => {
    if (!user) {
      return;
    }

    setForcedPasswordError("");

    if (!forcedPasswordForm.currentPassword || !forcedPasswordForm.newPassword || !forcedPasswordForm.confirmPassword) {
      setForcedPasswordError("Current password, new password, and confirmation are required.");
      return;
    }

    if (forcedPasswordForm.newPassword !== forcedPasswordForm.confirmPassword) {
      setForcedPasswordError("New password and confirmation do not match.");
      return;
    }

    setIsForcedPasswordSaving(true);

    try {
      const { response, data } = await fetchJson<{ message?: string; user?: LoggedInUser }>(`${API_BASE_URL}/account/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currentPassword: forcedPasswordForm.currentPassword,
          newPassword: forcedPasswordForm.newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to update password."));
      }

      if (data?.user) {
        handleUserUpdate(data.user);
      } else {
        handleUserUpdate({ ...user, mustChangePassword: false });
      }

      setForcedPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
    } catch (error) {
      setForcedPasswordError(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setIsForcedPasswordSaving(false);
    }
  };

  useEffect(() => {
    if (!user) {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }
      if (warningTimeoutRef.current) {
        window.clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }
      if (warningIntervalRef.current) {
        window.clearInterval(warningIntervalRef.current);
        warningIntervalRef.current = null;
      }
      return;
    }

    const clearSessionTimers = () => {
      if (inactivityTimeoutRef.current) {
        window.clearTimeout(inactivityTimeoutRef.current);
        inactivityTimeoutRef.current = null;
      }

      if (warningTimeoutRef.current) {
        window.clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }

      if (warningIntervalRef.current) {
        window.clearInterval(warningIntervalRef.current);
        warningIntervalRef.current = null;
      }
    };

    const syncActivity = () => {
      window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
    };

    const showSessionWarning = (timeRemaining: number) => {
      setIsSessionWarningVisible(true);
      setSessionWarningSeconds(Math.max(Math.ceil(timeRemaining / 1000), 1));

      if (warningIntervalRef.current) {
        window.clearInterval(warningIntervalRef.current);
      }

      warningIntervalRef.current = window.setInterval(() => {
        const lastActivity = Number(window.sessionStorage.getItem(SESSION_ACTIVITY_KEY) || Date.now());
        const secondsRemaining = Math.max(Math.ceil((INACTIVITY_LIMIT_MS - (Date.now() - lastActivity)) / 1000), 0);
        setSessionWarningSeconds(secondsRemaining);
      }, 1000);
    };

    const scheduleLogout = () => {
      clearSessionTimers();
      const lastActivity = Number(window.sessionStorage.getItem(SESSION_ACTIVITY_KEY) || Date.now());
      const timeRemaining = Math.max(INACTIVITY_LIMIT_MS - (Date.now() - lastActivity), 0);

      if (timeRemaining <= WARNING_WINDOW_MS) {
        showSessionWarning(timeRemaining);
      } else {
        setIsSessionWarningVisible(false);
        setSessionWarningSeconds(Math.ceil(WARNING_WINDOW_MS / 1000));
        warningTimeoutRef.current = window.setTimeout(() => {
          showSessionWarning(WARNING_WINDOW_MS);
        }, timeRemaining - WARNING_WINDOW_MS);
      }

      inactivityTimeoutRef.current = window.setTimeout(() => {
        setUser(null);
        window.sessionStorage.removeItem(SESSION_KEY);
        window.sessionStorage.removeItem(SESSION_ACTIVITY_KEY);
        setIsSessionWarningVisible(false);
        navigateTo("/", true);
      }, timeRemaining);
    };

    const handleActivity = () => {
      setIsSessionWarningVisible(false);
      syncActivity();
      scheduleLogout();
    };

    const activityEvents: Array<keyof WindowEventMap> = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    if (!window.sessionStorage.getItem(SESSION_ACTIVITY_KEY)) {
      syncActivity();
    }

    scheduleLogout();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, handleActivity, { passive: true }));

    return () => {
      clearSessionTimers();
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
    };
  }, [user]);

  const handleContinueSession = () => {
    window.sessionStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
    setIsSessionWarningVisible(false);
  };

  if (!user || normalizePath(pathname) === "/") {
    return (
      <>
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  let dashboardView;
  const normalizedUserRole = normalizeRoleName(user.role);
  if (isAdminRole(user.role)) {
    dashboardView = <AdminDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else if (isHrDirectorRole(user.role)) {
    dashboardView = <HRDirectorDashboard user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else if (isHrRole(user.role)) {
    dashboardView = <HrDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else if (isItDirectorRole(user.role)) {
    dashboardView = <ItManagerDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else if (isItSupportRole(user.role)) {
    dashboardView = <ItSupportDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else if (isWarehouseRole(user.role)) {
    dashboardView = <WarehouseDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else if (normalizedUserRole === "employee") {
    dashboardView = <EmployeeDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  } else {
    // Fallback to Admin for any unhandled roles or old roles during transition
    dashboardView = <AdminDashboardPage user={user} onLogout={handleLogout} onUserUpdate={handleUserUpdate} />;
  }

  return (
    <>
      {dashboardView}
      <AiChatAssistant user={user} />
      {user.mustChangePassword ? (
        <div className="session-warning-overlay" role="presentation">
          <div className="session-warning-card" role="alertdialog" aria-labelledby="password-change-title" aria-modal="true">
            <p className="session-warning-kicker">First Login Security</p>
            <h2 id="password-change-title">Change your temporary password</h2>
            <p>
              Your account was created with a temporary password. Set a new password before you can continue using the system.
            </p>
            <div className="simple-form" style={{ marginTop: "1rem" }}>
              <label className="field">
                <span>Current temporary password</span>
                <input
                  type="password"
                  value={forcedPasswordForm.currentPassword}
                  onChange={(event) => setForcedPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))}
                  required
                />
              </label>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={forcedPasswordForm.newPassword}
                  onChange={(event) => setForcedPasswordForm((current) => ({ ...current, newPassword: event.target.value }))}
                  minLength={6}
                  required
                />
              </label>
              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={forcedPasswordForm.confirmPassword}
                  onChange={(event) => setForcedPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                  minLength={6}
                  required
                />
              </label>
              {forcedPasswordError ? <p className="form-message error-text">{forcedPasswordError}</p> : null}
            </div>
            <div className="session-warning-actions">
              <button className="primary-btn compact-btn" type="button" onClick={() => void handleForcedPasswordSubmit()} disabled={isForcedPasswordSaving}>
                {isForcedPasswordSaving ? "Updating..." : "Change password"}
              </button>
              <button className="secondary-btn compact-btn" type="button" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {isSessionWarningVisible ? (
        <div className="session-warning-overlay" role="presentation">
          <div className="session-warning-card" role="alertdialog" aria-labelledby="session-warning-title" aria-modal="true">
            <p className="session-warning-kicker">Session warning</p>
            <h2 id="session-warning-title">You will be logged out soon</h2>
            <p>
              No activity has been detected. Your session will expire in{" "}
              <strong>{sessionWarningSeconds}</strong> seconds.
            </p>
            <div className="session-warning-actions">
              <button className="primary-btn compact-btn" type="button" onClick={handleContinueSession}>
                Continue session
              </button>
              <button className="secondary-btn compact-btn" type="button" onClick={handleLogout}>
                Logout now
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default App;
