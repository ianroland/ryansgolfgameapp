// Assembles the website in dist-site/:
//   /            landing page + dev notes (from site/ and devnotes.json)
//   /play/       the game (built by Vite before this script runs)
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist-site');
if (!existsSync(join(out, 'play', 'index.html'))) {
  console.error('Game build missing: run `vite build --outDir dist-site/play` first (npm run build:site does both).');
  process.exit(1);
}

cpSync(join(root, 'site'), out, { recursive: true });
copyFileSync(join(root, 'devnotes.json'), join(out, 'devnotes.json'));
copyFileSync(join(root, 'src/assets/title_screen.webp'), join(out, 'assets/title_screen.webp'));
copyFileSync(join(root, 'src/assets/logo_ryans_road.webp'), join(out, 'assets/logo.webp'));
mkdirSync(join(out, 'fonts'), { recursive: true });
copyFileSync(join(root, 'node_modules/@fontsource/jersey-15/files/jersey-15-latin-400-normal.woff2'), join(out, 'fonts/jersey-15.woff2'));
copyFileSync(join(root, 'node_modules/@fontsource/tiny5/files/tiny5-latin-400-normal.woff2'), join(out, 'fonts/tiny5.woff2'));

const notes = JSON.parse(readFileSync(join(root, 'devnotes.json'), 'utf8')).notes;
writeFileSync(
  join(out, 'manifest.webmanifest'),
  JSON.stringify(
    {
      name: "Ryan's Road to the LPGA",
      short_name: "Ryan's Road",
      start_url: '/play/',
      display: 'fullscreen',
      orientation: 'landscape',
      background_color: '#0b2e18',
      theme_color: '#0f4524',
      icons: [
        { src: '/assets/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/assets/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    },
    null,
    2,
  ),
);
console.log(`Site built in dist-site/ (latest dev note: v${notes[0]?.version}).`);
