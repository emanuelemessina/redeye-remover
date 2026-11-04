import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, { target: document.getElementById('app')! });
export default app;

// Offline support. With autoUpdate the page reloads itself when a new version is
// installed, so people never keep running a stale cached copy.
if (import.meta.env.PROD) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    const update = registerSW({ immediate: true });
    // Check for updates whenever the app comes back to the foreground.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') update().catch(() => {});
    });
  });
}
