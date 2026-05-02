import type { LoggedInUser } from "../types";

type UserAvatarProps = {
  user: LoggedInUser;
  size?: number;
};

function getInitials(user: LoggedInUser) {
  return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase() || "A";
}

function getAvatarPalette(user: LoggedInUser) {
  const palettes = [
    { start: "#9f1419", end: "#ef595d" },
    { start: "#7d1015", end: "#d91f26" },
    { start: "#8f1418", end: "#f07f62" },
    { start: "#b9161c", end: "#ef6c6f" },
    { start: "#6e0d12", end: "#d94652" },
  ];

  const seed = `${user.firstName}${user.lastName}${user.email}`;
  const paletteIndex =
    seed.split("").reduce((total, character) => total + character.charCodeAt(0), 0) % palettes.length;

  return palettes[paletteIndex];
}

function buildAvatarDataUrl(user: LoggedInUser) {
  const initials = getInitials(user);
  const palette = getAvatarPalette(user);
  const safeName = `${user.firstName} ${user.lastName}`.trim();
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" aria-label="${safeName}">
      <defs>
        <linearGradient id="avatarGradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${palette.start}" />
          <stop offset="100%" stop-color="${palette.end}" />
        </linearGradient>
      </defs>
      <rect width="120" height="120" rx="60" fill="url(#avatarGradient)" />
      <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.28)" stroke-width="2" />
      <text
        x="60"
        y="68"
        text-anchor="middle"
        font-family="Trebuchet MS, Segoe UI, sans-serif"
        font-size="38"
        font-weight="700"
        fill="#ffffff"
      >
        ${initials}
      </text>
    </svg>
  `;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function UserAvatar({ user, size = 46 }: UserAvatarProps) {
  const fullName = `${user.firstName} ${user.lastName}`.trim();
  const avatarSource = user.profileImageUrl || buildAvatarDataUrl(user);

  return (
    <span className="user-avatar-image-shell" aria-hidden="true">
      <img
        className="user-avatar-image"
        src={avatarSource}
        alt={`${fullName} profile`}
        width={size}
        height={size}
      />
    </span>
  );
}

export default UserAvatar;
