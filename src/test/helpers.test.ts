/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

Helpers for the panel and the save server (visual-styles.prd.md D6, D8, D9), plus the version stamp
agreement: the const the generator stamps must equal package.json's version, or the stamp lies.
*/

import 'mocha';
import {expect} from 'chai';
import {readFileSync} from 'node:fs';
import {
  backgroundOf, canonicalJson, contentHash, describeValue, diffVisualStyles, followersOf, formatVisualStyles,
  PACKAGE_NAME, PACKAGE_VERSION, parseVisualStyles, resolveEntry, type VisualStylesFile
} from '#project';
import {entry, file, sample} from './fixtures.js';

describe('helpers', () => {
  describe('resolveEntry', () => {
    it('returns an own colour value', () => {
      const r = resolveEntry(sample(), 'profit.text')!;
      expect(r.kind).to.equal('colour');
      expect(r.chain).to.deep.equal(['profit.text']);
      expect(r.css).to.equal('rgba(27, 94, 32, 1)');
    });

    it('follows the chain and multiplies opacity', () => {
      const r = resolveEntry(sample(), 'since.unrealized-zero')!;
      expect(r.chain).to.deep.equal(['since.unrealized-zero', 'since.unrealized', 'series-1']);
      if (r.kind !== 'colour') throw new Error('expected colour');
      expect(r.ownValue).to.equal('rgb(41, 121, 255)');
      expect(r.opacity).to.equal(0.4);
      expect(r.css).to.equal('rgba(41, 121, 255, 0.4)');
    });

    it('compounds opacity over several follows and the base alpha', () => {
      const a = entry({name: 'a', value: '#ff000080'});
      const b = entry({name: 'b', follow: {target: 'a', opacity: 50}});
      const c = entry({name: 'c', follow: {target: 'b', opacity: 50}});
      delete b.value;
      delete c.value;
      const r = resolveEntry(file(a, b, c), 'c')!;
      if (r.kind !== 'colour') throw new Error('expected colour');
      expect(r.opacity).to.equal(0.25);
      expect(r.rgba.a).to.be.closeTo((0x80 / 255) * 0.25, 1e-12);
    });

    it('resolves numbers with the leader\'s unit', () => {
      const m = entry({name: 'm', kind: 'number', follow: {target: 'chart.line.width'}} as never);
      delete m.value;
      const f: VisualStylesFile = {...sample(), entries: [...sample().entries, m]};
      const r = resolveEntry(f, 'm')!;
      expect(r).to.deep.include({kind: 'number', ownValue: 1.5, unit: 'px', css: '1.5px'});
      expect(r.chain).to.deep.equal(['m', 'chart.line.width']);
    });

    it('returns undefined for an unknown name, a dangling follow or a loop', () => {
      expect(resolveEntry(sample(), 'nope')).to.equal(undefined);
      const d = entry({name: 'd', follow: {target: 'gone'}});
      delete d.value;
      expect(resolveEntry(file(d), 'd')).to.equal(undefined);
      const x = entry({name: 'x', follow: {target: 'y'}});
      const y = entry({name: 'y', follow: {target: 'x'}});
      delete x.value;
      delete y.value;
      expect(resolveEntry(file(x, y), 'x')).to.equal(undefined);
    });
  });

  describe('followersOf', () => {
    it('lists direct followers', () => {
      expect(followersOf(sample(), 'series-1')).to.deep.equal(['since.unrealized']);
      expect(followersOf(sample(), 'surface')).to.deep.equal(['bs-brand.surface']);
      expect(followersOf(sample(), 'profit.text')).to.deep.equal([]);
    });
    it('lists followers of followers when transitive', () => {
      expect(followersOf(sample(), 'series-1', {transitive: true})).to.deep.equal(['since.unrealized', 'since.unrealized-zero']);
    });
    it('terminates on a loop', () => {
      const x = entry({name: 'x', follow: {target: 'y'}});
      const y = entry({name: 'y', follow: {target: 'x'}});
      delete x.value;
      delete y.value;
      expect(followersOf(file(x, y), 'x', {transitive: true})).to.deep.equal(['y']);
    });
  });

  describe('backgroundOf and describeValue', () => {
    it('defaults the background to surface', () => {
      expect(backgroundOf(entry({name: 'a'}))).to.equal('surface');
      expect(backgroundOf(entry({name: 'a', background: 'panel'}))).to.equal('panel');
    });
    it('describes values', () => {
      expect(describeValue(entry({name: 'a', value: '#fff'}))).to.equal('#fff');
      expect(describeValue(entry({name: 'n', kind: 'number', value: 12, unit: 'px'}))).to.equal('12px');
      const f = entry({name: 'b', follow: {target: 'series-1', opacity: 40}});
      delete f.value;
      expect(describeValue(f)).to.equal('follows series-1 at 40%');
      f.follow = {target: 'series-1'};
      expect(describeValue(f)).to.equal('follows series-1');
    });
  });

  describe('diffVisualStyles', () => {
    it('finds nothing between identical files', () => {
      expect(diffVisualStyles(sample(), sample())).to.deep.equal([]);
    });
    it('ignores field order', () => {
      const shuffled = {...sample(), entries: sample().entries.map(e => Object.fromEntries(Object.entries(e).reverse()))};
      expect(diffVisualStyles(sample(), shuffled as VisualStylesFile)).to.deep.equal([]);
    });
    it('reports a changed value with old and new', () => {
      const after = sample();
      after.entries.find(e => e.name === 'profit.text')!.value = '#4caf50';
      const d = diffVisualStyles(sample(), after);
      expect(d).to.have.length(1);
      expect(d[0]).to.deep.include({name: 'profit.text', change: 'changed', beforeText: '#1b5e20', afterText: '#4caf50', valueOnly: true});
    });
    it('reports value → follow as a value-only change', () => {
      const after = sample();
      const e = after.entries.find(x => x.name === 'profit.text')!;
      delete e.value;
      e.follow = {target: 'series-1'};
      const d = diffVisualStyles(sample(), after);
      expect(d[0]).to.deep.include({beforeText: '#1b5e20', afterText: 'follows series-1', valueOnly: true});
    });
    it('reports a description change as not value-only', () => {
      const after = sample();
      after.entries[0]!.description = 'changed';
      expect(diffVisualStyles(sample(), after)[0]!.valueOnly).to.be.false;
    });
    it('reports added and removed entries, sorted by name', () => {
      const after = sample();
      after.entries = after.entries.filter(e => e.name !== 'loss.text');
      after.entries.push(entry({name: 'aaa', value: '#000'}));
      const d = diffVisualStyles(sample(), after);
      expect(d.map(c => [c.name, c.change])).to.deep.equal([['aaa', 'added'], ['loss.text', 'removed']]);
      expect(d[0]!.afterText).to.equal('#000');
      expect(d[1]!.beforeText).to.equal('#8c0b2b');
    });
  });

  describe('canonicalJson and contentHash', () => {
    it('sorts keys at every level and drops undefined fields', () => {
      expect(canonicalJson({b: 1, a: {d: [2, {f: 1, e: 0}], c: undefined}})).to.equal('{"a":{"d":[2,{"e":0,"f":1}]},"b":1}');
    });
    it('keeps array order', () => {
      expect(canonicalJson([2, 1])).to.equal('[2,1]');
    });
    it('hashes to 64 hex characters', async () => {
      expect(await contentHash(sample())).to.match(/^[0-9a-f]{64}$/);
    });
    it('is stable across key order and formatting', async () => {
      const shuffled = {entries: sample().entries.map(e => Object.fromEntries(Object.entries(e).reverse())), formatVersion: 1};
      const viaText = JSON.parse(JSON.stringify(sample(), null, 4));
      const h = await contentHash(sample());
      expect(await contentHash(shuffled)).to.equal(h);
      expect(await contentHash(viaText)).to.equal(h);
    });
    it('pins the hash of a fixed value (no silent algorithm change)', async () => {
      // sha256('{"entries":[],"formatVersion":1}')
      expect(await contentHash({formatVersion: 1, entries: []}))
        .to.equal('ef96b524607f17bf065c2fa241727a87507ab01531849df9867322ddde77b8e2');
    });
    it('changes when any value changes', async () => {
      const after = sample();
      after.entries[0]!.value = '#161b23';
      expect(await contentHash(after)).to.not.equal(await contentHash(sample()));
    });
  });

  describe('formatVisualStyles', () => {
    it('round-trips through parse', () => {
      const text = formatVisualStyles(sample());
      const r = parseVisualStyles(text);
      expect(r.errors).to.deep.equal([]);
      expect(canonicalJson(r.file)).to.equal(canonicalJson(sample()));
    });
    it('writes a fixed field order, 2-space indent and a trailing newline', () => {
      const shuffled = {formatVersion: 1, entries: sample().entries.map(e => Object.fromEntries(Object.entries(e).reverse()))};
      const text = formatVisualStyles(shuffled as VisualStylesFile);
      expect(text).to.equal(formatVisualStyles(sample()));
      expect(text.endsWith('}\n')).to.be.true;
      expect(text).to.contain('\n    {\n      "name": "surface",\n      "kind": "colour",\n      "group": "To migrate",');
    });
  });

  describe('version stamp', () => {
    it('matches package.json (run scripts/stamp-version.mjs after a hand bump)', () => {
      const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {name: string; version: string};
      expect(PACKAGE_NAME).to.equal(pkg.name);
      expect(PACKAGE_VERSION).to.equal(pkg.version);
    });
  });
});
