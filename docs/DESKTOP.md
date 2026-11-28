# Desktop build (Electron)

The game ships as a desktop app by wrapping the built web game in Electron (`desktop/main.cjs`).

- **Play it locally:** `npm run desktop` (builds the game, then opens the app window).
- **Make installers:** `npm run desktop:dist`. Output goes to `release/`.
  - Windows (from any OS): installer (NSIS) and a portable `.exe`.
  - macOS: a `.dmg` (build it on a Mac).
  - Linux: an AppImage.
- **Saves** live in IndexedDB inside the app's data folder
  (Windows `%APPDATA%/ryans-road-to-the-lpga`, macOS `~/Library/Application Support/ryans-road-to-the-lpga`,
  Linux `~/.config/ryans-road-to-the-lpga`). The in-game Save / Load Career buttons still export and import save files.
- **Keys:** F11 or Alt+Enter toggles fullscreen. The window size and fullscreen state are remembered.
- The app never needs the network. It serves the game from a private `app://` origin, refuses to
  navigate anywhere else, and opens outside https links in the system browser.
- **Icon:** `build/icon.png` (from the title logo). Replace it with a dedicated square icon before release.
- `--dev` opens with DevTools. `--screenshot=<file>` (with optional `--press-enter`) is a smoke test:
  load, screenshot, quit.

Not done yet (next steps for Steam): Steamworks SDK (achievements, Steam Cloud saves as files),
code signing (Windows certificate, Apple notarization), and Steam Deck controls.
