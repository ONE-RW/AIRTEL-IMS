type InstallAppPromptProps = {
  canInstall: boolean;
  isInstalled: boolean;
  isInstalling: boolean;
  onInstall: () => void;
  title?: string;
  description?: string;
};

function InstallAppPrompt({
  canInstall,
  isInstalled,
  isInstalling,
  onInstall,
  title = "Install Airtel IMS",
  description = "Install this app on Windows or add it to your phone home screen for quicker access.",
}: InstallAppPromptProps) {
  if (isInstalled) {
    return (
      <div className="install-app-prompt is-installed">
        <div className="install-app-copy">
          <strong>App installed</strong>
          <span>Airtel IMS is ready to open like a native app.</span>
        </div>
      </div>
    );
  }

  if (!canInstall) {
    return null;
  }

  return (
    <div className="install-app-prompt">
      <div className="install-app-copy">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button className="primary-btn compact-btn install-app-button" type="button" onClick={onInstall} disabled={isInstalling}>
        {isInstalling ? "Installing..." : "Install app"}
      </button>
    </div>
  );
}

export default InstallAppPrompt;
