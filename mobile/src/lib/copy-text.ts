import { Platform, Share } from 'react-native';

/**
 * Copies `text` to the clipboard on web (async Clipboard API, `execCommand`
 * fallback for insecure origins). Native has no clipboard module installed, so it
 * opens the system share sheet instead. Resolves true when the text left the app.
 */
export async function copyText(text: string): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
    } catch {
      // fall through to the legacy path
    }
    try {
      const el = document.createElement('textarea');
      el.value = text;
      el.setAttribute('readonly', '');
      el.style.position = 'fixed';
      el.style.opacity = '0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(el);
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }
  try {
    const res = await Share.share({ message: text });
    return res.action === Share.dismissedAction ? 'failed' : 'shared';
  } catch {
    return 'failed';
  }
}
