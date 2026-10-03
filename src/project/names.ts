/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

Name mapping from entries to CSS and Tailwind (broken-stock/doc/prd/visual-styles.prd.md D11, D12).

  entry name        profit.text
  CSS variable      --vs-profit-text         (always; dots become dashes)
  legacy alias      --color-profit: var(--vs-profit-text);   (only when legacyName is set)
  Tailwind theme    --color-profit           (legacyName when it starts with --color-)
                    --color-profit-text      (otherwise: --color- + the CSS name without --vs-)
*/

import {cssVarName} from './grammar.js';

/** The Tailwind theme variable a `tailwind: true` colour entry is published under. */
export function tailwindThemeName(name: string, legacyName?: string): string {
  if (legacyName !== undefined && legacyName.startsWith('--color-')) return legacyName;
  return `--color-${cssVarName(name).slice('--vs-'.length)}`;
}
