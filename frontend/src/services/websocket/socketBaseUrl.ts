const DEFAULT_API_BASE_URL = "http://localhost:3000";

function getBrowserOrigin() {
  return typeof window === "undefined"
    ? DEFAULT_API_BASE_URL
    : window.location.origin;
}

export function normalizeSocketBaseUrl(value: unknown, fallback = DEFAULT_API_BASE_URL) {
  const rawValue = typeof value === "string" ? value.trim() : "";

  if (rawValue.startsWith("/")) {
    return getBrowserOrigin();
  }

  return (
    (rawValue || fallback)
      .replace(/\/+$/, "")
      .replace(/\/api$/i, "") || fallback
  );
}
