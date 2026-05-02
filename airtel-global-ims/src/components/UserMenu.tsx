import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";
import type { LoggedInUser } from "../types";
import UserAvatar from "./UserAvatar";

type UserMenuProps = {
  user: LoggedInUser;
  onOpenProfile: () => void;
  onLogout: () => void;
};

function UserMenu({ user, onOpenProfile, onLogout }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
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
      </button>

      {isOpen ? (
        <div className="user-menu-dropdown" role="menu">
          <button
            className="user-menu-item"
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onOpenProfile();
            }}
          >
            <User size={16} strokeWidth={2.2} />
            <span>Profile</span>
          </button>
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
