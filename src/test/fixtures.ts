/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

Small valid files for the tests. Each test copies and breaks one thing, so a refusal is always
attributable to the one change.
*/

import type {Entry, VisualStylesFile} from '#project';

export function entry(overrides: Partial<Entry> & {name: string}): Entry {
  return {kind: 'colour', group: 'Meaning', description: 'test entry', value: '#ffffff', ...overrides} as Entry;
}

export function file(...entries: Entry[]): VisualStylesFile {
  return {formatVersion: 1, entries};
}

/** A realistic small file: meaning entries, chart entries, follows, opacity, legacy, Tailwind, numbers. */
export function sample(): VisualStylesFile {
  return {
    formatVersion: 1,
    entries: [
      {name: 'surface', kind: 'colour', group: 'To migrate', description: 'Panel background', value: '#161b22',
        legacyName: '--color-surface', tailwind: true},
      {name: 'bs-brand.surface', kind: 'colour', group: 'To migrate', description: 'Brand surface (duplicate)',
        follow: {target: 'surface'}, legacyName: '--bs-brand-surface'},
      {name: 'profit.text', kind: 'colour', group: 'Meaning', description: 'Profit text', value: '#1b5e20',
        legacyName: '--color-profit', tailwind: true},
      {name: 'loss.text', kind: 'colour', group: 'Meaning', description: 'Loss text', value: '#8c0b2b',
        legacyName: '--color-loss', tailwind: true},
      {name: 'series-1', kind: 'colour', group: 'Meaning', description: 'First default series colour',
        value: 'rgb(41, 121, 255)'},
      {name: 'since.unrealized', kind: 'colour', group: 'Since chart', description: 'Unrealized line',
        follow: {target: 'series-1'},
        chart: [{scope: '.bs-chart-since', selector: '.bs-s-unrealized .highcharts-graph', property: 'stroke'}]},
      {name: 'since.unrealized-zero', kind: 'colour', group: 'Since chart', description: 'Unrealized zero line',
        follow: {target: 'since.unrealized', opacity: 40},
        chart: [{scope: '.bs-chart-since', selector: '.bs-zero-unrealized', property: 'stroke'}]},
      {name: 'chart.line.width', kind: 'number', group: 'Chart look', description: 'Default line width',
        value: 1.5, unit: 'px',
        chart: [{scope: '.bs-chart-since', selector: '.bs-s-unrealized .highcharts-graph', property: 'stroke-width'}]},
      {name: 'chart.inactive-opacity', kind: 'number', group: 'Chart look', description: 'Inactive series',
        value: 0.2, unit: 'none'}
    ]
  };
}
