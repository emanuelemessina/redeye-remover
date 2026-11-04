# Red-eye Remover

Fix red eyes in your photos — free, private (your photos never leave your device), works offline.
Runs in any modern browser and installs as an app on phones and computers.

**Open the app:** https://emanuelemessina.github.io/redeye-remover/

## How to use

1. Choose a photo
2. Red eyes are found and fixed automatically — even small faces in low-resolution photos
3. Tap any eye to adjust it (size, pupil, darkness, reflection, eye color…), or tap a red eye that was missed
4. Hold the **Original / Result** button to compare
5. Save — as a copy by default

## Install it as an app

- **iPhone / iPad (Safari):** open the link → Share button → *Add to Home Screen*
- **Android (Chrome):** open the link → menu ⋮ → *Install app* / *Add to Home screen*
- **Windows / Mac (Chrome, Edge, Brave):** open the link → install icon in the address bar

Once installed it works without an internet connection.

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

Pushing to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`.

Face detection uses [MediaPipe](https://ai.google.dev/edge/mediapipe) (Apache-2.0), bundled locally.
