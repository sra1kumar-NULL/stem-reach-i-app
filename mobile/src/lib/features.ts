/**
 * Build-time feature switches (EXPO_PUBLIC_* values are inlined into the bundle).
 *
 * EMAIL_RESET: show the "email me a reset link" form on the Forgot password screen.
 * Off by default because it only works once custom SMTP is configured in Supabase.
 * The default recovery path is the teacher setting a temporary password.
 */
export const EMAIL_RESET_ENABLED = process.env.EXPO_PUBLIC_EMAIL_RESET === '1';
