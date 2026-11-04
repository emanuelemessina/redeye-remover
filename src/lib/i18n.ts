// Tiny i18n: English + Italian. Auto-detected from the browser language, with a
// user override stored in localStorage (changing it reloads the page).

export type Lang = 'en' | 'it';
export type Tip = { simple: string; tech: string };

const en = {
  appName: 'Red-eye Remover',
  tagline: 'Fix red eyes in your photos in one tap.',
  choosePhoto: 'Choose a photo',
  privacy: 'Your photos never leave your device.',
  loading: 'Opening photo…',
  detecting: 'Looking for red eyes…',
  skip: 'Skip',
  foundEyes: (n: number) => (n === 1 ? 'Fixed 1 red eye' : `Fixed ${n} red eyes`),
  noneFound: 'No red eyes found automatically',
  hintTap: 'Tap a red eye to fix it',
  hintTapMore: 'Tap an eye to adjust it, or tap another red eye',
  save: 'Save',
  saveCopy: 'Save as a copy',
  saveCopyHint: 'Your original photo stays untouched',
  replaceOriginal: 'Replace the original',
  replaceHint: 'Overwrites the original file',
  cancel: 'Cancel',
  saved: 'Saved!',
  saveFailed: 'Could not save the photo',
  peekOriginal: 'Original',
  peekResult: 'Result',
  peekHint: 'Hold · slide',
  peekTip: {
    simple: 'Press and hold: the left side shows the photo before the fix, the right side shows the final result without circles. Slide your finger to switch.',
    tech: 'While held, eye markers are hidden. Left half = unedited image, right half = corrected image exactly as it will be saved.',
  } as Tip,
  undo: 'Undo',
  close: 'New photo',
  adjustEye: 'Adjust eye',
  deleteEye: 'Remove',
  done: 'Done',
  size: 'Size',
  strength: 'Strength',
  darkness: 'Darkness',
  feather: 'Soft edge',
  pupil: 'Pupil size',
  shine: 'Reflection',
  eyeColor: 'Eye color',
  colorAmount: 'Color strength',
  colors: { natural: 'Original', brown: 'Brown', hazel: 'Hazel', green: 'Green', blue: 'Blue', gray: 'Gray' } as Record<string, string>,
  tips: {
    size: {
      simple: 'How big the circle is. Make it cover the colored part of the eye.',
      tech: 'Radius of the iris region in image pixels. You can also drag the white dot next to the circle.',
    },
    pupil: {
      simple: 'How big the dark center of the eye is.',
      tech: 'Pupil radius as a fraction of the circle. Inside it the red is removed and the area is darkened; around it the iris is kept or recolored.',
    },
    darkness: {
      simple: 'How dark the center of the eye becomes. Real pupils are almost black.',
      tech: 'Scales the red-free brightness of the pupil: 0 only removes the red, 1 makes it black. Film grain is kept.',
    },
    shine: {
      simple: 'Keeps the small white sparkle that makes eyes look alive.',
      tech: 'How much of small near-white highlights (catchlights) survives. A large white glare is always darkened.',
    },
    feather: {
      simple: 'Softens the edge of the circle so the fix blends into the photo.',
      tech: 'Width of the fade at the outer edge, as a fraction of the radius.',
    },
    strength: {
      simple: 'How much of the fix is applied. Lower it if the eye looks too edited.',
      tech: 'Opacity of the whole correction: 0 = original photo, 1 = full correction.',
    },
    colorAmount: {
      simple: 'How strong the chosen eye color is. Pick a color first.',
      tech: 'Blend amount of a brightness-preserving tint on the iris. Very dark iris areas are lifted slightly so the color can show.',
    },
    eyeColor: {
      simple: "Pick the person's real eye color. “Original” keeps the eye as it is and only removes the red.",
      tech: 'Tints the iris ring around the pupil. Eyelid skin and the white of the eye are left alone.',
    },
  } as Record<string, Tip>,
  version: 'Version',
  language: 'Language',
  langAuto: 'Automatic',
  resetEye: 'Reset',
  errUnsupported: "This photo format can't be opened here. Try a JPEG or PNG photo.",
  errTooLarge: 'This photo is too large to edit on this device.',
  errUnknown: 'Something went wrong opening this photo.',
  ok: 'OK',
  confirmLeave: 'Discard your changes to this photo?',
  discard: 'Discard',
  keepEditing: 'Keep editing',
  fit: 'Fit',
  eyesCount: (n: number) => (n === 1 ? '1 eye' : `${n} eyes`),
  install: 'Install app',
};
type Dict = typeof en;

