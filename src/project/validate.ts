/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

Validation of a `visual-styles.json` file (broken-stock/doc/prd/visual-styles.prd.md D9, D22).

Returns EVERY error found, never stops at the first, and never repairs anything. The input is typed
`unknown` on purpose: the save server hands over whatever a browser posted.

Rules:
  - top level is exactly {formatVersion: 1, entries: [...]}; unknown fields refused everywhere;
  - names match [a-z0-9.-] (see grammar.ts), are unique, and stay unique after `.` → `-`
    (`profit.text` and `profit-text` would both be `--vs-profit-text`);
  - exactly one of `value` and `follow`;
  - colour values match the strict colour grammar; number values are finite JSON numbers with a unit
    from the allow-list (`none` for unitless);
  - a follow names an existing entry of the same kind, never leads back to itself (loops refused),
    and only colours may add an opacity, 0–100;
  - `background`, `tailwind` are colour-only; `background` names an existing colour entry;
  - chart rules: one class scope, class-only descendant selector, an allowed property for the kind,
    and no two entries drive the same (scope, selector, property);
  - legacy names look like `--color-profit`, never `--vs-…`, and are unique; Tailwind theme names
    are unique;
  - no CSS-bound string contains `url(`, `;`, `{`, `}`, `\`, a comment, quotes, `<`/`>` or control
    characters.
*/

import {
  cssVarName, formatNumber, forbiddenFragment, isAllowedProperty, isNumberUnit, isValidColour,
  isValidLegacyName, isValidName, isValidScope, isValidSelector
} from './grammar.js';
import {tailwindThemeName} from './names.js';
import type {Entry, ValidationCode, ValidationError, VisualStylesFile} from './types.js';
import {FORMAT_VERSION, VisualStylesInvalidError} from './types.js';

const FILE_FIELDS = new Set(['formatVersion', 'entries']);
const ENTRY_FIELDS = new Set([
  'name', 'kind', 'group', 'description', 'value', 'follow', 'unit', 'background', 'chart', 'legacyName',
  'tailwind'
]);
const FOLLOW_FIELDS = new Set(['target', 'opacity']);
const RULE_FIELDS = new Set(['scope', 'selector', 'property']);

export const MAX_NAME_LENGTH = 64;
export const MAX_GROUP_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 400;
export const MAX_VALUE_LENGTH = 64;
export const MAX_SELECTOR_LENGTH = 200;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A field is present when its value is not undefined (JSON has no undefined; the panel's objects may). */
function has(obj: Record<string, unknown>, key: string): boolean {
  return obj[key] !== undefined;
}

class Collector {
  readonly errors: ValidationError[] = [];

  add(path: string, code: ValidationCode, message: string, entry?: string): void {
    this.errors.push(entry === undefined ? {path, code, message} : {path, entry, code, message});
  }

  unknownFields(obj: Record<string, unknown>, allowed: Set<string>, path: string, entry?: string): void {
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined && !allowed.has(key)) this.add(`${path}.${key}`, 'unknown-field', `unknown field '${key}'`, entry);
    }
  }

  /**
   * A string bound for CSS: must be a string, within length, and free of forbidden text.
   * Returns the string only when all three hold, so callers apply the grammar to clean input only.
   */
  cssString(v: unknown, path: string, maxLength: number, entry?: string): string | undefined {
    if (typeof v !== 'string') {
      this.add(path, 'wrong-type', 'must be a string', entry);
      return undefined;
    }
    if (v.length > maxLength) {
      this.add(path, 'too-long', `longer than ${maxLength} characters`, entry);
      return undefined;
    }
    const bad = forbiddenFragment(v);
    if (bad !== undefined) {
      this.add(path, 'forbidden-text', `contains forbidden text ${JSON.stringify(bad)}`, entry);
      return undefined;
    }
    return v;
  }
}

/** Validates the shape and grammar of one entry, in isolation. Cross-entry rules come later. */
function validateEntryShape(raw: unknown, path: string, c: Collector): void {
  if (!isPlainObject(raw)) {
    c.add(path, 'not-object', 'entry must be an object');
    return;
  }
  const label = typeof raw['name'] === 'string' ? raw['name'] : undefined;
  c.unknownFields(raw, ENTRY_FIELDS, path, label);

  // name
  if (!(has(raw, 'name'))) c.add(`${path}.name`, 'missing-field', 'name is required', label);
  else {
    const name = c.cssString(raw['name'], `${path}.name`, MAX_NAME_LENGTH, label);
    if (name !== undefined && !isValidName(name)) {
      c.add(`${path}.name`, 'bad-name',
        `name '${name}' must be lowercase letters, digits, '.' and '-', start with a letter, with no empty segment`,
        label);
    }
  }

  // kind
  const kind = raw['kind'];
  if (!(has(raw, 'kind'))) c.add(`${path}.kind`, 'missing-field', 'kind is required', label);
  else if (kind !== 'colour' && kind !== 'number') {
    c.add(`${path}.kind`, 'bad-kind', `kind must be 'colour' or 'number'`, label);
  }
  const knownKind = kind === 'colour' || kind === 'number' ? kind : undefined;

  // group, description — free text for the panel, never emitted into CSS
  for (const [field, max] of [['group', MAX_GROUP_LENGTH], ['description', MAX_DESCRIPTION_LENGTH]] as const) {
    const v = raw[field];
    if (!has(raw, field)) c.add(`${path}.${field}`, 'missing-field', `${field} is required`, label);
    else if (typeof v !== 'string' || v.trim().length === 0) {
      c.add(`${path}.${field}`, 'wrong-type', `${field} must be a non-empty string`, label);
    } else if (v.length > max) c.add(`${path}.${field}`, 'too-long', `longer than ${max} characters`, label);
  }

  // value XOR follow
  const hasValue = has(raw, 'value');
  const hasFollow = has(raw, 'follow');
  if (hasValue && hasFollow) {
    c.add(path, 'value-and-follow', 'an entry has either its own value or a follow, never both', label);
  } else if (!hasValue && !hasFollow) {
    c.add(path, 'no-value-or-follow', 'an entry needs its own value or a follow', label);
  }

  if (hasValue && knownKind === 'colour') {
    const v = c.cssString(raw['value'], `${path}.value`, MAX_VALUE_LENGTH, label);
    if (v !== undefined && !isValidColour(v)) {
      c.add(`${path}.value`, 'bad-colour',
        `'${v}' is not a colour: use #rgb, #rgba, #rrggbb, #rrggbbaa, rgb()/rgba()/hsl()/hsla() with numbers`,
        label);
    }
  }
  if (hasValue && knownKind === 'number') {
    const v = raw['value'];
    if (typeof v !== 'number') c.add(`${path}.value`, 'bad-number', 'a number entry\'s value must be a JSON number', label);
    else if (formatNumber(v) === undefined) {
      c.add(`${path}.value`, 'bad-number', `${String(v)} cannot be written in CSS (not finite, or exponent form)`, label);
    }
  }

  // unit: required on a number with its own value; forbidden elsewhere
  if (has(raw, 'unit')) {
    if (knownKind === 'colour') c.add(`${path}.unit`, 'unit-not-allowed', 'colour entries have no unit', label);
    else if (knownKind === 'number' && hasFollow) {
      c.add(`${path}.unit`, 'unit-not-allowed', 'a following number takes its leader\'s unit', label);
    } else if (!isNumberUnit(raw['unit'])) {
      c.add(`${path}.unit`, 'bad-unit', `unit must be one of px, rem, em, %, none`, label);
    }
  } else if (knownKind === 'number' && hasValue) {
    c.add(`${path}.unit`, 'missing-field', 'a number with its own value needs a unit (use \'none\' for unitless)', label);
  }

  // follow shape (target existence, kind and loops are cross-entry)
  if (hasFollow) {
    const f = raw['follow'];
    if (!isPlainObject(f)) c.add(`${path}.follow`, 'not-object', 'follow must be an object', label);
    else {
      c.unknownFields(f, FOLLOW_FIELDS, `${path}.follow`, label);
      if (!(has(f, 'target'))) c.add(`${path}.follow.target`, 'missing-field', 'follow.target is required', label);
      else {
        const t = c.cssString(f['target'], `${path}.follow.target`, MAX_NAME_LENGTH, label);
        if (t !== undefined && !isValidName(t)) c.add(`${path}.follow.target`, 'bad-name', `'${t}' is not a valid entry name`, label);
      }
      if (has(f, 'opacity')) {
        const o = f['opacity'];
        if (knownKind === 'number') {
          c.add(`${path}.follow.opacity`, 'opacity-not-allowed', 'only colour follows may add an opacity', label);
        } else if (typeof o !== 'number' || formatNumber(o) === undefined || o < 0 || o > 100) {
          c.add(`${path}.follow.opacity`, 'bad-opacity', 'opacity must be a number from 0 to 100 (percent)', label);
        }
      }
    }
  }

  // background
  if (has(raw, 'background')) {
    if (knownKind === 'number') {
      c.add(`${path}.background`, 'background-not-allowed', 'only colour entries declare a background', label);
    } else {
      const b = c.cssString(raw['background'], `${path}.background`, MAX_NAME_LENGTH, label);
      if (b !== undefined && !isValidName(b)) c.add(`${path}.background`, 'bad-background', `'${b}' is not a valid entry name`, label);
    }
  }

  // chart rules
  if (has(raw, 'chart')) {
    const rules = raw['chart'];
    if (!Array.isArray(rules)) c.add(`${path}.chart`, 'wrong-type', 'chart must be an array of rules', label);
    else {
      rules.forEach((rule: unknown, i: number) => {
        const rp = `${path}.chart[${i}]`;
        if (!isPlainObject(rule)) {
          c.add(rp, 'not-object', 'chart rule must be an object', label);
          return;
        }
        c.unknownFields(rule, RULE_FIELDS, rp, label);
        for (const field of ['scope', 'selector', 'property'] as const) {
          if (!has(rule, field)) c.add(`${rp}.${field}`, 'missing-field', `${field} is required`, label);
        }
        if (has(rule, 'scope')) {
          const s = c.cssString(rule['scope'], `${rp}.scope`, MAX_NAME_LENGTH, label);
          if (s !== undefined && !isValidScope(s)) {
            c.add(`${rp}.scope`, 'bad-scope', `'${s}' must be one class selector, e.g. .bs-chart-since`, label);
          }
        }
        if (has(rule, 'selector')) {
          const s = c.cssString(rule['selector'], `${rp}.selector`, MAX_SELECTOR_LENGTH, label);
          if (s !== undefined && !isValidSelector(s)) {
            c.add(`${rp}.selector`, 'bad-selector',
              `'${s}' must be class selectors joined by single spaces, e.g. .bs-s-ema9 .highcharts-graph`, label);
          }
        }
        if (has(rule, 'property')) {
          const p = c.cssString(rule['property'], `${rp}.property`, MAX_NAME_LENGTH, label);
          if (p !== undefined && knownKind !== undefined && !isAllowedProperty(knownKind, p)) {
            c.add(`${rp}.property`, 'bad-property', `'${p}' is not an allowed property for a ${knownKind} entry`, label);
          }
        }
      });
    }
  }

  // legacy name
  if (has(raw, 'legacyName')) {
    const l = c.cssString(raw['legacyName'], `${path}.legacyName`, MAX_NAME_LENGTH, label);
    if (l !== undefined && !isValidLegacyName(l)) {
      c.add(`${path}.legacyName`, 'bad-legacy-name',
        `'${l}' must be a custom property name like --color-profit, and never --vs-…`, label);
    }
  }

  // tailwind
  if (has(raw, 'tailwind')) {
    if (typeof raw['tailwind'] !== 'boolean') c.add(`${path}.tailwind`, 'wrong-type', 'tailwind must be true or false', label);
    else if (raw['tailwind'] && knownKind === 'number') {
      c.add(`${path}.tailwind`, 'tailwind-not-allowed', 'only colour entries go into the Tailwind theme', label);
    }
  }
}

