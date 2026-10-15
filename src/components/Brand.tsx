/**
 * The Python Arena mark: a rounded tile in Python blue with the interactive interpreter's prompt,
 * >>>, in Python yellow. It is our own drawing (not the Python Software Foundation's two-snake logo,
 * which is a trademark). The same drawing is public/favicon.svg, the MARK in scripts/prerender.mjs,
 * the icons from scripts/make-icons.mjs, the share card's logo in src/lib/card.ts and Python Arena's
 * mark in src/components/Arenas.tsx.
 */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#3776AB" />
      <path d="M6.5 10.5 11.5 16l-5 5.5M12.5 10.5l5 5.5-5 5.5M18.5 10.5l5 5.5-5 5.5" fill="none" stroke="#FFD43B" strokeWidth="2.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
