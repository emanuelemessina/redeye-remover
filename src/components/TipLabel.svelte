<script lang="ts">
  // A control label with an icon and an explanation bubble.
  // Desktop: shows on hover/focus. Touch: tap the label to show/hide.
  import type { Tip } from '../lib/i18n';
  import Icon, { type IconName } from './Icon.svelte';

  let { icon, label, tip }: { icon: IconName; label: string; tip: Tip } = $props();

  let el: HTMLButtonElement;
  // Mouse hover shows it; a click/tap pins it open until you tap elsewhere.
  let hovering = $state(false);
  let pinned = $state(false);
  const open = $derived(hovering || pinned);
  let pos = $state({ left: 0, bottom: 0, width: 280 });

  function place() {
    const r = el.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left));
    pos = { left, bottom: window.innerHeight - r.top + 8, width };
  }
  function enter(e: PointerEvent) {
    if (e.pointerType !== 'mouse') return;
    place();
    hovering = true;
  }
  function leave(e: PointerEvent) {
    if (e.pointerType === 'mouse') hovering = false;
  }
  function toggle() {
    place();
    pinned = !pinned;
  }
</script>

<svelte:window
  onresize={() => (pinned = hovering = false)}
  onpointerdown={(e) => {
    if (pinned && !el.contains(e.target as Node)) pinned = false;
  }}
/>

<button
  bind:this={el}
  type="button"
  class="tiplabel"
  aria-expanded={open}
  onpointerenter={enter}
  onpointerleave={leave}
  onblur={() => (pinned = false)}
  onclick={toggle}
>
  <Icon name={icon} />
  <span>{label}</span>
</button>

{#if open}
  <div class="bubble" role="tooltip" style="left:{pos.left}px;bottom:{pos.bottom}px;width:{pos.width}px">
    <p class="simple">{tip.simple}</p>
    <p class="tech">{tip.tech}</p>
  </div>
{/if}

<style>
  .tiplabel {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 6px 0;
    color: var(--muted);
    font-size: 15px;
    text-align: left;
    cursor: help;
  }
  .tiplabel:hover,
  .tiplabel:focus-visible,
  .tiplabel[aria-expanded='true'] {
    color: var(--fg);
  }
  .bubble {
    position: fixed;
    z-index: 50;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--tip-bg);
    color: var(--tip-fg);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    animation: pop 0.12s ease-out;
  }
  .bubble p {
    margin: 0;
  }
  .simple {
    font-size: 15px;
    line-height: 1.35;
  }
  .tech {
    margin-top: 6px !important;
    font-size: 12.5px;
    line-height: 1.35;
    opacity: 0.72;
  }
  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
</style>
