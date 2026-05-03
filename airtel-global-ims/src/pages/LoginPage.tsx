import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import AirtelLogo from "../components/AirtelLogo";
import DashboardWaveLoader from "../components/DashboardWaveLoader";
import { fetchJson, getApiMessage } from "../api";
import { API_BASE_URL } from "../config";
import type { LoggedInUser } from "../types";

type LoginPageProps = {
  onLoginSuccess: (user: LoggedInUser) => void;
};

type AuthProviders = {
  local: {
    isEnabled: boolean;
    label: string;
  };
  microsoft: {
    isEnabled: boolean;
    label: string;
  };
};

const OTP_TRUST_KEY = "airtel-ims-otp-trust";

function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const OTP_LENGTH = 6;
  const searchParams = new URLSearchParams(window.location.search);
  const resetTokenFromUrl = searchParams.get("resetToken") || "";
  const microsoftCodeFromUrl = searchParams.get("code") || "";
  const microsoftStateFromUrl = searchParams.get("state") || "";
  const microsoftProviderFromUrl = searchParams.get("authProvider") || "";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [emailHint, setEmailHint] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetToken, setResetToken] = useState(resetTokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginMessage, setLoginMessage] = useState("");
  const [loginFieldErrors, setLoginFieldErrors] = useState({ identifier: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isResendingOtp, setIsResendingOtp] = useState(false);
  const [isRequestingReset, setIsRequestingReset] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isValidatingResetToken, setIsValidatingResetToken] = useState(Boolean(resetTokenFromUrl));
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [isStartingMicrosoftLogin, setIsStartingMicrosoftLogin] = useState(false);
  const [isCompletingMicrosoftLogin, setIsCompletingMicrosoftLogin] = useState(
    Boolean(microsoftCodeFromUrl && microsoftStateFromUrl && microsoftProviderFromUrl === "microsoft"),
  );
  const [authProviders, setAuthProviders] = useState<AuthProviders>({
    local: { isEnabled: true, label: "Email or Phone" },
    microsoft: { isEnabled: false, label: "Microsoft" },
  });
  const [authMode, setAuthMode] = useState<"login" | "forgot" | "reset">(resetTokenFromUrl ? "reset" : "login");
  const hasAutoSubmittedOtpRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    const loadAuthProviders = async () => {
      setIsLoadingProviders(true);

      try {
        const { response, data } = await fetchJson<AuthProviders>(`${API_BASE_URL}/auth/providers`);

        if (!response.ok) {
          throw new Error(getApiMessage(data, "Failed to load authentication providers."));
        }

        if (!isCancelled && data) {
          setAuthProviders(data);
        }
      } catch {
        if (!isCancelled) {
          setAuthProviders({
            local: { isEnabled: true, label: "Email or Phone" },
            microsoft: { isEnabled: false, label: "Microsoft" },
          });
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingProviders(false);
        }
      }
    };

    void loadAuthProviders();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!microsoftCodeFromUrl || !microsoftStateFromUrl || microsoftProviderFromUrl !== "microsoft") {
      return;
    }

    let isCancelled = false;

    const completeMicrosoftLogin = async () => {
      setIsCompletingMicrosoftLogin(true);
      setLoginError("");
      setLoginMessage("Completing Microsoft sign in...");

      try {
        const { response, data } = await fetchJson<{ message?: string; otpTrustToken?: string; user?: LoggedInUser }>(`${API_BASE_URL}/auth/microsoft/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            code: microsoftCodeFromUrl,
            state: microsoftStateFromUrl,
          }),
        });

        if (!response.ok) {
          throw new Error(getApiMessage(data, "Microsoft sign in failed."));
        }

        if (data.otpTrustToken) {
          window.localStorage.setItem(OTP_TRUST_KEY, data.otpTrustToken);
        }

        window.history.replaceState({}, document.title, window.location.pathname);
        if (!isCancelled) {
          if (!data.user) {
            throw new Error("Microsoft sign in succeeded but no user was returned.");
          }
          onLoginSuccess(data.user);
        }
      } catch (error) {
        window.history.replaceState({}, document.title, window.location.pathname);
        if (!isCancelled) {
          setLoginError(error instanceof Error ? error.message : "Microsoft sign in failed.");
          setLoginMessage("");
        }
      } finally {
        if (!isCancelled) {
          setIsCompletingMicrosoftLogin(false);
        }
      }
    };

    void completeMicrosoftLogin();

    return () => {
      isCancelled = true;
    };
  }, [microsoftCodeFromUrl, microsoftProviderFromUrl, microsoftStateFromUrl, onLoginSuccess]);

  const handleReset = () => {
    setIdentifier("");
    setPassword("");
    setOtpCode("");
    setChallengeId("");
    setEmailHint("");
    setResetEmail("");
    setNewPassword("");
    setConfirmPassword("");
    setLoginError("");
    setLoginMessage("");
    setLoginFieldErrors({ identifier: "", password: "" });
    if (!resetTokenFromUrl) {
      setAuthMode("login");
    }
    hasAutoSubmittedOtpRef.current = false;
  };

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFieldErrors = {
      identifier: identifier.trim() ? "" : "Please enter mobile number.",
      password: password ? "" : "Please enter password.",
    };

    setLoginFieldErrors(nextFieldErrors);

    if (nextFieldErrors.identifier || nextFieldErrors.password) {
      return;
    }

    setIsLoggingIn(true);
    setLoginError("");
    setLoginMessage("");

    try {
      const { response, data } = await fetchJson<{
        message?: string;
        requiresOtp?: boolean;
        challengeId?: string;
        emailHint?: string;
        otpTrustToken?: string;
        user?: LoggedInUser;
      }>(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          email: identifier,
          password,
          otpTrustToken: window.localStorage.getItem(OTP_TRUST_KEY),
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Login failed."));
      }

      if (data.requiresOtp) {
        setChallengeId(data.challengeId);
        setEmailHint(data.emailHint || "");
        setOtpCode("");
        setLoginMessage(getApiMessage(data, "Verification code was sent."));
        hasAutoSubmittedOtpRef.current = false;
        return;
      }

      if (data.otpTrustToken) {
        window.localStorage.setItem(OTP_TRUST_KEY, data.otpTrustToken);
      }

      if (!data.user) {
        throw new Error("Login succeeded but no user was returned.");
      }

      onLoginSuccess(data.user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    setIsStartingMicrosoftLogin(true);
    setLoginError("");
    setLoginMessage("");

    try {
      const { response, data } = await fetchJson<{ message?: string; authUrl?: string }>(`${API_BASE_URL}/auth/microsoft/start`);

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Microsoft sign in is unavailable."));
      }

      if (!data?.authUrl) {
        throw new Error("Microsoft sign in is unavailable.");
      }

      window.location.assign(data.authUrl);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Microsoft sign in is unavailable.");
      setIsStartingMicrosoftLogin(false);
    }
  };

  const submitOtpVerification = async () => {
    setIsVerifyingOtp(true);
    setLoginError("");
    setLoginMessage("");

    try {
      const { response, data } = await fetchJson<{ message?: string; otpTrustToken?: string; user?: LoggedInUser }>(`${API_BASE_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          emailOtp: otpCode,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "OTP verification failed."));
      }

      if (data.otpTrustToken) {
        window.localStorage.setItem(OTP_TRUST_KEY, data.otpTrustToken);
      }

      if (!data.user) {
        throw new Error("OTP verification succeeded but no user was returned.");
      }

      onLoginSuccess(data.user);
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "OTP verification failed.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleVerifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitOtpVerification();
  };

  const handleResendOtp = async () => {
    setIsResendingOtp(true);
    setLoginError("");
    setLoginMessage("");

    try {
      const { response, data } = await fetchJson<{ message?: string; challengeId?: string; emailHint?: string }>(`${API_BASE_URL}/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to resend OTP."));
      }

      setChallengeId(data?.challengeId || "");
      setEmailHint(data.emailHint || "");
      setOtpCode("");
      setLoginMessage(getApiMessage(data, "Verification code sent again."));
      hasAutoSubmittedOtpRef.current = false;
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Failed to resend OTP.");
    } finally {
      setIsResendingOtp(false);
    }
  };

  const isOtpStep = Boolean(challengeId);
  const isForgotPasswordMode = authMode === "forgot" && !isOtpStep;
  const isResetPasswordMode = authMode === "reset" && !isOtpStep;
  const showLoginLoader = isCompletingMicrosoftLogin || (isLoadingProviders && authMode === "login" && !isOtpStep);
  const showResetLoader = isValidatingResetToken && isResetPasswordMode;
  const authProcessingState = (() => {
    if (isLoggingIn) {
      return {
        title: "Signing you in",
        // description: "Verifying your credentials and opening access to Airtel IMS.",
      };
    }

    if (isVerifyingOtp) {
      return {
        title: "Verifying your OTP",
        // description: "Confirming your one-time verification code .",
      };
    }

    if (isRequestingReset) {
      return {
        title: "Sending reset link",
        description: "Preparing a secure password reset link for your account.",
      };
    }

    if (isResettingPassword) {
      return {
        title: "Saving new password",
        description: "Updating your credentials and securing your account.",
      };
    }

    if (isStartingMicrosoftLogin) {
      return {
        title: "Redirecting to Microsoft",
        description: "Connecting to Microsoft sign-in so you can continue securely.",
      };
    }

    return null;
  })();

  useEffect(() => {
    if (!isOtpStep) {
      return;
    }

    const normalizedOtp = otpCode.trim();

    if (normalizedOtp.length !== OTP_LENGTH) {
      hasAutoSubmittedOtpRef.current = false;
      return;
    }

    if (isVerifyingOtp || isResendingOtp || hasAutoSubmittedOtpRef.current) {
      return;
    }

    hasAutoSubmittedOtpRef.current = true;
    void submitOtpVerification();
  }, [OTP_LENGTH, challengeId, isOtpStep, isResendingOtp, isVerifyingOtp, otpCode]);

  useEffect(() => {
    if (!resetToken) {
      setIsValidatingResetToken(false);
      return;
    }

    let isCancelled = false;

    const validateResetToken = async () => {
      setIsValidatingResetToken(true);
      setLoginError("");

      try {
        const { response, data } = await fetchJson<{ valid?: boolean; message?: string }>(`${API_BASE_URL}/auth/password-reset/validate?token=${encodeURIComponent(resetToken)}`);

        if (!response.ok) {
          throw new Error(getApiMessage(data, "Unable to validate this reset link right now."));
        }

        if (!data?.valid) {
          throw new Error(getApiMessage(data, "This reset link is invalid."));
        }

        if (!isCancelled) {
          setLoginMessage("Enter your new password to complete the reset.");
        }
      } catch (error) {
        if (!isCancelled) {
          window.history.replaceState({}, document.title, window.location.pathname);
          setResetToken("");
          setAuthMode("forgot");
          setLoginError(error instanceof Error ? error.message : "This reset link is invalid.");
        }
      } finally {
        if (!isCancelled) {
          setIsValidatingResetToken(false);
        }
      }
    };

    void validateResetToken();

    return () => {
      isCancelled = true;
    };
  }, [resetToken]);

  const handleRequestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsRequestingReset(true);
    setLoginError("");
    setLoginMessage("");

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/auth/password-reset/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: resetEmail }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to send reset link."));
      }

      setLoginMessage(getApiMessage(data, "If the email exists, a reset link has been sent."));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Failed to send reset link.");
    } finally {
      setIsRequestingReset(false);
    }
  };

  const handleCompletePasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginError("");
    setLoginMessage("");

    if (newPassword !== confirmPassword) {
      setLoginError("New password and confirm password must match.");
      return;
    }

    setIsResettingPassword(true);

    try {
      const { response, data } = await fetchJson<{ message?: string }>(`${API_BASE_URL}/auth/password-reset/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: resetToken,
          newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to reset password."));
      }

      window.history.replaceState({}, document.title, window.location.pathname);
      setResetToken("");
      setNewPassword("");
      setConfirmPassword("");
      setAuthMode("login");
      setLoginMessage(getApiMessage(data, "Password reset successfully."));
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "Failed to reset password.");
    } finally {
      setIsResettingPassword(false);
    }
  };

  return (
    <div className="page-shell auth-shell">
      <section className="auth-card">
        <div className="auth-brand-panel">
          <div className="auth-brand">
            <AirtelLogo />
            <p className="eyebrow">Secure Access Portal</p>
            <h1>Sign in to airtel IMS</h1>
            <p className="lede">Access your inventory dashboard.</p>
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-header">
            <p className="eyebrow">{isOtpStep ? "Verification" : isForgotPasswordMode ? "Password reset" : isResetPasswordMode ? "Set new password" : "Login"}</p>
            <h2>{isOtpStep ? "Verify sign in" : isForgotPasswordMode ? "Forgot password" : isResetPasswordMode ? "Create new password" : "Welcome back"}</h2>
            <p>
              {isOtpStep
                ? "Enter the verification code from your email."
                : isForgotPasswordMode
                  ? "Enter your account email to receive a secure reset link."
                  : isResetPasswordMode
                    ? "Set a new password to regain access to your account."
                    : "" }
            </p>
          </div>

          {showLoginLoader ? (
            <DashboardWaveLoader
              compact
              title={isCompletingMicrosoftLogin ? "Completing sign in" : "Loading secure access"}
              description={
                isCompletingMicrosoftLogin
                  ? "Finishing Microsoft authentication and preparing your Airtel IMS session."
                  : "Checking available sign-in methods and preparing the login experience."
              }
            />
          ) : showResetLoader ? (
            <DashboardWaveLoader
              compact
              title="Validating reset link"
              description="Confirming your secure password reset link before you create a new password."
            />
          ) : isOtpStep ? (
            <form className="login-form" onSubmit={handleVerifyOtp}>
              <label className="field">
                <span>Verification code</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otpCode}
                  onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
                  placeholder={`Sent to ${emailHint}`}
                  maxLength={OTP_LENGTH}
                  autoFocus
                  required
                />
              </label>

              {loginMessage ? <p className="form-message success-text">{loginMessage}</p> : null}
              {loginError ? <p className="form-message error-text">{loginError}</p> : null}

              <div className="form-actions">
                <button className="primary-btn submit-btn" type="submit" disabled={isVerifyingOtp}>
                  {isVerifyingOtp ? "Verifying..." : "Verify OTP"}
                </button>
                <button
                  className="secondary-btn submit-btn"
                  type="button"
                  onClick={handleResendOtp}
                  disabled={isResendingOtp}
                >
                  {isResendingOtp ? "Sending..." : "Resend OTP"}
                </button>
                <button className="secondary-btn submit-btn" type="button" onClick={handleReset} disabled={isVerifyingOtp}>
                  Start over
                </button>
              </div>
            </form>
          ) : isForgotPasswordMode ? (
            <form className="login-form" onSubmit={handleRequestPasswordReset}>
              <label className="field">
                <span>Email address</span>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={(event) => setResetEmail(event.target.value)}
                  placeholder="Enter your account email"
                  required
                />
              </label>

              {loginMessage ? <p className="form-message success-text">{loginMessage}</p> : null}
              {loginError ? <p className="form-message error-text">{loginError}</p> : null}

              <div className="form-actions">
                <button className="primary-btn submit-btn" type="submit" disabled={isRequestingReset}>
                  {isRequestingReset ? "Sending..." : "Send reset link"}
                </button>
                <button
                  className="secondary-btn submit-btn"
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setLoginError("");
                    setLoginMessage("");
                  }}
                  disabled={isRequestingReset}
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : isResetPasswordMode ? (
            <form className="login-form" onSubmit={handleCompletePasswordReset}>
              <label className="field">
                <span>New password</span>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Create new password"
                  required
                  disabled={isValidatingResetToken}
                />
              </label>

              <label className="field">
                <span>Confirm new password</span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Confirm new password"
                  required
                  disabled={isValidatingResetToken}
                />
              </label>

              {loginMessage ? <p className="form-message success-text">{loginMessage}</p> : null}
              {loginError ? <p className="form-message error-text">{loginError}</p> : null}

              <div className="form-actions">
                <button
                  className="primary-btn submit-btn"
                  type="submit"
                  disabled={isValidatingResetToken || isResettingPassword || Boolean(loginError && !loginMessage)}
                >
                  {isResettingPassword ? "Saving..." : "Reset password"}
                </button>
                <button
                  className="secondary-btn submit-btn"
                  type="button"
                  onClick={() => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    setResetToken("");
                    setAuthMode("login");
                    setLoginError("");
                    setLoginMessage("");
                  }}
                  disabled={isResettingPassword}
                >
                  Back to login
                </button>
              </div>
            </form>
          ) : (
            <form className="login-form" onSubmit={handleLogin}>
              <label className="field">
                <span>Email address or phone number</span>
                <input
                  type="text"
                  value={identifier}
                  onChange={(event) => {
                    setIdentifier(event.target.value);
                    setLoginFieldErrors((currentErrors) => ({ ...currentErrors, identifier: "" }));
                  }}
                  placeholder="Enter your email or phone number"
                />
                {loginFieldErrors.identifier ? <span className="field-error">{loginFieldErrors.identifier}</span> : null}
              </label>

              <label className="field">
                <span>Password</span>
                <div className="password-field-shell">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      setLoginFieldErrors((currentErrors) => ({ ...currentErrors, password: "" }));
                    }}
                    placeholder="Enter your password"
                  />
                  <button
                    className="password-toggle-button"
                    type="button"
                    onClick={() => setShowPassword((isVisible) => !isVisible)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff size={22} /> : <Eye size={22} />}
                  </button>
                </div>
                {loginFieldErrors.password ? <span className="field-error">{loginFieldErrors.password}</span> : null}
              </label>

              <div className="auth-inline-row">
                <button
                  className="auth-link-button"
                  type="button"
                  onClick={() => {
                    setAuthMode("forgot");
                    setLoginError("");
                    setLoginMessage("");
                  }}
                  disabled={isLoggingIn}
                >
                  Forgot password?
                </button>
              </div>

              {loginMessage ? <p className="form-message success-text">{loginMessage}</p> : null}
              {loginError ? <p className="form-message error-text">{loginError}</p> : null}
              <div className="form-actions">
                <button className="primary-btn submit-btn" type="submit" disabled={isLoggingIn}>
                  {isLoggingIn ? "Signing in..." : "Login"}
                </button>
                {authProviders.microsoft.isEnabled ? (
                  <button
                    className="secondary-btn submit-btn"
                    type="button"
                    onClick={() => void handleMicrosoftLogin()}
                    disabled={isStartingMicrosoftLogin || isCompletingMicrosoftLogin || isLoadingProviders}
                  >
                    {isStartingMicrosoftLogin ? "Redirecting..." : "Sign in with Microsoft"}
                  </button>
                ) : null}
              </div>
            </form>
          )}
          {authProcessingState ? (
            <div className="auth-processing-overlay" role="presentation">
              <div className="auth-processing-panel">
                <DashboardWaveLoader
                  compact
                  title={authProcessingState.title}
                  description={authProcessingState.description}
                />
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export default LoginPage;
