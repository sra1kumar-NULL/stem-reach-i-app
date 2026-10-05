/**
 * Startup configuration. `EXPO_PUBLIC_*` values are inlined by Metro only when read
 * as literal `process.env.EXPO_PUBLIC_X`, so they are read here, once, by name.
 * The validation itself is pure so it can be unit-tested.
 */

export interface RawConfig {
  apiUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export interface ConfigProblem {
  /** Name of the environment variable. */
  name: string;
  message: string;
}

export const rawConfig: RawConfig = {
  apiUrl: process.env.EXPO_PUBLIC_API_URL,
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
};

const isLocalHost = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]';

function parseUrl(value: string): URL | null {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

/**
 * In development every value may be missing (callers keep their localhost / Expo-host
 * fallbacks) so this returns []. In a production build missing or unusable values are
 * reported so the app can stop with a clear message instead of talking to localhost.
 */
export function validateConfig(raw: RawConfig, isDev: boolean): ConfigProblem[] {
  if (isDev) return [];
  const problems: ConfigProblem[] = [];

  const api = raw.apiUrl?.trim();
  if (!api) problems.push({ name: 'EXPO_PUBLIC_API_URL', message: 'is not set' });
  else {
    const u = parseUrl(api);
    if (!u) problems.push({ name: 'EXPO_PUBLIC_API_URL', message: 'is not a valid http(s) URL' });
    else if (isLocalHost(u.hostname)) problems.push({ name: 'EXPO_PUBLIC_API_URL', message: 'points at this device (localhost)' });
  }

  const sb = raw.supabaseUrl?.trim();
  if (!sb) problems.push({ name: 'EXPO_PUBLIC_SUPABASE_URL', message: 'is not set' });
  else if (!parseUrl(sb)) problems.push({ name: 'EXPO_PUBLIC_SUPABASE_URL', message: 'is not a valid http(s) URL' });

  if (!raw.supabaseAnonKey?.trim()) problems.push({ name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', message: 'is not set' });

  return problems;
}

/** One line per problem, for the full-screen message. */
export function describeProblems(problems: ConfigProblem[]): string[] {
  return problems.map((p) => `${p.name} ${p.message}`);
}

declare const __DEV__: boolean | undefined;
const isDevBuild = typeof __DEV__ !== 'undefined' ? !!__DEV__ : false;

export const configProblems: ConfigProblem[] = validateConfig(rawConfig, isDevBuild);
