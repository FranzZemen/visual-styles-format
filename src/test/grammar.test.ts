/*
Created by Franz Zemen 2026-10-03
License Type: UNLICENSED

The strict value grammar (visual-styles.prd.md D22): every accepted form, and refusals for each way a
string could carry something other than a colour, number, name or class selector.
*/

import 'mocha';
import {expect} from 'chai';
import {
  cssVarName, formatNumber, formatNumberValue, formatRgba, forbiddenFragment, isAllowedProperty,
  isValidColour, isValidLegacyName, isValidName, isValidScope, isValidSelector, parseColour,
  tailwindThemeName
} from '#project';

describe('grammar', () => {
  describe('colours accepted', () => {
    for (const c of [
      '#fff', '#FFF', '#ffff', '#1b5e20', '#1B5E20', '#1b5e2080',
      'rgb(1, 2, 3)', 'rgb(1,2,3)', 'rgba(1, 2, 3, 0.5)', 'rgba(255, 255, 255, 1)', 'rgb(100%, 0%, 50%)',
      'rgb(1 2 3)', 'rgb(1 2 3 / 50%)', 'rgba(1 2 3 / 0.25)', 'rgba(1, 2, 3, 40%)', 'rgb(.5, 1.5, 2)',
      'hsl(120, 50%, 50%)', 'hsla(120, 50%, 50%, 0.3)', 'hsl(120deg 50% 50%)', 'hsl(-30 50% 50% / 10%)'
    ]) {
      it(`accepts ${c}`, () => expect(isValidColour(c), c).to.be.true);
    }
  });

  describe('colours refused', () => {
    for (const c of [
      '', 'red', 'transparent', 'currentColor', 'var(--x)', '#ff', '#fffff', '#ggg', '#1b5e2', 'fff',
      'rgb(1, 2)', 'rgb(1, 2, 3, 4, 5)', 'rgb(256, 0, 0)', 'rgb(-1, 0, 0)', 'rgba(1, 2, 3, 1.5)',
      'rgba(1, 2, 3, 101%)', 'rgb(101%, 0%, 0%)', 'rgb(1, 2, 3 / 0.5)', 'rgb(1 2 3 /)', 'rgb(1 2 3 / 4 / 5)',
      'rgb(a, b, c)', 'rgb(1e2, 0, 0)', 'RGB(1, 2, 3)', 'rgb (1, 2, 3)', 'rgb(1, 2, 3) ',
      'hsl(120, 50, 50)', 'hsl(120turn, 50%, 50%)', 'hsl(120, 150%, 50%)', 'hwb(120 0% 0%)',
      'color-mix(in srgb, #fff 50%, transparent)', 'oklch(0.5 0.1 120)',
      '#fff;', '#fff }', 'rgb(1, 2, 3); x: url(y)', 'url(http://e.x/a.png)', '#fff/* c */', "'#fff'",
      '"#fff"', '\\23 fff', 'rgb(1, 2, 3)\n', 'rgb(calc(1), 2, 3)', 'rgb(1, 2, 3)!important'
    ]) {
      it(`refuses ${JSON.stringify(c)}`, () => expect(isValidColour(c), c).to.be.false);
    }
  });

  describe('parseColour', () => {
    it('expands short hex and reads alpha', () => {
      expect(parseColour('#f008')).to.deep.equal({r: 255, g: 0, b: 0, a: 0x88 / 255});
    });
    it('reads rgb percentages', () => {
      expect(parseColour('rgb(100%, 0%, 50%)')).to.deep.equal({r: 255, g: 0, b: 127.5, a: 1});
    });
    it('converts hsl', () => {
      const c = parseColour('hsl(120, 100%, 25%)')!;
      expect([Math.round(c.r), Math.round(c.g), Math.round(c.b), c.a]).to.deep.equal([0, 128, 0, 1]);
    });
    it('formats rgba for display', () => {
      expect(formatRgba({r: 27.4, g: 94, b: 32, a: 0.4})).to.equal('rgba(27, 94, 32, 0.4)');
    });
  });

  describe('forbidden text', () => {
    for (const s of ['url(', 'a;b', '{', '}', '\\', '/*', '*/', '"', "'", '`', '<', '>', 'a\nb', 'a\u0000b', 'URL(']) {
      it(`finds ${JSON.stringify(s)}`, () => expect(forbiddenFragment(s)).to.not.equal(undefined));
    }
    it('passes ordinary text', () => expect(forbiddenFragment('rgb(1 2 3 / 50%)')).to.equal(undefined));
  });

  describe('numbers', () => {
    it('formats plain numbers', () => {
      expect(formatNumber(12)).to.equal('12');
      expect(formatNumber(-0.5)).to.equal('-0.5');
      expect(formatNumber(-0)).to.equal('0');
    });
    it('refuses non-finite and exponent forms', () => {
      for (const n of [NaN, Infinity, -Infinity, 1e21, 1e-7]) expect(formatNumber(n), String(n)).to.equal(undefined);
    });
    it('adds the unit, or none', () => {
      expect(formatNumberValue(12, 'px')).to.equal('12px');
      expect(formatNumberValue(1.25, 'rem')).to.equal('1.25rem');
      expect(formatNumberValue(50, '%')).to.equal('50%');
      expect(formatNumberValue(0.4, 'none')).to.equal('0.4');
    });
  });

  describe('names', () => {
    for (const n of ['profit', 'profit.text', 'series-1', 'chart.axis-label.size', 'a1.b2-c3']) {
      it(`accepts name ${n}`, () => expect(isValidName(n)).to.be.true);
    }
    for (const n of ['', 'Profit', '1profit', '.profit', 'profit.', 'profit..text', 'profit--text', 'profit_text',
      'profit text', '-profit', 'pro;fit', 'pröfit']) {
      it(`refuses name ${JSON.stringify(n)}`, () => expect(isValidName(n)).to.be.false);
    }
    it('maps names to --vs- variables', () => {
      expect(cssVarName('profit.text')).to.equal('--vs-profit-text');
      expect(cssVarName('chart.axis-label.size')).to.equal('--vs-chart-axis-label-size');
    });
    it('maps Tailwind theme names', () => {
      expect(tailwindThemeName('profit.text', '--color-profit')).to.equal('--color-profit');
      expect(tailwindThemeName('bs-brand.surface', '--bs-brand-surface')).to.equal('--color-bs-brand-surface');
      expect(tailwindThemeName('profit.text')).to.equal('--color-profit-text');
    });
    it('accepts legacy names and refuses --vs- and malformed ones', () => {
      expect(isValidLegacyName('--color-profit')).to.be.true;
      expect(isValidLegacyName('--bs-brand-surface')).to.be.true;
      for (const n of ['--vs-profit', 'color-profit', '--Color', '--color-', '--color--x', '--color profit', '--c;x']) {
        expect(isValidLegacyName(n), n).to.be.false;
      }
    });
  });

  describe('chart selectors', () => {
    it('accepts one class as a scope', () => {
      expect(isValidScope('.bs-chart-since')).to.be.true;
    });
    for (const s of ['bs-chart-since', '.a .b', '.a.b', '#id', 'div', '.a,.b', '[x]', '.a:hover', '']) {
      it(`refuses scope ${JSON.stringify(s)}`, () => expect(isValidScope(s)).to.be.false);
    }
    for (const s of ['.highcharts-graph', '.bs-s-ema9 .highcharts-graph', '.highcharts-point.highcharts-point-up',
      '.a .b.c .d', '.highcharts-candlestick-series .highcharts-point-up']) {
      it(`accepts selector ${s}`, () => expect(isValidSelector(s)).to.be.true);
    }
    for (const s of ['', 'path', '.a > .b', '.a + .b', '.a ~ .b', '.a  .b', ' .a', '.a ', '.a,.b', '.a[fill]',
      '[class~=x]', '.a:hover', '.a::before', '#x', '.a{', '.a;', '*', '.a *', '.a\t.b', '.1a']) {
      it(`refuses selector ${JSON.stringify(s)}`, () => expect(isValidSelector(s)).to.be.false);
    }
    it('allows properties by kind', () => {
      expect(isAllowedProperty('colour', 'stroke')).to.be.true;
      expect(isAllowedProperty('colour', 'stroke-width')).to.be.false;
      expect(isAllowedProperty('number', 'stroke-width')).to.be.true;
      expect(isAllowedProperty('number', 'fill')).to.be.false;
      expect(isAllowedProperty('colour', 'background')).to.be.false;
      expect(isAllowedProperty('colour', 'background-image')).to.be.false;
    });
  });
});
