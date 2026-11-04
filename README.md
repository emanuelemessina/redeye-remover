# Red-eye Remover

Fix red eyes in your photos — free, private (nothing leaves your device), works offline.
Runs in any modern browser and installs as an app on phones and computers.

1. Choose a photo
2. Red eyes are found and fixed automatically (even small faces in low-resolution photos)
3. Tap any eye to adjust it, or tap a red eye that was missed
4. Save — as a copy by default

## Development

```bash
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

Face detection uses [MediaPipe](https://ai.google.dev/edge/mediapipe) (Apache-2.0), bundled locally.
