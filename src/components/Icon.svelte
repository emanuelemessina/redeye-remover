<script module lang="ts">
  // Small line icons for the controls (24×24, stroke = currentColor).
  export type IconName =
    | 'size'
    | 'pupil'
    | 'darkness'
    | 'shine'
    | 'feather'
    | 'strength'
    | 'colorAmount'
    | 'eyeColor'
    | 'globe'
    | 'swap';
</script>

<script lang="ts">
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  {#if name === 'size'}
    <circle cx="12" cy="12" r="5" />
    <path d="M3 9V3h6M21 15v6h-6M3 3l5 5M21 21l-5-5" />
  {:else if name === 'pupil'}
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4" fill="currentColor" />
  {:else if name === 'darkness'}
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z" />
  {:else if name === 'shine'}
    <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
    <path d="M19 16v4M17 18h4" />
  {:else if name === 'feather'}
    <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="8.5" stroke-dasharray="1.5 3" />
  {:else if name === 'strength'}
    <path d="M5 20v-3M10 20v-7M15 20v-11M20 20V4" />
  {:else if name === 'colorAmount'}
    <path d="M12 3s6 6.8 6 11a6 6 0 0 1-12 0c0-4.2 6-11 6-11z" />
    <path d="M9 15a3 3 0 0 0 3 3" />
  {:else if name === 'eyeColor'}
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" />
    <circle cx="12" cy="12" r="3.2" />
  {:else if name === 'globe'}
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  {:else if name === 'swap'}
    <path d="M8 7l-4 5 4 5M16 7l4 5-4 5" />
  {/if}
</svg>
