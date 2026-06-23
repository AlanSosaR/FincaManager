import { Hct, TonalPalette } from '@material/material-color-utilities';

const seed = new Hct(0x004741);

function tone(tp, t) { return tp.tone(t); }

const colors = {
  '--m3-primary': '#004741',
  '--m3-on-primary': '#ffffff',
  '--m3-primary-container': '#e4fd97',
  '--m3-on-primary-container': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, seed.chroma), 10)),
  '--m3-primary-fixed': '#e4fd97',
  '--m3-primary-fixed-dim': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 50), 80)),

  '--m3-secondary': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 12), 40)),
  '--m3-on-secondary': '#ffffff',
  '--m3-secondary-container': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 12), 92)),
  '--m3-on-secondary-container': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 12), 10)),

  '--m3-tertiary': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue + 60, 24), 40)),
  '--m3-on-tertiary': '#ffffff',
  '--m3-tertiary-container': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue + 60, 24), 92)),
  '--m3-on-tertiary-container': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue + 60, 24), 10)),

  '--m3-error': '#ff4103',
  '--m3-on-error': '#ffffff',
  '--m3-error-container': argbToHex(tone(TonalPalette.fromHueAndChroma(new Hct(0xff4103).hue, 100), 92)),
  '--m3-on-error-container': argbToHex(tone(TonalPalette.fromHueAndChroma(new Hct(0xff4103).hue, 100), 10)),

  '--m3-surface': '#f0ede4',
  '--m3-on-surface': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 4), 10)),
  '--m3-surface-variant': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 8), 92)),
  '--m3-on-surface-variant': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 8), 30)),
  '--m3-outline': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 8), 50)),
  '--m3-outline-variant': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 8), 82)),

  '--m3-surface-container-lowest': '#ffffff',
  '--m3-surface-container-low': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 2), 96)),
  '--m3-surface-container': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 2), 90)),
  '--m3-surface-container-high': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 2), 86)),
  '--m3-surface-container-highest': argbToHex(tone(TonalPalette.fromHueAndChroma(seed.hue, 2), 82)),
};

function argbToHex(argb) {
  const hex = (argb & 0xFFFFFF).toString(16).padStart(6, '0');
  return `#${hex}`;
}

for (const [name, value] of Object.entries(colors)) {
  const hex = typeof value === 'number' ? argbToHex(value) : value;
  console.log(`${name}: ${hex};`);
}
