const LOCAL_DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5175',
];

function normalizeOrigin(value: string): string {
  try {
    return new URL(value.trim()).origin;
  } catch {
    throw new Error(`Origem CORS invalida: ${value}`);
  }
}

export function buildAllowedCorsOrigins(params: {
  nodeEnv?: string;
  frontendUrl?: string;
  configuredOrigins?: string;
}): Set<string> {
  const production = params.nodeEnv?.trim().toLowerCase() === 'production';
  const rawOrigins = [
    ...(production ? [] : LOCAL_DEVELOPMENT_ORIGINS),
    params.frontendUrl,
    ...(params.configuredOrigins?.split(',') ?? []),
  ].filter((origin): origin is string => Boolean(origin?.trim()));

  return new Set(rawOrigins.map(normalizeOrigin));
}

export function isCorsOriginAllowed(params: {
  origin?: string;
  allowedOrigins: ReadonlySet<string>;
  allowDevelopmentTunnels: boolean;
}): boolean {
  if (!params.origin) return true;

  let normalizedOrigin: string;
  let hostname: string;

  try {
    const url = new URL(params.origin);
    normalizedOrigin = url.origin;
    hostname = url.hostname;
  } catch {
    return false;
  }

  return (
    params.allowedOrigins.has(normalizedOrigin) ||
    (params.allowDevelopmentTunnels &&
      (hostname === 'trycloudflare.com' ||
        hostname.endsWith('.trycloudflare.com')))
  );
}
