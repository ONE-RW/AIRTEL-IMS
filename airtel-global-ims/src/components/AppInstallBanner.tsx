import { useEffect, useMemo, useState } from "react";
import InstallAppPrompt from "./InstallAppPrompt";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function AppInstallBanner() {
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
  );

  const isAppleMobile = useMemo(
    () => /iPad|iPhone|iPod/.test(window.navigator.userAgent),
    [],
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPromptEvent(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (isInstalled) {
      return;
    }

    if (!installPromptEvent) {
      const message = isAppleMobile
        ? "To install on iPhone or iPad, tap Share in Safari and choose Add to Home Screen."
        : "Open the browser menu and choose Install app or Add to Home Screen.";
      window.alert(message);
      return;
    }

    setIsInstalling(true);

    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      if (choice.outcome === "accepted") {
        setIsInstalled(true);
      }
      setInstallPromptEvent(null);
    } finally {
      setIsInstalling(false);
    }
  };

  const canInstall = Boolean(installPromptEvent) || isAppleMobile;
  const description = isAppleMobile
    ? "Add Airtel IMS to your phone home screen for quick mobile access."
    : "Install Airtel IMS on Windows or desktop for a native app-style experience.";

  return (
    <InstallAppPrompt
      canInstall={canInstall}
      isInstalled={isInstalled}
      isInstalling={isInstalling}
      onInstall={() => void handleInstall()}
      description={description}
    />
  );
}

export default AppInstallBanner;
