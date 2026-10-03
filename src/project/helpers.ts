/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

What the panel and the save server need besides validation and generation
(broken-stock/doc/prd/visual-styles.prd.md D6, D8, D9):

  - resolveEntry   — an entry's effective value, following the chain, with opacities multiplied in;
  - followersOf    — who follows an entry (the panel refuses to delete a followed entry, D9);
  - diffVisualStyles — the save list: which entries changed, old → new (D6);
  - canonicalJson / contentHash — the stale-save check (D6): sha256 of canonical JSON;
  - formatVisualStyles — the exact text written to disk, so saves make clean git diffs.

All pure; `contentHash` uses Web Crypto (`globalThis.crypto.subtle`), present in browsers and in Node
20+, so it is async.
*/

import {formatNumberValue, formatRgba, parseColour, type Rgba} from './grammar.js';
import type {Entry, EntryKind, NumberUnit, VisualStylesFile} from './types.js';
import {DEFAULT_BACKGROUND} from './types.js';

export type ResolvedValue =
  | {
  kind: 'colour';
  /** The chain walked, starting with the asked-for entry and ending at the one with a value. */
  chain: string[];
  /** The value as written on the last entry in the chain. */
  ownValue: string;
  /** Product of every opacity on the chain, 0–1 (1 when none). */
  opacity: number;
  /** The effective colour with the opacity applied to its alpha. */
  rgba: Rgba;
  /** `rgba(…)` text of `rgba`, for swatches and checks. */
  css: string;
}
  | {
  kind: 'number';
  chain: string[];
  ownValue: number;
  unit: NumberUnit;
  /** e.g. `12px`. */
  css: string;
};

/**
 * The effective value of `name`, following its chain of follows. Mixing a colour with `transparent`
 * at N% in sRGB keeps the colour and scales its alpha by N%, so opacities multiply along the chain.
 * Returns undefined for an unknown name, a broken chain or a loop — validate the file first.
 */
export function resolveEntry(file: VisualStylesFile, name: string): ResolvedValue | undefined {
  const byName = new Map(file.entries.map(e => [e.name, e] as const));
  const chain: string[] = [];
  let opacity = 1;
  let entry = byName.get(name);
  const kind: EntryKind | undefined = entry?.kind;
  while (entry) {
    if (chain.includes(entry.name)) return undefined;
    chain.push(entry.name);
    if (entry.kind !== kind) return undefined;
    if (!entry.follow) break;
    if (entry.follow.opacity !== undefined) opacity *= entry.follow.opacity / 100;
    entry = byName.get(entry.follow.target);
  }
  if (!entry || entry.value === undefined) return undefined;
  if (entry.kind === 'colour') {
    if (typeof entry.value !== 'string') return undefined;
    const base = parseColour(entry.value);
    if (!base) return undefined;
    const rgba = {...base, a: base.a * opacity};
    return {kind: 'colour', chain, ownValue: entry.value, opacity, rgba, css: formatRgba(rgba)};
  }
  if (typeof entry.value !== 'number' || entry.unit === undefined) return undefined;
  const css = formatNumberValue(entry.value, entry.unit);
  if (css === undefined) return undefined;
  return {kind: 'number', chain, ownValue: entry.value, unit: entry.unit, css};
}

/**
 * Entries that follow `name`. Direct followers by default; `transitive: true` adds followers of
 * followers (everything that moves when `name` changes). Sorted by name.
 */
export function followersOf(file: VisualStylesFile, name: string, options: {transitive?: boolean} = {}): string[] {
  const direct = (n: string): string[] => file.entries.filter(e => e.follow?.target === n).map(e => e.name);
  if (!options.transitive) return direct(name).sort();
  const seen = new Set<string>();
  const queue = [name];
  while (queue.length > 0) {
    for (const f of direct(queue.shift()!)) {
      if (f !== name && !seen.has(f)) {
        seen.add(f);
        queue.push(f);
      }
    }
  }
  return [...seen].sort();
}

