<script lang="ts">
  import Editor from './components/Editor.svelte';
  import Home from './components/Home.svelte';
  import { t } from './lib/i18n';
  import { loadPhoto, PhotoLoadError, type Photo } from './lib/photo';

  let photo: Photo | null = $state.raw(null);
  let loading = $state(false);
  let error: string | null = $state(null);

  async function onpick(file: File, handle?: FileSystemFileHandle) {
    loading = true;
    try {
      photo = await loadPhoto(file, handle);
    } catch (e) {
      console.error(e);
      const reason = e instanceof PhotoLoadError ? e.reason : 'unknown';
      error = reason === 'unsupported' ? t.errUnsupported : reason === 'too-large' ? t.errTooLarge : t.errUnknown;
    } finally {
      loading = false;
    }
  }

  // Dev only: ?demo=s14 opens fixtures/private/s14.jpg without the file picker.
  if (import.meta.env.DEV) {
    const demo = new URLSearchParams(location.search).get('demo');
    if (demo) {
      fetch(`/fixtures/private/${demo}.jpg`)
        .then((r) => r.blob())
        .then((b) => onpick(new File([b], `${demo}.jpg`, { type: 'image/jpeg' })));
    }
  }

  function close() {
    photo?.bitmap.close();
    photo = null;
  }
</script>

{#if photo}
  {#key photo}
    <Editor {photo} onclose={close} />
  {/key}
{:else}
  <Home {onpick} />
{/if}

{#if loading}
  <div class="modal"><div class="card"><div class="spinner"></div><p>{t.loading}</p></div></div>
{/if}

{#if error}
  <div class="modal" role="alertdialog" aria-modal="true">
    <div class="card">
      <p>{error}</p>
      <button class="ok" onclick={() => (error = null)}>{t.ok}</button>
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 24px;
    background: rgba(0, 0, 0, 0.45);
  }
  .card {
    background: var(--card);
    color: var(--fg);
    border-radius: 18px;
    padding: 22px 26px;
    max-width: 360px;
    text-align: center;
  }
  .card p {
    font-size: 17px;
    margin: 12px 0;
  }
  .ok {
    width: 100%;
    padding: 12px;
    border-radius: 12px;
    background: var(--accent);
    color: #fff;
    font-size: 17px;
    font-weight: 600;
  }
  .spinner {
    width: 34px;
    height: 34px;
    margin: 0 auto;
    border-radius: 50%;
    border: 3px solid var(--track);
    border-top-color: var(--accent);
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
