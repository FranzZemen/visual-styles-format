/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

Validation (visual-styles.prd.md D9, D22): one test per rule and per refusal. Each case breaks ONE
thing in an otherwise valid file and asserts the exact error code, so a refusal cannot pass by
accident because something else in the file was wrong.
*/

import 'mocha';
import {expect} from 'chai';
import {
  assertValidVisualStyles, isValidVisualStyles, parseVisualStyles, validateVisualStyles, VisualStylesInvalidError,
  type ValidationCode
} from '#project';
import {entry, file, sample} from './fixtures.js';

function codes(input: unknown): ValidationCode[] {
  return validateVisualStyles(input).map(e => e.code);
}

function only(input: unknown, code: ValidationCode): void {
  const errors = validateVisualStyles(input);
  expect(errors.map(e => e.code), JSON.stringify(errors)).to.deep.equal([code]);
}

describe('validate', () => {
  it('accepts the sample file', () => {
    expect(validateVisualStyles(sample())).to.deep.equal([]);
    expect(isValidVisualStyles(sample())).to.be.true;
  });

  it('accepts an empty entry list', () => {
    expect(validateVisualStyles(file())).to.deep.equal([]);
  });

  describe('file shape', () => {
    it('refuses a non-object', () => {
      for (const v of [null, [], 'x', 3, undefined]) expect(codes(v)).to.deep.equal(['not-object']);
    });
    it('refuses a wrong or missing formatVersion', () => {
      only({formatVersion: 2, entries: []}, 'format-version');
      only({entries: []}, 'format-version');
      only({formatVersion: '1', entries: []}, 'format-version');
    });
    it('refuses entries that are not an array', () => {
      expect(codes({formatVersion: 1, entries: {}})).to.deep.equal(['entries-not-array']);
      expect(codes({formatVersion: 1})).to.deep.equal(['entries-not-array']);
    });
    it('refuses unknown top-level fields', () => {
      only({formatVersion: 1, entries: [], extra: 1}, 'unknown-field');
    });
    it('refuses a non-object entry', () => {
      only({formatVersion: 1, entries: ['x']}, 'not-object');
    });
    it('reports every error, not just the first', () => {
      const errs = validateVisualStyles(file(entry({name: 'a', value: 'red'}), entry({name: 'B', value: '#fff'})));
      expect(errs.map(e => e.code)).to.deep.equal(['bad-colour', 'bad-name']);
      expect(errs[0]!.path).to.equal('entries[0].value');
      expect(errs[0]!.entry).to.equal('a');
    });
  });

  describe('entry fields', () => {
    it('refuses unknown entry fields', () => {
      only(file({...entry({name: 'a'}), colour: '#fff'} as never), 'unknown-field');
    });
    it('requires name, kind, group, description', () => {
      for (const field of ['name', 'kind', 'group', 'description']) {
        const e: Record<string, unknown> = {...entry({name: 'a'})};
        delete e[field];
        expect(codes(file(e as never)), field).to.include('missing-field');
      }
    });
    it('refuses an empty or non-string group and description', () => {
      only(file(entry({name: 'a', group: ' '})), 'wrong-type');
      only(file(entry({name: 'a', description: 3 as never})), 'wrong-type');
    });
    it('refuses an over-long description', () => {
      only(file(entry({name: 'a', description: 'x'.repeat(401)})), 'too-long');
    });
    it('refuses a bad kind', () => {
      only(file(entry({name: 'a', kind: 'gradient' as never})), 'bad-kind');
    });
  });

  describe('names', () => {
    it('refuses a bad name', () => {
      only(file(entry({name: 'Profit'})), 'bad-name');
      only(file(entry({name: 'profit_text'})), 'bad-name');
    });
    it('refuses a name carrying forbidden text before applying the grammar', () => {
      only(file(entry({name: 'a;b'})), 'forbidden-text');
    });
    it('refuses a non-string name', () => {
      only(file(entry({name: 7 as never})), 'wrong-type');
    });
    it('refuses an over-long name', () => {
      only(file(entry({name: 'a'.repeat(65)})), 'too-long');
    });
    it('refuses duplicate names', () => {
      only(file(entry({name: 'a'}), entry({name: 'a'})), 'duplicate-name');
    });
    it('refuses two names that become the same CSS variable', () => {
      const errs = validateVisualStyles(file(entry({name: 'profit.text'}), entry({name: 'profit-text'})));
      expect(errs.map(e => e.code)).to.deep.equal(['duplicate-css-name']);
      expect(errs[0]!.message).to.contain('--vs-profit-text');
    });
  });

  describe('value XOR follow', () => {
    it('refuses both', () => {
      only(file(entry({name: 'a'}), entry({name: 'b', follow: {target: 'a'}})), 'value-and-follow');
    });
    it('refuses neither', () => {
      const e = entry({name: 'a'});
      delete e.value;
      only(file(e), 'no-value-or-follow');
    });
  });

  describe('colour values', () => {
    it('refuses a keyword', () => only(file(entry({name: 'a', value: 'red'})), 'bad-colour'));
    it('refuses a number as a colour', () => only(file(entry({name: 'a', value: 3 as never})), 'wrong-type'));
    for (const v of ['#fff; } body { background: url(x) }', 'url(x)', '#fff}', '#fff\\', '#fff/*x*/', '"#fff"']) {
      it(`refuses injection ${JSON.stringify(v)} as forbidden text`, () => only(file(entry({name: 'a', value: v})), 'forbidden-text'));
    }
    it('refuses an over-long value', () => only(file(entry({name: 'a', value: `rgb(${'1'.repeat(70)}, 0, 0)`})), 'too-long'));
    it('refuses a unit on a colour', () => only(file(entry({name: 'a', unit: 'px'})), 'unit-not-allowed'));
  });

  describe('number values', () => {
    const num = (o: Record<string, unknown>) => entry({name: 'n', kind: 'number', value: 12, unit: 'px', ...o} as never);
    it('accepts every unit', () => {
      for (const unit of ['px', 'rem', 'em', '%', 'none']) expect(codes(file(num({unit}))), unit).to.deep.equal([]);
    });
    it('accepts negative and fractional numbers', () => {
      expect(codes(file(num({value: -0.5})))).to.deep.equal([]);
    });
    it('refuses a string value', () => only(file(num({value: '12px'})), 'bad-number'));
    it('refuses exponent-form numbers', () => only(file(num({value: 1e-7})), 'bad-number'));
    it('refuses a missing unit', () => only(file(num({unit: undefined})), 'missing-field'));
    it('refuses an unknown unit', () => {
      only(file(num({unit: 'pt'})), 'bad-unit');
      only(file(num({unit: 'px;'})), 'bad-unit');
    });
    it('refuses a unit on a following number', () => {
      only(file(num({}), entry({name: 'm', kind: 'number', value: undefined, follow: {target: 'n'}, unit: 'px'} as never)),
        'unit-not-allowed');
    });
    it('accepts a following number without a unit', () => {
      const f = entry({name: 'm', kind: 'number', follow: {target: 'n'}} as never);
      delete f.value;
      expect(codes(file(num({}), f))).to.deep.equal([]);
    });
  });

  describe('follows', () => {
    const follower = (target: unknown, extra: Record<string, unknown> = {}) => {
      const e = entry({name: 'f', follow: {target, ...extra}} as never);
      delete e.value;
      return e;
    };
    it('refuses an unknown follow target', () => only(file(follower('nobody')), 'unknown-follow-target'));
    it('refuses a malformed target', () => only(file(entry({name: 'a'}), follower('A')), 'bad-name'));
    it('refuses a missing target', () => {
      const e = entry({name: 'f', follow: {} as never});
      delete e.value;
      only(file(e), 'missing-field');
    });
    it('refuses a non-object follow', () => {
      const e = entry({name: 'f', follow: 'a' as never});
      delete e.value;
      only(file(entry({name: 'a'}), e), 'not-object');
    });
    it('refuses unknown follow fields', () => only(file(entry({name: 'a'}), follower('a', {alpha: 1})), 'unknown-field'));
    it('refuses following an entry of another kind', () => {
      only(file(entry({name: 'n', kind: 'number', value: 1, unit: 'px'}), follower('n')), 'follow-kind-mismatch');
    });
    it('accepts opacity 0 to 100', () => {
      for (const opacity of [0, 40, 99.5, 100]) expect(codes(file(entry({name: 'a'}), follower('a', {opacity}))), String(opacity)).to.deep.equal([]);
    });
    it('refuses opacity outside 0 to 100 or not a number', () => {
      for (const opacity of [-1, 101, '40', '40%', NaN, null]) {
        only(file(entry({name: 'a'}), follower('a', {opacity})), 'bad-opacity');
      }
    });
    it('refuses opacity on a number follow', () => {
      const f = entry({name: 'm', kind: 'number', follow: {target: 'n', opacity: 50}} as never);
      delete f.value;
      only(file(entry({name: 'n', kind: 'number', value: 1, unit: 'px'}), f), 'opacity-not-allowed');
    });
  });

  describe('follow loops', () => {
    const f = (name: string, target: string) => {
      const e = entry({name, follow: {target}});
      delete e.value;
      return e;
    };
    it('refuses following itself', () => {
      const errs = validateVisualStyles(file(f('a', 'a')));
      expect(errs.map(e => e.code)).to.deep.equal(['follow-loop']);
      expect(errs[0]!.message).to.equal('follow loop: a → a');
    });
    it('refuses a two-entry loop, reported once', () => {
      const errs = validateVisualStyles(file(f('a', 'b'), f('b', 'a')));
      expect(errs.map(e => e.code)).to.deep.equal(['follow-loop']);
      expect(errs[0]!.message).to.equal('follow loop: a → b → a');
    });
    it('refuses a long loop entered from a tail, reported once', () => {
      const errs = validateVisualStyles(file(f('tail', 'b'), f('b', 'c'), f('c', 'd'), f('d', 'b')));
      expect(errs.map(e => e.code)).to.deep.equal(['follow-loop']);
      expect(errs[0]!.message).to.equal('follow loop: b → c → d → b');
      expect(errs[0]!.entry).to.equal('b');
    });
    it('reports two separate loops', () => {
      expect(codes(file(f('a', 'b'), f('b', 'a'), f('c', 'd'), f('d', 'c')))).to.deep.equal(['follow-loop', 'follow-loop']);
    });
    it('accepts long chains and fans without loops', () => {
      expect(codes(file(entry({name: 'root'}), f('a', 'root'), f('b', 'a'), f('c', 'b'), f('d', 'a')))).to.deep.equal([]);
    });
  });

  describe('background', () => {
    it('accepts an existing colour background', () => {
      expect(codes(file(entry({name: 'bg'}), entry({name: 'a', background: 'bg'})))).to.deep.equal([]);
    });
    it('refuses an unknown background', () => only(file(entry({name: 'a', background: 'nope'})), 'bad-background'));
    it('refuses a number background', () => {
      only(file(entry({name: 'n', kind: 'number', value: 1, unit: 'px'}), entry({name: 'a', background: 'n'})), 'bad-background');
    });
    it('refuses itself as background', () => only(file(entry({name: 'a', background: 'a'})), 'bad-background'));
    it('refuses a background on a number', () => {
      only(file(entry({name: 'bg'}), entry({name: 'n', kind: 'number', value: 1, unit: 'px', background: 'bg'})), 'background-not-allowed');
    });
    it('refuses forbidden text in a background', () => only(file(entry({name: 'a', background: 'x;y'})), 'forbidden-text'));
  });

  describe('chart rules', () => {
    const rule = (o: Record<string, unknown> = {}) => ({scope: '.bs-chart-since', selector: '.bs-s-a .highcharts-graph', property: 'stroke', ...o});
    it('accepts a valid rule', () => expect(codes(file(entry({name: 'a', chart: [rule()]})))).to.deep.equal([]));
    it('accepts a selector ending in an allowed element name (E21)', () => {
      for (const selector of ['.highcharts-button text', '.highcharts-range-label rect', '.a .b tspan', '.a path']) {
        expect(codes(file(entry({name: 'a', chart: [rule({selector})]}))), selector).to.deep.equal([]);
      }
    });
    it('names the allowed elements when it refuses a selector', () => {
      const errors = validateVisualStyles(file(entry({name: 'a', chart: [rule({selector: '.a div'})]})));
      expect(errors[0]!.message).to.contain('path, rect, text, tspan');
    });
    it('refuses a non-array chart', () => only(file(entry({name: 'a', chart: rule() as never})), 'wrong-type'));
    it('refuses a non-object rule', () => only(file(entry({name: 'a', chart: ['x' as never]})), 'not-object'));
    it('refuses missing rule fields', () => {
      only(file(entry({name: 'a', chart: [{scope: '.x', selector: '.y'} as never]})), 'missing-field');
    });
    it('refuses unknown rule fields', () => only(file(entry({name: 'a', chart: [rule({important: true}) as never]})), 'unknown-field'));
    it('refuses a bad scope', () => {
      only(file(entry({name: 'a', chart: [rule({scope: 'highcharts-chart'})]})), 'bad-scope');
      only(file(entry({name: 'a', chart: [rule({scope: '.a .b'})]})), 'bad-scope');
    });
    it('refuses a bad selector', () => {
      for (const selector of ['.a + .b', 'path', '.a[x]', '.a:hover', '.a,.b', '.a text .b', '.a div', '.a Text']) {
        only(file(entry({name: 'a', chart: [rule({selector})]})), 'bad-selector');
      }
    });
    it('refuses selectors carrying forbidden text', () => {
      for (const selector of ['.a > .b', '.a { x', '.a}', '.a;', '.a url(x)', '.a /* */', '.a[href="x"]']) {
        only(file(entry({name: 'a', chart: [rule({selector})]})), 'forbidden-text');
      }
    });
    it('refuses a property the kind may not drive', () => {
      only(file(entry({name: 'a', chart: [rule({property: 'stroke-width'})]})), 'bad-property');
      only(file(entry({name: 'a', chart: [rule({property: 'background-image'})]})), 'bad-property');
      only(file(entry({name: 'n', kind: 'number', value: 1, unit: 'px', chart: [rule({property: 'fill'})]})), 'bad-property');
    });
    it('refuses two entries driving the same scope, selector and property', () => {
      only(file(entry({name: 'a', chart: [rule()]}), entry({name: 'b', chart: [rule()]})), 'duplicate-chart-rule');
    });
    it('accepts the same selector with different properties', () => {
      expect(codes(file(entry({name: 'a', chart: [rule()]}), entry({name: 'b', chart: [rule({property: 'fill'})]})))).to.deep.equal([]);
    });
  });

  describe('legacy names', () => {
    it('refuses a malformed legacy name', () => only(file(entry({name: 'a', legacyName: 'color-profit'})), 'bad-legacy-name'));
    it('refuses a --vs- legacy name', () => only(file(entry({name: 'a', legacyName: '--vs-a'})), 'bad-legacy-name'));
    it('refuses forbidden text', () => only(file(entry({name: 'a', legacyName: '--a;b'})), 'forbidden-text'));
    it('refuses one legacy name taken over twice', () => {
      only(file(entry({name: 'a', legacyName: '--color-x'}), entry({name: 'b', legacyName: '--color-x'})), 'duplicate-legacy-name');
    });
  });

  describe('tailwind', () => {
    it('refuses a non-boolean', () => only(file(entry({name: 'a', tailwind: 'yes' as never})), 'wrong-type'));
    it('refuses tailwind on a number', () => {
      only(file(entry({name: 'n', kind: 'number', value: 1, unit: 'px', tailwind: true})), 'tailwind-not-allowed');
    });
    it('refuses two entries landing on one Tailwind name', () => {
      // 'x.y' maps to --color-x-y; the other entry claims --color-x-y as its legacy name
      only(file(entry({name: 'x.y', tailwind: true}), entry({name: 'z', legacyName: '--color-x-y', tailwind: true})),
        'duplicate-tailwind-name');
    });
    it('accepts tailwind: false on a number', () => {
      expect(codes(file(entry({name: 'n', kind: 'number', value: 1, unit: 'px', tailwind: false})))).to.deep.equal([]);
    });
  });

  describe('parse and assert', () => {
    it('parses valid text', () => {
      const r = parseVisualStyles(JSON.stringify(sample()));
      expect(r.errors).to.deep.equal([]);
      expect(r.file).to.deep.equal(sample());
    });
    it('refuses text that is not JSON', () => {
      const r = parseVisualStyles('{nope');
      expect(r.file).to.equal(undefined);
      expect(r.errors.map(e => e.code)).to.deep.equal(['not-json']);
    });
    it('withholds the file when invalid', () => {
      const r = parseVisualStyles(JSON.stringify(file(entry({name: 'a', value: 'red'}))));
      expect(r.file).to.equal(undefined);
      expect(r.errors.map(e => e.code)).to.deep.equal(['bad-colour']);
    });
    it('assert throws with every error attached', () => {
      try {
        assertValidVisualStyles(file(entry({name: 'a', value: 'red'}), entry({name: 'a'})));
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).to.be.instanceOf(VisualStylesInvalidError);
        expect((err as VisualStylesInvalidError).errors.map(e => e.code)).to.deep.equal(['bad-colour', 'duplicate-name']);
      }
    });
    it('never modifies its input', () => {
      const input = file(entry({name: 'a', value: ' #fff '}));
      const copy = JSON.parse(JSON.stringify(input));
      validateVisualStyles(input);
      expect(input).to.deep.equal(copy);
    });
  });
});
