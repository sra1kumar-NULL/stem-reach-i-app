/**
 * Web: Nunito / Fredoka / Noto Sans Kannada are self-hosted (`public/fonts/fonts.css`,
 * linked from `<Head>` in `app/_layout.tsx`) and use `font-display: swap`, so there is
 * nothing to await and no font JS is bundled.
 */
export function useAppFonts(): boolean {
  return true;
}
