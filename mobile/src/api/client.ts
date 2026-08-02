import Constants from 'expo-constants';

/**
 * Resolves the API base URL:
 * 1. EXPO_PUBLIC_API_URL env override (e.g. a deployed API)
 * 2. The Expo dev server host (LAN IP / emulator host) with port 3000
 * 3. localhost fallback (web)
 */
export function getApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri?.split(':')[0];
  if (host) return `http://${host}:3000`;

  return 'http://localhost:3000';
}

export async function checkApiHealth(baseUrl = getApiBaseUrl()): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/healthz`);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}
