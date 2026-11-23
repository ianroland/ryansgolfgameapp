# Claude Code: Responsive rotating backgrounds for Ryan’s Road to the LPGA

Integrate the eight provided WebP files into the existing single-page game without changing gameplay, navigation, save data, or the logo. These are four full-page backgrounds and four separate wide header crops. Use the existing logo asset over the header; do not replace it with AI lettering.

1. Inspect existing CSS/HTML and determine the actual scroll container and header. Remove the current stretched/repeated background image declarations only.
2. Add two absolutely/fixed-positioned background layers behind the app shell (pointer-events:none, aria-hidden=true), with background-size:cover, background-position:center center, background-repeat:no-repeat, inset:0, and a dark green translucent overlay to maintain panel contrast. For long scrolling content, choose a fixed viewport background, not an image stretched to document height. Avoid z-index/stacking bugs.
3. Use two header layers behind the header contents, with background-size:cover and background-position:center center. Keep the logo, bank, buttons and hitboxes untouched. Add a dark tint/gradient where needed for legibility.
4. Rotate scene index across city_sunset, desert_palms, coastal_classic, casino_night every 90 seconds. Crossfade opacity for 1000ms with two layers; preload the next images before transition. Synchronize header and page scene. Respect prefers-reduced-motion by disabling crossfades (and optionally rotation). Pause transitions when document.hidden and resume on visibility change. Clean up timers/listeners.
5. Do not persist rotation in career save state. Avoid interval duplication on rerender/navigation. Ensure mobile and 1920x1080 desktop layouts work without distortion, tiling, blank bands, or stretched artwork.
6. Test at 1366x768, 1536x864, 1920x1080 and mobile widths. Provide before/after screenshots and a brief change report.

NOTE: The source images were generated as four compositions in one grid, then cropped and resized. They are polished concept-quality backgrounds, not independently generated 1920x1080 source paintings. Keep aspect ratio via CSS cover; do not stretch them.
