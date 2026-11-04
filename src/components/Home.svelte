<script lang="ts">
  import { t } from '../lib/i18n';
  import { pickWithHandle, supportsFileSystemAccess } from '../lib/photo';

  let { onpick }: { onpick: (file: File, handle?: FileSystemFileHandle) => void } = $props();
  let input: HTMLInputElement;
  let dragging = $state(false);

  async function choose() {
    if (supportsFileSystemAccess) {
      try {
        const res = await pickWithHandle();
        if (res) onpick(res.file, res.handle);
        return;
      } catch {
        /* fall back to the plain file input */
      }
    }
    input.click();
  }

  function onchange() {
    const f = input.files?.[0];
    if (f) onpick(f);
    input.value = '';
  }

  async function ondrop(e: DragEvent) {
    e.preventDefault();
    dragging = false;
    const item = e.dataTransfer?.items?.[0] as any;
    // Chromium: get a handle so the dropped file can be saved in place too.
    const handle = item?.getAsFileSystemHandle ? await item.getAsFileSystemHandle().catch(() => null) : null;
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) onpick(f, handle?.kind === 'file' ? handle : undefined);
  }
</script>

<main
  class="home"
  class:dragging
  ondragover={(e) => {
    e.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  {ondrop}
>
  <div class="hero">
    <svg class="logo" viewBox="0 0 120 120" aria-hidden="true">
      <path d="M10 60 Q60 10 110 60 Q60 110 10 60Z" fill="#fff" stroke="#222" stroke-width="5" />
      <circle cx="60" cy="60" r="24" fill="#6b4a2f" />
      <circle cx="60" cy="60" r="12" fill="#111" />
      <circle cx="54" cy="54" r="5" fill="#fff" />
    </svg>
    <h1>{t.appName}</h1>
    <p class="tagline">{t.tagline}</p>
  </div>

  <button class="choose" onclick={choose}>
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="9" cy="10" r="2" fill="currentColor"/><path d="M4 17l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    {t.choosePhoto}
  </button>
  <input bind:this={input} type="file" accept="image/*" hidden {onchange} />

  <p class="privacy">
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor"/></svg>
    {t.privacy}
  </p>
</main>

<style>
  .home {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 28px;
    padding: 24px;
    text-align: center;
    background: var(--bg-home);
  }
  .home.dragging {
    outline: 4px dashed var(--accent);
    outline-offset: -16px;
  }
  .hero h1 {
    margin: 12px 0 6px;
    font-size: 30px;
  }
  .logo {
    width: 96px;
    height: 96px;
  }
  .tagline {
    margin: 0;
    font-size: 18px;
    color: var(--muted);
  }
  .choose {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 34px;
    border-radius: 18px;
    background: var(--accent);
    color: #fff;
    font-size: 21px;
    font-weight: 600;
    box-shadow: 0 6px 20px rgba(220, 40, 60, 0.35);
  }
  .choose:active {
    transform: scale(0.98);
  }
  .privacy {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 14px;
    margin: 0;
  }
</style>
