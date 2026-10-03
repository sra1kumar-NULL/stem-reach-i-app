/** Pure helpers for the profile screen (kept free of React so node tests can import them). */

export type QuestionLanguage = 'en' | 'kn' | 'both';

export const NAME_MAX = 80;

/** Up to two initials from a display name ("Asha Rao" → "AR", "kiran" → "K"); "?" when empty. */
export function initials(name: string | null | undefined): string {
  // Words that contain at least one letter, so "Student 1 (Ananya)" -> "SA", not "S(" or "S1".
  const letterOf = (w: string) => w.match(/\p{L}/u)?.[0] ?? '';
  const words = (name ?? '').trim().split(/\s+/).filter((w) => letterOf(w) !== '');
  if (words.length === 0) return '?';
  const first = letterOf(words[0]!);
  const last = words.length > 1 ? letterOf(words[words.length - 1]!) : '';
  return (first + last).toLocaleUpperCase();
}

/** Returns the trimmed name to save, or an error message. Mirrors UpdateMeRequest (trim, 1..80). */
export function validateFullName(raw: string): { ok: true; value: string } | { ok: false; message: string } {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, message: 'Please enter your name.' };
  if (value.length > NAME_MAX) return { ok: false, message: `Name must be ${NAME_MAX} characters or fewer.` };
  return { ok: true, value };
}

export const LANGUAGE_OPTIONS: readonly { value: QuestionLanguage; label: string; hint: string }[] = [
  { value: 'en', label: 'English', hint: 'Questions in English' },
  { value: 'kn', label: 'ಕನ್ನಡ', hint: 'Kannada questions' },
  { value: 'both', label: 'Both', hint: 'English and ಕನ್ನಡ' },
];

/** Accuracy 0..1 → "78%". */
export function percent(value: number | null | undefined): string {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return `${Math.round(Math.min(1, Math.max(0, v)) * 100)}%`;
}
