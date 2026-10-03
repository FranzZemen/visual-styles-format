/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

The strict value grammar (broken-stock/doc/prd/visual-styles.prd.md D22).

WHY STRICT. The local save server accepts a value from a browser tab and the generated CSS is
committed and shipped. Any site open in the same browser could try to post a "colour" that is really
CSS — `red; } body { background: url(https://…) }` — so every string that reaches the CSS must match
a grammar that cannot express anything but a colour, a number, a name or a class selector (which may
end in one element name from a fixed list, E21). Values are REFUSED, never cleaned: a cleaned value is
a value nobody typed.

Everything here is pure: no DOM, no Node APIs, so the panel (browser), the server (Node) and
broken-stock's agreement test all run the same code.
*/

import type {EntryKind, NumberUnit} from './types.js';
import {NUMBER_UNITS} from './types.js';

/** Text that may never appear in any string bound for CSS, whatever the field. */
const FORBIDDEN = /url\(|;|\{|\}|\\|\/\*|\*\/|["'`<>]|[\u0000-\u001f\u007f]/i;

/** Returns the first forbidden fragment found, or undefined when the text is clear. */
export function forbiddenFragment(text: string): string | undefined {
  const m = FORBIDDEN.exec(text);
  return m ? m[0] : undefined;
}

/** Entry names: lowercase letters, digits, `.` and `-`; starts with a letter; no empty segment. */
export const NAME_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export function isValidName(name: string): boolean {
  return NAME_PATTERN.test(name);
}

/** `profit.text` → `--vs-profit-text`. Dots become dashes; nothing else changes. */
export function cssVarName(name: string): string {
  return `--vs-${name.replace(/\./g, '-')}`;
}

/** Legacy custom property names (D11): `--color-profit`, `--bs-brand-surface`. Never `--vs-…`. */
export const LEGACY_NAME_PATTERN = /^--[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function isValidLegacyName(name: string): boolean {
  return LEGACY_NAME_PATTERN.test(name) && !name.startsWith('--vs-');
}

/** One class: `.bs-chart-since`, `.highcharts-graph`. */
const CLASS = '\\.[A-Za-z_][A-Za-z0-9_-]*';
/** One compound of classes on one element: `.highcharts-point.highcharts-point-up`. */
const COMPOUND = `(?:${CLASS})+`;

/**
 * Element names a chart selector may END with (E21). Highcharts draws some words and shapes as
 * unclassed children of a classed group and colours them only through an element selector in its own
 * sheet — `.highcharts-button text`, `.highcharts-range-label text`, `.highcharts-range-label rect`,
 * `.highcharts-legend-item > text`, `.highcharts-state-hover path`. Without an element name those
 * cannot be settings. The list is the SVG elements Highcharts actually draws that way:
 *  - `text`  — button words, range label, legend item label, data labels, crosshair label;
 *  - `tspan` — the lines inside a multi-line or styled `text` (a rule on `text` alone can lose to a
 *    class Highcharts puts on a `tspan`);
 *  - `path`  — line, area, marker and button-state shapes;
 *  - `rect`  — label and range-input boxes.
 * Deliberately NOT here: HTML elements (`div`, `span` — HTML labels take a class through the format
 * string, D14), grouping elements (`g`, `svg` — would colour everything under them), and the
 * universal `*`. Lowercase only, exactly as SVG writes them.
 */
export const SELECTOR_ELEMENTS: readonly string[] = ['path', 'rect', 'text', 'tspan'];

const SCOPE_PATTERN = new RegExp(`^${CLASS}$`);
const SELECTOR_PATTERN = new RegExp(
  `^${COMPOUND}(?: ${COMPOUND})*(?: (?:${SELECTOR_ELEMENTS.join('|')}))?$`
);

/** A chart scope is exactly one class selector (the class on the `<highcharts-chart>` host, D18). */
export function isValidScope(scope: string): boolean {
  return SCOPE_PATTERN.test(scope);
}

/**
 * A chart selector is one or more class compounds joined by single spaces (descendant combinator),
 * optionally ENDING in one bare element name from SELECTOR_ELEMENTS after a space
 * (`.highcharts-button text`). The element is never first (a rule always starts from a class Highcharts
 * or the app put there, D12), never compounded with a class (`text.x`), never in the middle, and only
 * lowercase. No ids, attributes, pseudo-classes, `>`/`+`/`~`, `*`, or anything else. Specificity is
 * what CSS gives the written selector: an element adds (0,0,1).
 */
export function isValidSelector(selector: string): boolean {
  return SELECTOR_PATTERN.test(selector);
}

/** The element name a valid selector ends with (`text` for `.highcharts-button text`), or undefined. */
export function selectorElement(selector: string): string | undefined {
  if (!isValidSelector(selector)) return undefined;
  const last = selector.slice(selector.lastIndexOf(' ') + 1);
  return SELECTOR_ELEMENTS.includes(last) ? last : undefined;
}

/** CSS properties a colour entry may drive in a chart rule. */
export const COLOUR_PROPERTIES: readonly string[] = [
  'background-color', 'border-color', 'color', 'fill', 'outline-color', 'stop-color', 'stroke'
];

/** CSS properties a number entry may drive in a chart rule. */
export const NUMBER_PROPERTIES: readonly string[] = [
  'border-width', 'fill-opacity', 'font-size', 'font-weight', 'line-height', 'opacity',
  'stroke-opacity', 'stroke-width'
];

export function isAllowedProperty(kind: EntryKind, property: string): boolean {
  return (kind === 'colour' ? COLOUR_PROPERTIES : NUMBER_PROPERTIES).includes(property);
}

export function isNumberUnit(unit: unknown): unit is NumberUnit {
  return typeof unit === 'string' && (NUMBER_UNITS as readonly string[]).includes(unit);
}

/**
 * The text of a number as it appears in CSS, or undefined when it cannot appear there safely:
 * not finite, or one JavaScript would print in exponent form (`1e21`, `1e-7`).
 */
export function formatNumber(n: number): string | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const text = Object.is(n, -0) ? '0' : String(n);
  return /^-?\d+(?:\.\d+)?$/.test(text) ? text : undefined;
}

/** A number entry's CSS text: `12px`, `0.4` (unit `none`). */
export function formatNumberValue(n: number, unit: NumberUnit): string | undefined {
  const text = formatNumber(n);
  if (text === undefined) return undefined;
  return unit === 'none' ? text : `${text}${unit}`;
}

/** A colour in sRGB: channels 0–255 (may be fractional), alpha 0–1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTION = /^(rgba?|hsla?)\(([^()]*)\)$/;
const PLAIN_NUMBER = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
const PERCENT = /^(?:\d+(?:\.\d+)?|\.\d+)%$/;
const HUE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:deg)?$/;

/** Splits a functional colour's arguments into the colour parts and the optional alpha. */
function splitArguments(inner: string): {parts: string[]; alpha?: string} | undefined {
  const text = inner.trim();
  if (text.includes(',')) {
    if (text.includes('/')) return undefined;
    const parts = text.split(',').map(p => p.trim());
    if (parts.length === 3) return {parts};
    if (parts.length === 4) return {parts: parts.slice(0, 3), alpha: parts[3]!};
    return undefined;
  }
  const slash = text.split('/');
  if (slash.length > 2) return undefined;
  const parts = slash[0]!.trim().split(/\s+/);
  if (parts.length !== 3) return undefined;
  if (slash.length === 2) {
    const alpha = slash[1]!.trim();
    if (alpha.length === 0) return undefined;
    return {parts, alpha};
  }
  return {parts};
}

function parseAlpha(text: string | undefined): number | undefined {
  if (text === undefined) return 1;
  if (PLAIN_NUMBER.test(text)) {
    const a = Number(text);
    return a <= 1 ? a : undefined;
  }
  if (PERCENT.test(text)) {
    const p = Number(text.slice(0, -1));
    return p <= 100 ? p / 100 : undefined;
  }
  return undefined;
}

function parseRgbChannel(text: string): number | undefined {
  if (PLAIN_NUMBER.test(text)) {
    const v = Number(text);
    return v <= 255 ? v : undefined;
  }
  if (PERCENT.test(text)) {
    const p = Number(text.slice(0, -1));
    return p <= 100 ? (p / 100) * 255 : undefined;
  }
  return undefined;
}

function parsePercent(text: string): number | undefined {
  if (!PERCENT.test(text)) return undefined;
  const p = Number(text.slice(0, -1));
  return p <= 100 ? p / 100 : undefined;
}

function hslToRgb(hueDegrees: number, s: number, l: number): [number, number, number] {
  const h = ((hueDegrees % 360) + 360) % 360;
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/**
 * Parses a colour written in the strict grammar, or returns undefined when it is not one.
 * Accepted: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`; `rgb()`/`rgba()` with 3 numeric channels
 * (0–255 or 0–100%) and an optional alpha (0–1 or 0–100%); `hsl()`/`hsla()` with a hue (number,
 * optional `deg`), saturation and lightness as percentages, and the same optional alpha. Comma or
 * space syntax (`rgb(1 2 3 / 50%)`). Function names lowercase. No keywords — not even `transparent`
 * (write `#0000`).
 */
export function parseColour(text: string): Rgba | undefined {
  if (typeof text !== 'string' || text.length > 64 || forbiddenFragment(text) !== undefined) return undefined;
  const hex = HEX.exec(text);
  if (hex) {
    let digits = hex[1]!;
    if (digits.length <= 4) digits = digits.split('').map(c => c + c).join('');
    const byte = (i: number): number => parseInt(digits.slice(i, i + 2), 16);
    return {r: byte(0), g: byte(2), b: byte(4), a: digits.length === 8 ? byte(6) / 255 : 1};
  }
  const fn = FUNCTION.exec(text);
  if (!fn) return undefined;
  const args = splitArguments(fn[2]!);
  if (!args) return undefined;
  const a = parseAlpha(args.alpha);
  if (a === undefined) return undefined;
  const [p0, p1, p2] = args.parts as [string, string, string];
  if (fn[1]!.startsWith('rgb')) {
    const r = parseRgbChannel(p0);
    const g = parseRgbChannel(p1);
    const b = parseRgbChannel(p2);
    if (r === undefined || g === undefined || b === undefined) return undefined;
    return {r, g, b, a};
  }
  if (!HUE.test(p0)) return undefined;
  const hue = Number(p0.replace(/deg$/, ''));
  const s = parsePercent(p1);
  const l = parsePercent(p2);
  if (s === undefined || l === undefined) return undefined;
  const [r, g, b] = hslToRgb(hue, s, l);
  return {r, g, b, a};
}

export function isValidColour(text: string): boolean {
  return parseColour(text) !== undefined;
}

/** `rgba(r, g, b, a)` with channels rounded to integers and alpha to 4 places. For display. */
export function formatRgba(c: Rgba): string {
  const ch = (v: number): number => Math.round(Math.max(0, Math.min(255, v)));
  const alpha = Math.round(Math.max(0, Math.min(1, c.a)) * 10000) / 10000;
  return `rgba(${ch(c.r)}, ${ch(c.g)}, ${ch(c.b)}, ${alpha})`;
}
