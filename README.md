# Swatch

Newt's own color palette app (a free rebuild of Coolors, minus the community library).

- **Create**: generate palettes (tap Generate or press space), lock, drag to reorder, 2–10 colors, harmony modes, shades and HSL editing, undo/redo, paste hex codes.
- **Photo**: pull a palette from a photo and repick colors by tapping the image.
- **Library**: saved palettes in collections, with built-in UNC brand palettes.
- **Export**: hex, CSS variables, Tailwind, SCSS, RGB, HSL, JSON, PNG image, share link.
- **Contrast**: WCAG ratio with AA/AAA checks and a full pair grid.

Plain static site in `public/`, no build step. Palettes live in the browser's storage; move them between devices with a backup file.

Deploy: Vercel, output directory `public` (see `vercel.json`). The service worker cache name in `public/sw.js` should be bumped when files change.
