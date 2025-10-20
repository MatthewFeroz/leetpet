# LeetPet Chrome Extension

LeetPet is a Chrome extension concept that turns your LeetCode progress into fuel for a Tamagotchi-style companion. Solved problems, streaks, and daily challenges feed and level up your pet, encouraging consistent practice.

## Features
- Popup dashboard that visualizes your pet’s level, XP progress, hunger, and streaks.
- Background service worker that polls the LeetCode API (GraphQL + REST) to sync solved counts and daily challenge status.
- Cookie-based authentication check — prompts you to sign into `leetcode.com` before syncing.
- Manual feed button for quick interactions and development testing.
- Options page to rename the pet and reset progress.

## Project Structure
```
extension/
├── manifest.json
├── popup/
│   ├── index.html
│   ├── popup.js
│   └── styles.css
├── options/
│   ├── index.html
│   ├── options.js
│   └── styles.css
└── src/
    ├── api/
    │   └── leetcodeClient.js
    ├── background.js
    ├── storage.js
    └── tamagotchi/
        └── petState.js
```

## Getting Started
1. Open Chrome and navigate to `chrome://extensions`.
2. Enable **Developer Mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `extension/` directory.
4. Pin the “LeetPet Tamagotchi” extension to your toolbar for quick access.
5. Click the extension icon, then press **Log in** to open the LeetCode login page. Once you sign in and reload the popup, the background worker can access the `LEETCODE_SESSION` cookie and sync your stats.

## Development Notes
- The LeetCode GraphQL endpoint requires the active session cookie. The extension checks for this cookie via `chrome.cookies.get`. If the session cannot be read, UI falls back to manual feeding with a prompt to log in.
- `src/api/leetcodeClient.js` contains basic queries for user status, solved counts, streaks, and the daily challenge question. Error handling currently surfaces generic messages; consider adding more granular UI states.
- `src/tamagotchi/petState.js` tracks XP, hunger, and streak metadata. Feeding logic is placeholder-friendly and can be tweaked to reflect more nuanced game mechanics.
- Daily refreshes are scheduled with `chrome.alarms` (every hour by default). Feel free to adjust cadence or add additional triggers (e.g., on browser idle).

## Next Steps
- Add real artwork/animation for the Tamagotchi sprite and hunger states.
- Persist richer history (e.g., last N days of solved problems) to power trend graphs.
- Expand authentication to support `leetcode.cn` explicitly and guide users through cookie consent.
- Introduce achievements, notifications for streak breaks, and optional sound effects.
- Harden API calls with retry/backoff and localized messaging for failures.
