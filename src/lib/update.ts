// Offline support + safe updates.
//
// The service worker (skipWaiting + clientsClaim) installs new versions in the
// background. The page must then reload to run the new code, but it must NEVER
// reload while someone is working on a photo (that used to discard the photo
// picked right after opening the app). So: reload only when no photo is open,
// otherwise as soon as the user goes back to the home screen.

let updateReady = false;
let busy = () => false;

export function startUpdates(isBusy: () => boolean) {
  // While a file dialog is open the page has no focus: a reload then would lose
  // the file being picked. Re-check a moment after focus returns (by then the
  // picked photo, if any, is already loading and counts as busy).
  busy = () => isBusy() || !document.hasFocus();
  window.addEventListener('focus', () => setTimeout(applyUpdateIfIdle, 2000));
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // First install: the page that installed it is already the current version.
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    updateReady = true;
    applyUpdateIfIdle();
  });

  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
    .then((reg) => {
      // Look for a new version whenever the app comes back to the foreground.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    })
    .catch((e) => console.warn('service worker registration failed', e));
}

/** Call when the user is back on the home screen (no photo open). */
export function applyUpdateIfIdle() {
  if (updateReady && !busy()) location.reload();
}
