import { FormEvent, useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { fetchJson, getApiMessage } from "../api";
import { API_BASE_URL } from "../config";
import type { LoggedInUser } from "../types";

type AccountSettingsPanelProps = {
  user: LoggedInUser;
  onUserUpdate: (user: LoggedInUser) => void;
};

function isValidAirtelRwandaPhone(value: string) {
  const digitsOnly = String(value || "").replace(/\D/g, "");

  if (!digitsOnly) {
    return true;
  }

  return (
    /^07[23]\d{7}$/.test(digitsOnly) ||
    /^2507[23]\d{7}$/.test(digitsOnly)
  );
}

function AccountSettingsPanel({ user, onUserUpdate }: AccountSettingsPanelProps) {
  const [profileForm, setProfileForm] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phoneNumber: user.phoneNumber || "",
    profileImageUrl: user.profileImageUrl || "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  useEffect(() => {
    setProfileForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneNumber: user.phoneNumber || "",
      profileImageUrl: user.profileImageUrl || "",
    });
  }, [user.email, user.firstName, user.lastName, user.phoneNumber, user.profileImageUrl]);

  const compressProfileImage = async (file: File) => {
    const imageUrl = URL.createObjectURL(file);

    try {
      const imageElement = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Failed to load selected image."));
        image.src = imageUrl;
      });

      const maxDimension = 480;
      const scale = Math.min(maxDimension / imageElement.width, maxDimension / imageElement.height, 1);
      const width = Math.max(Math.round(imageElement.width * scale), 1);
      const height = Math.max(Math.round(imageElement.height * scale), 1);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Image processing is not available in this browser.");
      }

      context.drawImage(imageElement, 0, 0, width, height);

      return canvas.toDataURL("image/jpeg", 0.82);
    } finally {
      URL.revokeObjectURL(imageUrl);
    }
  };

  const handleProfileImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setProfileError("Please choose a valid image file.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      setProfileError("Profile picture must be 8 MB or smaller.");
      return;
    }

    const dataUrl = await compressProfileImage(file).catch((error: unknown) => {
      setProfileError(error instanceof Error ? error.message : "Failed to load image.");
      return "";
    });

    if (!dataUrl) {
      return;
    }

    setProfileError("");
    setProfileForm((current) => ({ ...current, profileImageUrl: dataUrl }));
  };

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsProfileSaving(true);
    setProfileMessage("");
    setProfileError("");

    if (!isValidAirtelRwandaPhone(profileForm.phoneNumber)) {
      setProfileError("Phone number must be a valid Airtel Rwanda number. Use 072..., 073..., or +25072/+25073.");
      setIsProfileSaving(false);
      return;
    }

    try {
      const { response, data } = await fetchJson<{ message?: string; user?: LoggedInUser }>(`${API_BASE_URL}/account/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          email: profileForm.email,
          phoneNumber: profileForm.phoneNumber,
          profileImageUrl: profileForm.profileImageUrl || null,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to update profile."));
      }

      if (!data?.user) {
        throw new Error("Profile update completed but the server response was incomplete.");
      }

      onUserUpdate(data.user);
      setProfileMessage(getApiMessage(data, "Profile updated successfully."));
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setIsProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPasswordSaving(true);
    setPasswordMessage("");
    setPasswordError("");

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      setIsPasswordSaving(false);
      return;
    }

    try {
      const { response, data } = await fetchJson<{ message?: string; user?: LoggedInUser }>(`${API_BASE_URL}/account/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (!response.ok) {
        throw new Error(getApiMessage(data, "Failed to update password."));
      }

      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      if (data?.user) {
        onUserUpdate(data.user);
      }
      setPasswordMessage(getApiMessage(data, "Password updated successfully."));
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Failed to update password.");
    } finally {
      setIsPasswordSaving(false);
    }
  };

  return (
    <section className="dashboard-panel" id="settings">
      <div className="panel-header">
        <h3>Account Settings</h3>
        <span>Update your profile and sign-in credentials</span>
      </div>

      <div className="settings-grid">
        <article className="settings-card">
          <div className="subpanel-header">
            <h4>Profile Details</h4>
          </div>
          <form className="simple-form" onSubmit={handleProfileSubmit}>
            <div className="profile-picture-editor">
              <img
                className="profile-picture-preview"
                src={profileForm.profileImageUrl || user.profileImageUrl || "/favicon.svg"}
                alt={`${user.firstName} ${user.lastName} profile preview`}
              />
              <div className="profile-picture-controls">
                <label className="secondary-btn compact-btn profile-upload-button">
                  <span>Upload picture</span>
                  <input type="file" accept="image/*" onChange={(event) => void handleProfileImageChange(event)} />
                </label>
                {profileForm.profileImageUrl ? (
                  <button
                    className="secondary-btn compact-btn"
                    type="button"
                    onClick={() => setProfileForm((current) => ({ ...current, profileImageUrl: "" }))}
                  >
                    Remove picture
                  </button>
                ) : null}
                <p className="profile-picture-hint">Images are optimized automatically before upload.</p>
              </div>
            </div>
            <label className="field">
              <span>First name</span>
              <input
                value={profileForm.firstName}
                onChange={(event) => setProfileForm({ ...profileForm, firstName: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Last name</span>
              <input
                value={profileForm.lastName}
                onChange={(event) => setProfileForm({ ...profileForm, lastName: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Email</span>
              <input
                type="email"
                value={profileForm.email}
                onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>Airtel Rwanda phone</span>
              <input
                type="tel"
                value={profileForm.phoneNumber}
                onChange={(event) => setProfileForm({ ...profileForm, phoneNumber: event.target.value })}
                placeholder="0721234567 or +250721234567"
              />
            </label>
            {profileMessage ? <p className="form-message success-text">{profileMessage}</p> : null}
            {profileError ? <p className="form-message error-text">{profileError}</p> : null}
            <button className="primary-btn form-submit-btn" type="submit" disabled={isProfileSaving}>
              {isProfileSaving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </article>

        <article className="settings-card">
          <div className="subpanel-header">
            <h4>Security</h4>
          </div>
          <form className="simple-form" onSubmit={handlePasswordSubmit}>
            <label className="field">
              <span>Current password</span>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, currentPassword: event.target.value })}
                required
              />
            </label>
            <label className="field">
              <span>New password</span>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, newPassword: event.target.value })}
                minLength={6}
                required
              />
            </label>
            <label className="field">
              <span>Confirm password</span>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(event) => setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })}
                minLength={6}
                required
              />
            </label>
            {passwordMessage ? <p className="form-message success-text">{passwordMessage}</p> : null}
            {passwordError ? <p className="form-message error-text">{passwordError}</p> : null}
            <button className="primary-btn form-submit-btn" type="submit" disabled={isPasswordSaving}>
              {isPasswordSaving ? "Updating..." : "Change password"}
            </button>
          </form>
        </article>

        <article className="settings-card settings-summary-card">
          <div className="subpanel-header">
            <h4>Account Summary</h4>
          </div>
          <div className="mini-list">
            <div className="mini-list-card">
              <strong>Role</strong>
              <span>{user.role}</span>
            </div>
            <div className="mini-list-card">
              <strong>Phone</strong>
              <span>{user.phoneNumber || "Not assigned"}</span>
            </div>
            <div className="mini-list-card">
              <strong>Branch</strong>
              <span>{user.branchName || "Not assigned"}</span>
            </div>
            <div className="mini-list-card">
              <strong>Department ID</strong>
              <span>{user.departmentId || "Not assigned"}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export default AccountSettingsPanel;
