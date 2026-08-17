# Dashboard illustration

The file rendered in the bottom-right corner of the dashboard is:

    a_clean_high_resolution_studio_lit_portrait_shot_1.png   (PNG, 1254x1254, OPAQUE)

referenced by a single `src` in `src/pages/admin/Dashboard.jsx`.

> This file has no alpha channel — its `rgb(197,197,198)` studio background is baked in,
> so it renders as a hard-edged grey square against the `#f8fafc` page. Removing the
> background (export as a transparent PNG) is what makes it sit on the page the way the
> reference illustration did.

## Swapping the artwork

Replacing the file is not enough on its own — three value


?":








s in `Dashboard.jsx` are tuned
to the current image and must be re-measured if the new one is shaped differently:

1. the `src` filename;
2. the wrapper's bottom padding — currently plain `clamp(180px,22vw,360px)`, matching the
   width because the artwork is square (1:1). For a non-square image divide by its aspect
   ratio. This reserves the illustration's height so it never overlaps the panels;
3. a `translate-y-[n%]` on the `<img>`, equal to the share of empty canvas below the
   artwork's lowest pixel. The current photo is cropped flush at the bottom, so there is
   none and the class is absent. Without it, padding inside the file reads as a gap
   beneath the illustration.

To measure 2 and 3, load the image in a canvas and find its opaque bounds.

## Notes

- Anything Vite can serve works (`.png`, `.svg`, `.webp`).
- **Use a transparent background.** The illustration sits directly on the page with
  nothing behind it, so a JPEG — which cannot store transparency — renders as a visible
  rectangle over the page background.
- It is displayed at `clamp(200px, 26vw, 440px)` wide with `height: auto`; roughly 900px
  wide is plenty for high-DPI screens. Larger is wasted download on every dashboard load
  (the current file is 1.3 MB for something drawn at 440px).
- If the file is missing the slot hides itself (the `<img>` `onError` handler), so a
  broken-image icon never appears.
