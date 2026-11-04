<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { correctedPatch } from '../core/correct';
  import { detectRedEyes } from '../core/detect';
  import { regionFromTap, type KnownIris } from '../core/manual';
  import { DEFAULT_PARAMS, type CorrectionParams, type EyeRegion } from '../core/types';
  import { t } from '../lib/i18n';
  import { displayScale, type Photo } from '../lib/photo';
  import { canSaveInPlace, renderFile, saveCopy, saveInPlace } from '../lib/save';

  let { photo, onclose }: { photo: Photo; onclose: () => void } = $props();

  // ---- state ----
  let regions: EyeRegion[] = $state([]);
  let selectedId: string | null = $state(null);
  let history: EyeRegion[][] = $state([]);
  let irises: KnownIris[] = [];
  let phase: 'detecting' | 'ready' = $state('detecting');
  let progress = $state(0);
  let comparing = $state(false);
  let toast: string | null = $state(null);
  let saveSheet = $state(false);
  let confirmClose = $state(false);
  let busy: string | null = $state(null);
  let dirty = $state(false);

  const selected = $derived(regions.find((r) => r.id === selectedId) ?? null);
  // The editor is re-created for every photo ({#key}), so reading props once is fine.
  // svelte-ignore state_referenced_locally
  const W = photo.width;
  // svelte-ignore state_referenced_locally
  const H = photo.height;
  const minDim = Math.min(W, H);

  // ---- view (zoom / pan) ----
  let vw = $state(0);
  let vh = $state(0);
  let scale = $state(1);
  let tx = $state(0);
  let ty = $state(0);
  const fitScale = $derived(vw && vh ? Math.min(vw / W, vh / H) * 0.96 : 1);
  const maxScale = $derived(Math.max(6, fitScale * 24));
  const zoomed = $derived(scale > fitScale * 1.05);

  let viewport: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  const ds = displayScale(W, H);
  const base = document.createElement('canvas');
  const tmp = document.createElement('canvas');

  function fit() {
    scale = fitScale;
    tx = (vw - W * scale) / 2;
    ty = (vh - H * scale) / 2;
  }

  function clampView() {
    const cw = W * scale;
    const ch = H * scale;
    tx = cw <= vw ? (vw - cw) / 2 : Math.min(0, Math.max(vw - cw, tx));
    ty = ch <= vh ? (vh - ch) / 2 : Math.min(0, Math.max(vh - ch, ty));
  }

  function zoomAt(sx: number, sy: number, newScale: number) {
    newScale = Math.min(maxScale, Math.max(fitScale, newScale));
    const ix = (sx - tx) / scale;
    const iy = (sy - ty) / scale;
    scale = newScale;
    tx = sx - ix * scale;
    ty = sy - iy * scale;
    clampView();
  }

  let lastFit = 0;
  $effect(() => {
    // Refit when the viewport size changes (rotation, window resize) and we are not zoomed in.
    if (fitScale !== lastFit) {
      const wasFit = !lastFit || scale <= lastFit * 1.05;
      lastFit = fitScale;
      if (wasFit) fit();
      else clampView();
    }
  });

  // ---- rendering ----
  let raf = 0;
  function scheduleRender() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      render();
    });
  }

  function render() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(base, 0, 0);
    if (comparing) return;
    const list = $state.snapshot(regions) as EyeRegion[];
    const tctx = tmp.getContext('2d')!;
    for (const r of list) {
      const { box, patch } = correctedPatch(photo.rgba, r, list);
      if (!box.w || !box.h) continue;
      tmp.width = box.w;
      tmp.height = box.h;
      tctx.putImageData(new ImageData(patch.data as Uint8ClampedArray<ArrayBuffer>, box.w, box.h), 0, 0);
      ctx.drawImage(tmp, box.x0 * ds, box.y0 * ds, box.w * ds, box.h * ds);
    }
  }

  // ---- history ----
  function snapshot() {
    history = [...history.slice(-49), $state.snapshot(regions) as EyeRegion[]];
    dirty = true;
  }
  function undo() {
    const prev = history[history.length - 1];
    if (!prev) return;
    history = history.slice(0, -1);
    regions = prev;
    if (selectedId && !regions.some((r) => r.id === selectedId)) selectedId = null;
    scheduleRender();
  }

  // ---- detection ----
  const abort = new AbortController();
  onMount(async () => {
    base.width = Math.round(W * ds);
    base.height = Math.round(H * ds);
    base.getContext('2d')!.drawImage(photo.bitmap, 0, 0, base.width, base.height);
    canvas.width = base.width;
    canvas.height = base.height;
    render();
    await tick();
    // Let the browser paint the photo before the heavy work starts.
    await new Promise((r) => setTimeout(r, 50));
    try {
      const res = await detectRedEyes(photo.rgba, photo.bitmap, {
        onProgress: (p) => (progress = p),
        signal: abort.signal,
      });
      if (abort.signal.aborted) return;
      irises = res.eyes.map((e) => ({ x: e.x, y: e.y, irisR: e.irisR }));
      if (!regions.length) regions = res.regions;
      showToast(res.regions.length ? t.foundEyes(res.regions.length) : t.noneFound);
      if (res.regions.length) dirty = true;
    } catch (e) {
      console.error('detection failed', e);
      showToast(t.noneFound);
    } finally {
      phase = 'ready';
      scheduleRender();
    }
  });
  onDestroy(() => {
    abort.abort();
    cancelAnimationFrame(raf);
  });

  function skipDetection() {
    abort.abort();
    phase = 'ready';
  }

  let toastTimer = 0;
  function showToast(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast = null), 3200);
  }

  // ---- gestures ----
  type Gesture =
    | { kind: 'pan'; sx: number; sy: number; tx: number; ty: number; moved: boolean; t0: number }
    | { kind: 'move'; id: string; sx: number; sy: number; cx: number; cy: number; moved: boolean; t0: number }
    | { kind: 'resize'; id: string; moved: boolean }
    | { kind: 'pinch'; d0: number; mx: number; my: number; s0: number; tx0: number; ty0: number };
  const pointers = new Map<number, { x: number; y: number }>();
  let gesture: Gesture | null = null;

  function local(e: PointerEvent | WheelEvent) {
    const rect = viewport.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  const toImage = (p: { x: number; y: number }) => ({ x: (p.x - tx) / scale, y: (p.y - ty) / scale });
  // The resize handle sits a fixed number of screen pixels outside the ring
  // (bottom-right), so it never overlaps the circle, even on tiny eyes.
  const HANDLE_GAP = 14;
  const handleOf = (r: EyeRegion) => {
    const d = r.rx + HANDLE_GAP / scale;
    return { x: r.cx + d * Math.SQRT1_2, y: r.cy + d * Math.SQRT1_2 };
  };

  function hitTest(p: { x: number; y: number }): { kind: 'handle' | 'body'; id: string } | null {
    const slop = 10 / scale;
    if (selected) {
      const h = handleOf(selected);
      if (Math.hypot(p.x - h.x, p.y - h.y) < 13 / scale) return { kind: 'handle', id: selected.id };
    }
    let best: EyeRegion | null = null;
    let bestD = Infinity;
    for (const r of regions) {
      const d = Math.hypot(p.x - r.cx, p.y - r.cy);
      if (d < Math.max(r.rx, r.ry) + slop && d < bestD) {
        best = r;
        bestD = d;
      }
    }
    return best ? { kind: 'body', id: best.id } : null;
  }

  function onpointerdown(e: PointerEvent) {
    if (phase !== 'ready') return;
    viewport.setPointerCapture(e.pointerId);
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, s0: scale, tx0: tx, ty0: ty };
      return;
    }
    if (pointers.size > 2) return;
    const hit = hitTest(toImage(p));
    if (hit?.kind === 'handle') {
      gesture = { kind: 'resize', id: hit.id, moved: false };
    } else if (hit) {
      const r = regions.find((x) => x.id === hit.id)!;
      selectedId = hit.id;
      gesture = { kind: 'move', id: hit.id, sx: p.x, sy: p.y, cx: r.cx, cy: r.cy, moved: false, t0: performance.now() };
    } else {
      gesture = { kind: 'pan', sx: p.x, sy: p.y, tx, ty, moved: false, t0: performance.now() };
    }
  }

  function onpointermove(e: PointerEvent) {
    if (!pointers.has(e.pointerId) || !gesture) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    const g = gesture;
    if (g.kind === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const ns = Math.min(maxScale, Math.max(fitScale, (g.s0 * d) / Math.max(1, g.d0)));
      const ix = (g.mx - g.tx0) / g.s0;
      const iy = (g.my - g.ty0) / g.s0;
      scale = ns;
      tx = mx - ix * ns;
      ty = my - iy * ns;
      clampView();
    } else if (g.kind === 'pan') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 8) g.moved = true;
      if (g.moved) {
        tx = g.tx + p.x - g.sx;
        ty = g.ty + p.y - g.sy;
        clampView();
      }
    } else if (g.kind === 'move') {
      if (!g.moved && Math.hypot(p.x - g.sx, p.y - g.sy) > 6) {
        g.moved = true;
        snapshot();
      }
      if (g.moved) {
        const r = regions.find((x) => x.id === g.id);
        if (r) {
          r.cx = Math.min(W, Math.max(0, g.cx + (p.x - g.sx) / scale));
          r.cy = Math.min(H, Math.max(0, g.cy + (p.y - g.sy) / scale));
          scheduleRender();
        }
      }
    } else if (g.kind === 'resize') {
      if (!g.moved) {
        g.moved = true;
        snapshot();
      }
      const r = regions.find((x) => x.id === g.id);
      if (r) {
        const ip = toImage(p);
        // Radius follows the handle (which sits HANDLE_GAP screen px outside the ring).
        const rad = Math.min(minDim * 0.2, Math.max(1, Math.hypot(ip.x - r.cx, ip.y - r.cy) - HANDLE_GAP / scale));
        r.rx = r.ry = rad;
        scheduleRender();
      }
    }
  }

  function onpointerup(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.delete(e.pointerId);
    const g = gesture;
    if (g?.kind === 'pinch') {
      // Continue as a pan with the remaining finger, without triggering a tap.
      const rest = [...pointers.values()][0];
      gesture = rest ? { kind: 'pan', sx: rest.x, sy: rest.y, tx, ty, moved: true, t0: 0 } : null;
      return;
    }
    gesture = null;
    if (!g) return;
    if (g.kind === 'pan' && !g.moved && performance.now() - g.t0 < 600) tap(toImage(p));
  }

  function tap(ip: { x: number; y: number }) {
    if (ip.x < 0 || ip.y < 0 || ip.x > W || ip.y > H) return;
    if (selectedId) {
      selectedId = null;
      return;
    }
    snapshot();
    const r = regionFromTap(photo.rgba, ip.x, ip.y, 24 / scale, irises);
    regions = [...regions, r];
    selectedId = r.id;
    scheduleRender();
  }

  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, scale * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }

  // ---- editing selected region ----
  function setParam(k: keyof CorrectionParams, v: number) {
    if (!selected) return;
    selected.params[k] = v;
    scheduleRender();
  }
  // Size slider is logarithmic: small pupils need fine control.
  const rMin = 1;
  const rMax = Math.max(12, minDim * 0.08);
  const sizeToSlider = (r: number) => Math.log(r / rMin) / Math.log(rMax / rMin);
  const sliderToSize = (v: number) => rMin * Math.pow(rMax / rMin, v);
  function setSize(v: number) {
    if (!selected) return;
    selected.rx = selected.ry = sliderToSize(v);
    scheduleRender();
  }
  function removeSelected() {
    if (!selected) return;
    snapshot();
    regions = regions.filter((r) => r.id !== selectedId);
    selectedId = null;
    scheduleRender();
  }
  function resetSelected() {
    if (!selected) return;
    snapshot();
    selected.params = { ...DEFAULT_PARAMS };
    scheduleRender();
  }

  // ---- compare ----
  function startCompare() {
    comparing = true;
    render();
  }
  function endCompare() {
    if (!comparing) return;
    comparing = false;
    render();
  }

  // ---- save / close ----
  async function doSave(mode: 'copy' | 'replace') {
    saveSheet = false;
    busy = t.save + '…';
    try {
      const blob = await renderFile(photo, $state.snapshot(regions) as EyeRegion[]);
      const res = mode === 'copy' ? await saveCopy(photo, blob) : await saveInPlace(photo, blob);
      if (res === 'saved') {
        dirty = false;
        showToast(t.saved);
      }
    } catch (e) {
      console.error(e);
      showToast(t.saveFailed);
    } finally {
      busy = null;
    }
  }
  function onSave() {
    selectedId = null;
    if (canSaveInPlace(photo)) saveSheet = true;
    else doSave('copy');
  }
  function onClose() {
    if (dirty) confirmClose = true;
    else onclose();
  }

  function onkeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !(e.target instanceof HTMLInputElement)) {
      removeSelected();
    } else if (e.key === 'Escape') {
      selectedId = null;
    }
  }

  const ringW = $derived(1.5 / scale);
