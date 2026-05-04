import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, LogOut, UserRound } from "lucide-react";
import type { LoggedInUser } from "../types";
import UserAvatar from "./UserAvatar";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type UserMenuProps = {
  user: LoggedInUser;
  onOpenProfile?: () => void;
  onLogout: () => void;
};

function UserMenu({ user, onOpenProfile, onLogout }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(
    window.matchMedia("(display-mode: standalone)").matches || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
  );
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

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

  const handleInstallApp = async () => {
    if (isInstalled) {
      return;
    }

    if (!installPromptEvent) {
      const isAppleMobile = /iPad|iPhone|iPod/.test(window.navigator.userAgent);
      const message = isAppleMobile
        ? "To install this app on iPhone or iPad, open the browser Share menu and choose Add to Home Screen."
        : "If the browser does not show the install prompt yet, open the browser menu and choose Install app or Add to Home Screen.";
      window.alert(message);
      setIsOpen(false);
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
      setIsOpen(false);
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="user-menu" ref={menuRef}>
      <button
        className="user-avatar user-menu-trigger"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-label={`${user.firstName} ${user.lastName} menu`}
        aria-expanded={isOpen}
        aria-haspopup="menu"
      >
        <UserAvatar user={user} />
        <span className="user-menu-chevron" aria-hidden="true">
          <ChevronDown size={14} strokeWidth={2.4} />
        </span>
        <span className="user-menu-email-tooltip" aria-hidden="true">
          {user.email}
        </span>
      </button>

      {isOpen ? (
        <div className="user-menu-dropdown" role="menu">
          <button
            className={`user-menu-item ${isInstalled ? "is-disabled" : ""}`}
            type="button"
            role="menuitem"
            onClick={() => void handleInstallApp()}
            disabled={isInstalling || isInstalled}
          >
            <Download size={16} strokeWidth={2.2} />
            <span>{isInstalled ? "App installed" : isInstalling ? "Installing..." : "Install app"}</span>
          </button>
          {onOpenProfile ? (
            <button
              className="user-menu-item"
              type="button"
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onOpenProfile();
              }}
            >
              <UserRound size={16} strokeWidth={2.2} />
              <span>Profile</span>
            </button>
          ) : null}
          <button
            className="user-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} strokeWidth={2.2} />
            <span>Logout</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default UserMenu;