const it: Dict = {
  appName: 'Togli Occhi Rossi',
  tagline: 'Correggi gli occhi rossi nelle tue foto con un tocco.',
  choosePhoto: 'Scegli una foto',
  privacy: 'Le tue foto restano sul tuo dispositivo.',
  loading: 'Apro la foto…',
  detecting: 'Cerco gli occhi rossi…',
  skip: 'Salta',
  foundEyes: (n) => (n === 1 ? 'Corretto 1 occhio rosso' : `Corretti ${n} occhi rossi`),
  noneFound: 'Nessun occhio rosso trovato automaticamente',
  hintTap: 'Tocca un occhio rosso per correggerlo',
  hintTapMore: 'Tocca un occhio per regolarlo, o tocca un altro occhio rosso',
  save: 'Salva',
  saveCopy: 'Salva una copia',
  saveCopyHint: "La foto originale resta com'è",
  replaceOriginal: "Sostituisci l'originale",
  replaceHint: 'Sovrascrive il file originale',
  cancel: 'Annulla',
  saved: 'Salvata!',
  saveFailed: 'Impossibile salvare la foto',
  peekOriginal: 'Originale',
  peekResult: 'Risultato',
  peekHint: 'Tieni premuto · scorri',
  peekTip: {
    simple: 'Tieni premuto: a sinistra vedi la foto prima della correzione, a destra il risultato finale senza cerchi. Scorri il dito per passare dall’uno all’altro.',
    tech: 'Mentre tieni premuto i cerchi sono nascosti. Metà sinistra = immagine originale, metà destra = immagine corretta esattamente come verrà salvata.',
  },
  undo: 'Annulla',
  close: 'Nuova foto',
  adjustEye: 'Regola occhio',
  deleteEye: 'Rimuovi',
  done: 'Fatto',
  size: 'Dimensione',
  strength: 'Intensità',
  darkness: 'Scurezza',
  feather: 'Bordo morbido',
  pupil: 'Pupilla',
  shine: 'Riflesso',
  eyeColor: 'Colore occhi',
  colorAmount: 'Intensità colore',
  colors: { natural: 'Originale', brown: 'Marrone', hazel: 'Nocciola', green: 'Verde', blue: 'Azzurro', gray: 'Grigio' },
  tips: {
    size: {
      simple: "Quanto è grande il cerchio. Fallo coprire la parte colorata dell'occhio.",
      tech: "Raggio della zona dell'iride in pixel. Puoi anche trascinare il pallino bianco accanto al cerchio.",
    },
    pupil: {
      simple: "Quanto è grande il centro scuro dell'occhio.",
      tech: "Raggio della pupilla come frazione del cerchio. Dentro il rosso viene tolto e la zona scurita; attorno l'iride viene mantenuta o ricolorata.",
    },
    darkness: {
      simple: "Quanto diventa scuro il centro dell'occhio. Le pupille vere sono quasi nere.",
      tech: 'Scala la luminosità (senza rosso) della pupilla: 0 toglie solo il rosso, 1 la rende nera. La grana della pellicola viene mantenuta.',
    },
    shine: {
      simple: 'Mantiene il piccolo riflesso bianco che rende gli occhi vivi.',
      tech: 'Quanto dei piccoli riflessi quasi bianchi viene mantenuto. Un grande riflesso bianco viene sempre scurito.',
    },
    feather: {
      simple: 'Ammorbidisce il bordo del cerchio così la correzione si fonde con la foto.',
      tech: 'Larghezza della sfumatura sul bordo esterno, come frazione del raggio.',
    },
    strength: {
      simple: "Quanto viene applicata la correzione. Abbassala se l'occhio sembra troppo ritoccato.",
      tech: 'Opacità di tutta la correzione: 0 = foto originale, 1 = correzione completa.',
    },
    colorAmount: {
      simple: 'Quanto è forte il colore degli occhi scelto. Prima scegli un colore.',
      tech: "Quantità di una tinta che mantiene la luminosità dell'iride. Le zone molto scure vengono schiarite un po' per mostrare il colore.",
    },
    eyeColor: {
      simple: "Scegli il vero colore degli occhi della persona. “Originale” lascia l'occhio com'è e toglie solo il rosso.",
      tech: "Colora l'anello dell'iride attorno alla pupilla. La pelle delle palpebre e il bianco dell'occhio non vengono toccati.",
    },
  },
  version: 'Versione',
  language: 'Lingua',
  langAuto: 'Automatica',
  resetEye: 'Ripristina',
  errUnsupported: 'Questo formato non si può aprire qui. Prova con una foto JPEG o PNG.',
  errTooLarge: 'Questa foto è troppo grande per questo dispositivo.',
  errUnknown: "Qualcosa è andato storto nell'aprire la foto.",
  ok: 'OK',
  confirmLeave: 'Vuoi scartare le modifiche a questa foto?',
  discard: 'Scarta',
  keepEditing: 'Continua',
  fit: 'Adatta',
  eyesCount: (n) => (n === 1 ? '1 occhio' : `${n} occhi`),
  install: 'Installa app',
};

const KEY = 'lang';
function readOverride(): Lang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'en' || v === 'it' ? v : null;
  } catch {
    return null;
  }
}
const detected: Lang = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase().startsWith('it') ? 'it' : 'en';

/** The user's explicit choice, or null for automatic. */
export const langOverride: Lang | null = readOverride();
export const locale: Lang = langOverride ?? detected;
export const t: Dict = locale === 'it' ? it : en;

/** Language names are always shown in their own language. */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', it: 'Italiano' };

export function setLanguage(l: Lang | null) {
  try {
    if (l) localStorage.setItem(KEY, l);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the choice just won't persist */
  }
  location.reload();
}