</script>

<svelte:window {onkeydown} />

<div class="editor">
  <header class="bar">
    <button class="text" onclick={onClose}>‹ {t.close}</button>
    <span class="count">{phase === 'ready' && regions.length ? t.eyesCount(regions.length) : ''}</span>
    <button class="primary" onclick={onSave} disabled={phase !== 'ready' || !!busy}>{t.save}</button>
  </header>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="viewport"
    bind:this={viewport}
    bind:clientWidth={vw}
    bind:clientHeight={vh}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onwheel}
  >
    <div class="stage" style="width:{W}px;height:{H}px;transform:translate({tx}px,{ty}px) scale({scale})">
      <canvas bind:this={canvas} style="width:{W}px;height:{H}px"></canvas>
      {#if phase === 'ready' && !comparing}
        <svg viewBox="0 0 {W} {H}" width={W} height={H}>
          {#each regions as r (r.id)}
            {@const sel = r.id === selectedId}
            {@const gap = ringW * (sel ? 2 : 1)}
            <ellipse cx={r.cx} cy={r.cy} rx={r.rx + gap} ry={r.ry + gap} fill="none" stroke="rgba(0,0,0,0.5)" stroke-width={ringW * (sel ? 2.6 : 1.6)} />
            <ellipse cx={r.cx} cy={r.cy} rx={r.rx + gap} ry={r.ry + gap} fill="none" stroke={sel ? '#fff' : 'rgba(255,255,255,0.8)'} stroke-width={ringW * (sel ? 1.4 : 0.7)} />
            {#if sel}
              {@const h = handleOf(r)}
              <circle cx={h.x} cy={h.y} r={8 / scale} fill="#fff" stroke="rgba(0,0,0,0.6)" stroke-width={ringW} />
            {/if}
          {/each}
        </svg>
      {/if}
    </div>

    {#if zoomed}
      <button class="fit" onclick={fit}>{t.fit}</button>
    {/if}

    {#if phase === 'detecting'}
      <div class="overlay">
        <div class="card">
          <div class="spinner"></div>
          <p>{t.detecting}</p>
          <div class="progress"><div style="width:{Math.round(progress * 100)}%"></div></div>
          <button class="text" onclick={skipDetection}>{t.skip}</button>
        </div>
      </div>
    {/if}

    {#if toast}
      <div class="toast" role="status">{toast}</div>
    {/if}
  </div>

  <footer class="panel">
    {#if selected}
      <div class="panel-head">
        <button class="text danger" onclick={removeSelected}>{t.deleteEye}</button>
        <strong>{t.adjustEye}</strong>
        <button class="text strong" onclick={() => (selectedId = null)}>{t.done}</button>
      </div>
      <div class="sliders" onpointerdown={snapshot} role="group">
        <label><span>{t.size}</span>
          <input type="range" min="0" max="1" step="0.001" value={sizeToSlider(selected.rx)} oninput={(e) => setSize(+e.currentTarget.value)} />
        </label>
        <label><span>{t.darkness}</span>
          <input type="range" min="0" max="1" step="0.01" value={selected.params.darkness} oninput={(e) => setParam('darkness', +e.currentTarget.value)} />
        </label>
        <label><span>{t.strength}</span>
          <input type="range" min="0" max="1" step="0.01" value={selected.params.strength} oninput={(e) => setParam('strength', +e.currentTarget.value)} />
        </label>
        <label><span>{t.feather}</span>
          <input type="range" min="0" max="0.95" step="0.01" value={selected.params.feather} oninput={(e) => setParam('feather', +e.currentTarget.value)} />
        </label>
      </div>
      <div class="panel-foot">
        <span></span>
        <button class="text" onclick={resetSelected}>{t.resetEye}</button>
      </div>
    {:else}
      <p class="hint">{phase === 'ready' ? (regions.length ? t.hintTapMore : t.hintTap) : ' '}</p>
      <div class="actions">
        <button class="round" onclick={undo} disabled={!history.length} aria-label={t.undo}>
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M9 7H4V2M4.5 7.5A8 8 0 1 1 4 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>{t.undo}</span>
        </button>
        <button
          class="compare"
          disabled={phase !== 'ready' || !regions.length}
          onpointerdown={startCompare}
          onpointerup={endCompare}
          onpointerleave={endCompare}
          onpointercancel={endCompare}
          oncontextmenu={(e) => e.preventDefault()}
        >
          {t.compare}
        </button>
      </div>
    {/if}
  </footer>

  {#if saveSheet}
    <div class="sheet-backdrop" onclick={() => (saveSheet = false)} role="presentation">
      <div class="sheet" onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1" onkeydown={() => {}}>
        <button class="big primary" onclick={() => doSave('copy')}>
          {t.saveCopy}<small>{t.saveCopyHint}</small>
        </button>
        <button class="big" onclick={() => doSave('replace')}>
          {t.replaceOriginal}<small>{t.replaceHint}</small>
        </button>
        <button class="big plain" onclick={() => (saveSheet = false)}>{t.cancel}</button>
      </div>
    </div>
  {/if}

  {#if confirmClose}
    <div class="sheet-backdrop" role="presentation">
      <div class="sheet" role="alertdialog" aria-modal="true">
        <p class="sheet-title">{t.confirmLeave}</p>
        <button class="big danger" onclick={onclose}>{t.discard}</button>
        <button class="big plain" onclick={() => (confirmClose = false)}>{t.keepEditing}</button>
      </div>
    </div>
  {/if}

  {#if busy}
    <div class="overlay blocking"><div class="card"><div class="spinner"></div><p>{busy}</p></div></div>
  {/if}
</div>

<style>
  .editor {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-editor);
    color: var(--fg);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: calc(env(safe-area-inset-top) + 8px) 12px 8px;
    background: var(--bar);
  }
  .count {
    color: var(--muted);
    font-size: 15px;
  }
  .viewport {
    position: relative;
    flex: 1;
    overflow: hidden;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    cursor: crosshair;
  }
  .stage {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
  }
  .stage canvas,
  .stage svg {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
  }
  .stage svg {
    overflow: visible;
    pointer-events: none;
  }
  .fit {
    position: absolute;
    right: 12px;
    top: 12px;
    padding: 8px 14px;
    border-radius: 18px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 15px;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    background: rgba(0, 0, 0, 0.35);
  }
  .overlay.blocking {
    position: fixed;
    z-index: 30;
  }
  .card {
    background: var(--card);
    border-radius: 18px;
    padding: 22px 26px 14px;
    min-width: 240px;
    text-align: center;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }
  .card p {
    margin: 12px 0;
    font-size: 17px;
  }
  .progress {
    height: 6px;
    border-radius: 3px;
    background: var(--track);
    overflow: hidden;
    margin-bottom: 8px;
  }
  .progress div {
    height: 100%;
    background: var(--accent);
    transition: width 0.2s;
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
  .toast {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    background: rgba(20, 20, 20, 0.88);
    color: #fff;
    padding: 10px 18px;
    border-radius: 20px;
    font-size: 16px;
    white-space: nowrap;
    pointer-events: none;
    animation: fade 0.25s ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
  }
  .panel {
    background: var(--bar);
    padding: 10px 16px calc(env(safe-area-inset-bottom) + 12px);
    min-height: 120px;
  }
  .hint {
    margin: 2px 0 10px;
    text-align: center;
    color: var(--muted);
    font-size: 15px;
  }
  .actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .round {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 64px;
    color: var(--fg);
    font-size: 12px;
  }
  .compare {
    flex: 1;
    height: 50px;
    border-radius: 14px;
    background: var(--btn);
    color: var(--fg);
    font-size: 16px;
    touch-action: none;
    -webkit-touch-callout: none;
  }
  .compare:active {
    background: var(--btn-active);
  }
  .panel-head,
  .panel-foot {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .panel-head strong {
    font-size: 17px;
  }
  .sliders {
    display: grid;
    gap: 6px;
    margin: 6px 0;
  }
  .sliders label {
    display: grid;
    grid-template-columns: 120px 1fr;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    min-height: 40px;
  }
  .sliders span {
    color: var(--muted);
  }
  input[type='range'] {
    width: 100%;
    height: 40px;
    accent-color: var(--accent);
  }
  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sheet {
    width: min(520px, 100%);
    background: var(--card);
    border-radius: 18px 18px 0 0;
    padding: 16px 16px calc(env(safe-area-inset-bottom) + 16px);
    display: grid;
    gap: 10px;
    animation: up 0.2s ease-out;
  }
  @keyframes up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  .sheet-title {
    margin: 4px 0 8px;
    text-align: center;
    font-size: 17px;
  }
  .big {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 14px;
    border-radius: 14px;
    background: var(--btn);
    color: var(--fg);
    font-size: 18px;
    font-weight: 600;
  }
  .big small {
    font-size: 13px;
    font-weight: 400;
    opacity: 0.75;
  }
  .big.primary {
    background: var(--accent);
    color: #fff;
  }
  .big.danger {
    background: var(--danger);
    color: #fff;
  }
  .big.plain {
    background: transparent;
    font-weight: 500;
  }
  @media (min-width: 900px) {
    .panel {
      padding-left: max(16px, calc(50% - 320px));
      padding-right: max(16px, calc(50% - 320px));
    }
  }
</style>