/** Cross-entry rules, applied to entries whose names are usable. */
function validateAcrossEntries(entries: unknown[], c: Collector): void {
  const byName = new Map<string, {entry: Record<string, unknown>; index: number}>();
  const cssNames = new Map<string, string>();
  const legacyNames = new Map<string, string>();
  const tailwindNames = new Map<string, string>();
  const ruleTargets = new Map<string, string>();

  entries.forEach((raw, index) => {
    if (!isPlainObject(raw) || typeof raw['name'] !== 'string' || !isValidName(raw['name'])) return;
    const name = raw['name'];
    const path = `entries[${index}]`;
    if (byName.has(name)) {
      c.add(`${path}.name`, 'duplicate-name', `name '${name}' is already used by entries[${byName.get(name)!.index}]`, name);
      return;
    }
    byName.set(name, {entry: raw, index});
    const css = cssVarName(name);
    const clash = cssNames.get(css);
    if (clash !== undefined) {
      c.add(`${path}.name`, 'duplicate-css-name', `'${name}' and '${clash}' both become ${css}`, name);
    } else cssNames.set(css, name);

    const legacy = raw['legacyName'];
    if (typeof legacy === 'string' && isValidLegacyName(legacy)) {
      const other = legacyNames.get(legacy);
      if (other !== undefined) c.add(`${path}.legacyName`, 'duplicate-legacy-name', `${legacy} is already taken over by '${other}'`, name);
      else legacyNames.set(legacy, name);
    }

    if (raw['tailwind'] === true && raw['kind'] === 'colour') {
      const tw = tailwindThemeName(name, typeof legacy === 'string' ? legacy : undefined);
      const other = tailwindNames.get(tw);
      if (other !== undefined) c.add(`${path}.tailwind`, 'duplicate-tailwind-name', `Tailwind name ${tw} is already used by '${other}'`, name);
      else tailwindNames.set(tw, name);
    }

    const rules = raw['chart'];
    if (Array.isArray(rules)) {
      rules.forEach((rule: unknown, i: number) => {
        if (!isPlainObject(rule)) return;
        const {scope, selector, property} = rule;
        if (typeof scope !== 'string' || typeof selector !== 'string' || typeof property !== 'string') return;
        const key = `${scope} ${selector} { ${property} }`;
        const other = ruleTargets.get(key);
        if (other !== undefined) {
          c.add(`${path}.chart[${i}]`, 'duplicate-chart-rule',
            `'${other}' already sets ${property} on ${scope} ${selector}`, name);
        } else ruleTargets.set(key, name);
      });
    }
  });

  // follow targets, kinds, backgrounds
  for (const [name, {entry, index}] of byName) {
    const f = entry['follow'];
    if (isPlainObject(f) && typeof f['target'] === 'string' && isValidName(f['target'])) {
      const target = byName.get(f['target']);
      if (!target) {
        c.add(`entries[${index}].follow.target`, 'unknown-follow-target', `'${name}' follows '${f['target']}', which does not exist`, name);
      } else if (target.entry['kind'] !== entry['kind']) {
        c.add(`entries[${index}].follow.target`, 'follow-kind-mismatch',
          `'${name}' (${String(entry['kind'])}) cannot follow '${f['target']}' (${String(target.entry['kind'])})`, name);
      }
    }
    const b = entry['background'];
    if (typeof b === 'string' && isValidName(b) && entry['kind'] === 'colour') {
      const target = byName.get(b);
      if (!target) c.add(`entries[${index}].background`, 'bad-background', `background '${b}' does not exist`, name);
      else if (target.entry['kind'] !== 'colour') c.add(`entries[${index}].background`, 'bad-background', `background '${b}' is not a colour`, name);
      else if (b === name) c.add(`entries[${index}].background`, 'bad-background', 'an entry cannot be its own background', name);
    }
  }

  // follow loops: each entry has at most one outgoing follow, so walk each chain once
  const state = new Map<string, 'walking' | 'done'>();
  for (const start of byName.keys()) {
    if (state.has(start)) continue;
    const chain: string[] = [];
    let current: string | undefined = start;
    while (current !== undefined && !state.has(current)) {
      state.set(current, 'walking');
      chain.push(current);
      const f: unknown = byName.get(current)?.entry['follow'];
      const next: unknown = isPlainObject(f) ? f['target'] : undefined;
      current = typeof next === 'string' && byName.has(next) ? next : undefined;
    }
    if (current !== undefined && state.get(current) === 'walking') {
      const loop = chain.slice(chain.indexOf(current));
      const first = [...loop].sort()[0]!;
      c.add(`entries[${byName.get(first)!.index}].follow`, 'follow-loop',
        `follow loop: ${[...loop, current].join(' → ')}`, first);
    }
    for (const n of chain) state.set(n, 'done');
  }
}

