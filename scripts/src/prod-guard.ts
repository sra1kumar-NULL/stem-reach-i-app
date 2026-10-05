export const OVERRIDE_FLAG = "--i-know-this-creates-demo-accounts";

/** True unless every given URL points at a local/throwaway host; unparseable values count as production (fail safe). */
export function looksLikeProduction(...urls: Array<string | undefined>): boolean {
  return urls.some((raw) => {
    if (!raw) return false;
    let host: string;
    try {
      host = new URL(raw).hostname.toLowerCase();
    } catch {
      return true;
    }
    const local =
      host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]" || host.endsWith(".local") || host.endsWith(".test");
    return !local;
  });
}
