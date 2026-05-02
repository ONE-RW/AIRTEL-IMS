function resolveApiBaseUrl() {
  const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;

  if (configuredApiBaseUrl) {
    return configuredApiBaseUrl;
  }

  if (typeof window !== "undefined") {
    const { hostname, port, protocol } = window.location;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";

    if (isLocalHost && port !== "4000") {
      return `${protocol}//${hostname}:4000/api`;
    }
  }

  return "/api";
}

export const API_BASE_URL = resolveApiBaseUrl().replace(/\/$/, "");
export const SESSION_KEY = "airtel-ims-user";