/**
 * Every reason `input` is not a valid visual-styles file. An empty list means valid.
 * `input` is the parsed JSON (use `parseVisualStyles` for text).
 */
export function validateVisualStyles(input: unknown): ValidationError[] {
  const c = new Collector();
  if (!isPlainObject(input)) {
    c.add('$', 'not-object', 'the file must be a JSON object');
    return c.errors;
  }
  c.unknownFields(input, FILE_FIELDS, '$');
  if (input['formatVersion'] !== FORMAT_VERSION) {
    c.add('$.formatVersion', 'format-version', `formatVersion must be ${FORMAT_VERSION}`);
  }
  const entries = input['entries'];
  if (!Array.isArray(entries)) {
    c.add('$.entries', 'entries-not-array', 'entries must be an array');
    return c.errors;
  }
  entries.forEach((e: unknown, i: number) => validateEntryShape(e, `entries[${i}]`, c));
  validateAcrossEntries(entries, c);
  return c.errors;
}

export function isValidVisualStyles(input: unknown): input is VisualStylesFile {
  return validateVisualStyles(input).length === 0;
}

/** Returns the input typed as a file, or throws VisualStylesInvalidError carrying every error. */
export function assertValidVisualStyles(input: unknown): VisualStylesFile {
  const errors = validateVisualStyles(input);
  if (errors.length > 0) throw new VisualStylesInvalidError(errors);
  return input as VisualStylesFile;
}

/** Parses JSON text and validates it. `file` is present only when there are no errors. */
export function parseVisualStyles(text: string): {file?: VisualStylesFile; errors: ValidationError[]} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {errors: [{path: '$', code: 'not-json', message: `not JSON: ${err instanceof Error ? err.message : String(err)}`}]};
  }
  const errors = validateVisualStyles(parsed);
  return errors.length === 0 ? {file: parsed as VisualStylesFile, errors} : {errors};
}

/** The entry with `name`, or undefined. */
export function findEntry(file: VisualStylesFile, name: string): Entry | undefined {
  return file.entries.find(e => e.name === name);
}
