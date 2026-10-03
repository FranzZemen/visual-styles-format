/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

The shape of `visual-styles.json` (broken-stock/doc/prd/visual-styles.prd.md D2, D9, D10, D11, D12).

The file is the ONLY master copy of Broken Stock's named colours and sizes. Everything in this
package treats it as untrusted input: a save arrives from a browser tab, and the CSS generated from it
is committed and shipped (D22). Nothing here ever "cleans" a value — a bad value is refused with a
reason.
*/

/** The only file format version this package reads and writes. */
export const FORMAT_VERSION = 1;

/** A colour entry or a number entry. Gradients are out of scope (D2). */
export type EntryKind = 'colour' | 'number';

/**
 * Units a number entry may carry. `none` is a deliberate, explicit "unitless" (opacity, font
 * weight) so a forgotten unit on a font size is a refusal, not a silently invalid `font-size: 12`.
 */
export type NumberUnit = 'px' | 'rem' | 'em' | '%' | 'none';

export const NUMBER_UNITS: readonly NumberUnit[] = ['px', 'rem', 'em', '%', 'none'];

/**
 * Follow another entry BY REFERENCE (D9). The generated CSS is `var(--vs-<target>)`, so changing the
 * leader moves every follower in the browser, with no script.
 */
export interface Follow {
  /** The followed entry's `name`. Must exist, must be the same kind, must not lead back here. */
  target: string;
  /**
   * Colour follows only: 0–100 (percent). Generated as
   * `color-mix(in srgb, var(--vs-<target>) <opacity>%, transparent)`. Absent = fully the leader.
   */
  opacity?: number;
}

/**
 * One scoped chart rule (D12). Generated as `<scope> <selector> { <property>: var(--vs-<name>); }`.
 * Selection is by ROLE CLASS NAME, never by series position.
 */
export interface ChartRule {
  /** The class on the `<highcharts-chart>` host, e.g. `.bs-chart-since`. One class selector. */
  scope: string;
  /**
   * Class selectors inside it, compound classes allowed, joined only by single spaces
   * (descendant), e.g. `.bs-s-unrealized .highcharts-graph`. May END in one bare element name from
   * SELECTOR_ELEMENTS (`text`, `tspan`, `path`, `rect`), e.g. `.highcharts-button text` (E21).
   */
  selector: string;
  /** The CSS property, from an allow-list that depends on the entry's kind (see grammar.ts). */
  property: string;
}

export interface Entry {
  /** `[a-z0-9.-]`, starts with a letter, e.g. `profit.text`. CSS name: `--vs-profit-text`. */
  name: string;
  kind: EntryKind;
  /** The panel's grouping, e.g. `Meaning`, `Since chart`, `To migrate`. */
  group: string;
  /** One line saying what the entry is for. Shown in the panel; never emitted into CSS. */
  description: string;
  /**
   * Own value. Exactly one of `value` and `follow` is present.
   * Colour: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, or `rgb()`/`rgba()`/`hsl()`/`hsla()` with
   * numeric arguments. Number: a JSON number (the unit is separate).
   */
  value?: string | number;
  /** Follow another entry by reference. Exactly one of `value` and `follow` is present. */
  follow?: Follow;
  /** Number entries with a `value` only (required there). A following number takes its leader's. */
  unit?: NumberUnit;
  /**
   * Colour entries only: the entry this colour is drawn over, for the contrast check (D8).
   * Absent means `surface` (see DEFAULT_BACKGROUND).
   */
  background?: string;
  /** Scoped chart rules this entry drives (D12). */
  chart?: ChartRule[];
  /**
   * An existing custom property this entry takes over (D11, "To migrate"), e.g. `--color-profit`
   * or `--bs-brand-surface`. Generated as `--color-profit: var(--vs-<name>);` so every existing
   * `var(--color-profit)` keeps working.
   */
  legacyName?: string;
  /**
   * Colour entries only: also emit this entry into the Tailwind `@theme inline` block, so utility
   * classes such as `text-loss` keep working (D11). The theme variable is `legacyName` when that
   * starts with `--color-`, otherwise `--color-<css name without --vs->`.
   */
  tailwind?: boolean;
}

export interface VisualStylesFile {
  formatVersion: number;
  entries: Entry[];
}

/** The background a colour entry is checked against when it declares none (D8). */
export const DEFAULT_BACKGROUND = 'surface';

/** One reason a file is refused. Validation returns a list of these; it never repairs anything. */
export interface ValidationError {
  /** Where, as a JSON path, e.g. `entries[3].follow.target`. */
  path: string;
  /** The entry's name when the error belongs to one (and the name is a string). */
  entry?: string;
  code: ValidationCode;
  message: string;
}

export type ValidationCode =
  | 'not-json'
  | 'not-object'
  | 'unknown-field'
  | 'format-version'
  | 'entries-not-array'
  | 'missing-field'
  | 'wrong-type'
  | 'forbidden-text'
  | 'bad-name'
  | 'duplicate-name'
  | 'duplicate-css-name'
  | 'bad-kind'
  | 'value-and-follow'
  | 'no-value-or-follow'
  | 'bad-colour'
  | 'bad-number'
  | 'bad-unit'
  | 'unit-not-allowed'
  | 'unknown-follow-target'
  | 'follow-kind-mismatch'
  | 'follow-loop'
  | 'bad-opacity'
  | 'opacity-not-allowed'
  | 'bad-background'
  | 'background-not-allowed'
  | 'bad-scope'
  | 'bad-selector'
  | 'bad-property'
  | 'duplicate-chart-rule'
  | 'bad-legacy-name'
  | 'duplicate-legacy-name'
  | 'tailwind-not-allowed'
  | 'duplicate-tailwind-name'
  | 'too-long';

/** Thrown by the generators when handed a file that does not validate. Carries every error. */
export class VisualStylesInvalidError extends Error {
  constructor(public readonly errors: ValidationError[]) {
    super(`visual-styles file is invalid (${errors.length} error${errors.length === 1 ? '' : 's'}): ` +
      errors.slice(0, 5).map(e => `${e.path}: ${e.message}`).join('; ') + (errors.length > 5 ? '; …' : ''));
    this.name = 'VisualStylesInvalidError';
  }
}
