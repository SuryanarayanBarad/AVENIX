/**
 * Guards the light theme against text and chart paint that cannot be seen.
 *
 * Four failure modes, every one of which shipped at least once:
 *   1. a text-white/NN whose opacity the bridge does not map — it stays
 *      near-white and vanishes on a white surface
 *   2. a status tone (-50/-100/-200) written for a dark tint, likewise
 *   3. solid text-white on an element that does not paint its own background
 *   4. an SVG that paints white by attribute, which no CSS class rule reaches
 *
 * Static analysis only: no server, no database, runs in well under a second.
 * `npm run check:contrast`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/index.css'), 'utf8');

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
};

let pass = 0;
let fail = 0;
const ck = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ' — ' + detail : ''}`);
};

const files = walk(join(root, 'src/components'));
const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');

const usedOpacities = [...new Set([...src.matchAll(/text-white\/(\d+)/g)].map((m) => m[1]))];
const unmapped = usedOpacities.filter((v) => !css.includes(`.pc .text-white\\/${v}`));
ck(`all ${usedOpacities.length} text-white opacities are mapped`, unmapped.length === 0,
  unmapped.map((v) => '/' + v).join(', '));

const tones = [...new Set(
  [...src.matchAll(/text-(emerald|rose|amber|green|red|blue)-(50|100|200)\b/g)].map((m) => `${m[1]}-${m[2]}`),
)];
const unmappedTones = tones.filter((t) => !css.includes(`.pc .text-${t}`));
ck(`all ${tones.length} near-white status tones are mapped`, unmappedTones.length === 0,
  unmappedTones.join(', '));

ck('bare text-white is remapped to the body colour',
  css.includes('.pc .text-white:not(') && css.includes('color: var(--pc-text)'));

ck('elements painting a brand background keep their white text',
  css.includes(':not([class^="bg-[#2E37A4]"])') && css.includes(':not([class*=" bg-[#2E37A4]"])'));

ck('the exclusion is anchored, so hover: variants do not count',
  !css.includes(':not([class*="bg-[#2E37A4]"])'));

ck('buttons with an explicit background opt out of the glass rule',
  css.includes(':not([class*="bg-[#"])'));

// White is only wrong where it IS the mark. A white stroke ringing a filled
// marker is a halo that works because the card is white, so an element is only
// flagged when white is its fill, or when it is a line or a text — the two that
// have nothing underneath them to separate from.
const WHITE = /^(?:white|#fff(?:fff)?[0-9a-fA-F]{0,2}|rgba\(255,\s*255,\s*255[^)]*\))$/;
const whitePaint = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const el of text.matchAll(/<(text|line|rect|circle|path|polyline)\b([^>]*)>/g)) {
    const [, tag, attrs] = el;
    const fill = attrs.match(/fill="([^"]*)"/)?.[1];
    const stroke = attrs.match(/stroke="([^"]*)"/)?.[1];
    const bad =
      (fill && WHITE.test(fill)) ||
      (stroke && WHITE.test(stroke) && (tag === 'line' || tag === 'text'));
    if (bad) whitePaint.push(`${file.split('/').pop()}: <${tag}> ${fill ? 'fill=' + fill : 'stroke=' + stroke}`);
  }
}
ck('no SVG mark is painted white', whitePaint.length === 0, whitePaint.slice(0, 3).join(' | '));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