/** The background a colour entry is checked against (D8): its own, or `surface`. */
export function backgroundOf(entry: Entry): string {
  return entry.background ?? DEFAULT_BACKGROUND;
}

/** How an entry's value reads in the save list: `#1b5e20`, `12px`, `follows series-1 at 40%`. */
export function describeValue(entry: Entry): string {
  if (entry.follow) {
    return entry.follow.opacity === undefined
      ? `follows ${entry.follow.target}`
      : `follows ${entry.follow.target} at ${entry.follow.opacity}%`;
  }
  if (entry.kind === 'number' && typeof entry.value === 'number' && entry.unit !== undefined) {
    return formatNumberValue(entry.value, entry.unit) ?? String(entry.value);
  }
  return String(entry.value);
}

export interface EntryChange {
  name: string;
  change: 'added' | 'removed' | 'changed';
  before?: Entry;
  after?: Entry;
  /** `describeValue` of before/after; absent on the side that does not exist. */
  beforeText?: string;
  afterText?: string;
  /** True when only the value or follow changed (the common case: a colour edit). */
  valueOnly: boolean;
}

/** Every entry that differs between two files, sorted by name. Field order does not matter. */
export function diffVisualStyles(before: VisualStylesFile, after: VisualStylesFile): EntryChange[] {
  const old = new Map(before.entries.map(e => [e.name, e] as const));
  const neu = new Map(after.entries.map(e => [e.name, e] as const));
  const names = [...new Set([...old.keys(), ...neu.keys()])].sort();
  const changes: EntryChange[] = [];
  for (const name of names) {
    const b = old.get(name);
    const a = neu.get(name);
    if (b && a) {
      if (canonicalJson(b) === canonicalJson(a)) continue;
      const strip = (e: Entry): string => {
        const {value: _v, follow: _f, unit: _u, ...rest} = e;
        return canonicalJson(rest);
      };
      changes.push({
        name, change: 'changed', before: b, after: a, beforeText: describeValue(b), afterText: describeValue(a),
        valueOnly: strip(b) === strip(a)
      });
    } else if (a) {
      changes.push({name, change: 'added', after: a, afterText: describeValue(a), valueOnly: false});
    } else if (b) {
      changes.push({name, change: 'removed', before: b, beforeText: describeValue(b), valueOnly: false});
    }
  }
  return changes;
}

/**
 * JSON with object keys sorted (by codepoint) at every level and no whitespace. Array order is kept.
 * Two files that differ only in key order or formatting have the same canonical JSON.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    if (text === undefined) throw new TypeError(`canonicalJson: cannot represent ${typeof value}`);
    return text;
  }
  if (Array.isArray(value)) return `[${value.map(v => canonicalJson(v === undefined ? null : v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${keys.map(k => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

/** Hex sha256 of the canonical JSON of `value` (D6's stale-save check). */
export async function contentHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const ENTRY_KEY_ORDER: (keyof Entry)[] = [
  'name', 'kind', 'group', 'description', 'value', 'unit', 'follow', 'background', 'legacyName', 'tailwind', 'chart'
];

/**
 * The text written to `visual-styles.json`: 2-space indent, a fixed field order inside each entry,
 * entries in the order given, trailing newline. Does not validate — validate before writing.
 */
export function formatVisualStyles(file: VisualStylesFile): string {
  const entries = file.entries.map(e => {
    const ordered: Record<string, unknown> = {};
    for (const k of ENTRY_KEY_ORDER) if (e[k] !== undefined) ordered[k] = e[k];
    if (e.follow) ordered['follow'] = e.follow.opacity === undefined
      ? {target: e.follow.target}
      : {target: e.follow.target, opacity: e.follow.opacity};
    if (e.chart) ordered['chart'] = e.chart.map(r => ({scope: r.scope, selector: r.selector, property: r.property}));
    return ordered;
  });
  return JSON.stringify({formatVersion: file.formatVersion, entries}, null, 2) + '\n';
}

