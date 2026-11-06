import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';

const css = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
const sheet = postcss.parse(css);
function rootValues(theme) {
  const values = {};
  sheet.walkRules(rule => {
    if (!rule.selectors.includes(':root') && !rule.selectors.includes(`:root[data-theme="${theme}"]`)) return;
    rule.walkDecls(decl => { values[decl.prop] = decl.value; });
  });
  return values;
}
function resolve(value, values) {
  return value.replace(/var\((--[a-z-]+)\)/g, (_, name) => {
    assert.ok(values[name], `Missing theme variable ${name}`);
    return resolve(values[name], values);
  });
}
function style(theme, selector, property) {
  let value;
  sheet.walkRules(rule => {
    if (!rule.selectors.includes(selector) && !rule.selectors.includes(`:root[data-theme="${theme}"] ${selector}`)) return;
    rule.walkDecls(property, decl => { value = decl.value; });
  });
  assert.notEqual(value, undefined, `${theme} ${selector} ${property} is defined`);
  return resolve(value, rootValues(theme));
}
function color(hex) {
  assert.match(hex, /^#[\da-f]{6}(?:[\da-f]{2})?$/i);
  return [0, 2, 4].map(index => parseInt(hex.slice(index + 1, index + 3), 16));
}
function luminance(hex) {
  const channels = color(hex).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels.reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}
function contrast(foreground, background) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}
function composite(foreground, background) {
  if (foreground.length === 7) return foreground;
  const alpha = parseInt(foreground.slice(7), 16) / 255;
  const under = color(background);
  return '#' + color(foreground).map((value, index) => Math.round(value * alpha + under[index] * (1 - alpha)).toString(16).padStart(2, '0')).join('');
}
function minimum(foreground, background, threshold, description) {
  assert.ok(contrast(foreground, background) >= threshold, `${description}: ${contrast(foreground, background).toFixed(3)} < ${threshold}`);
}

test('classic keeps the established palette and component colors', () => {
  const classic = rootValues('classic');
  assert.deepEqual(Object.fromEntries(['--canvas', '--surface', '--ink', '--muted', '--accent'].map(name => [name, classic[name]])), {
    '--canvas': '#0c1018', '--surface': '#131a26', '--ink': '#e4eaf3', '--muted': '#8a9bb3', '--accent': '#68d9fa'
  });
  assert.equal(style('classic', '.message-body', 'color'), '#c1cee0');
  assert.equal(style('classic', '.composer-box', 'background'), '#172233');
  assert.equal(style('classic', 'input::placeholder', 'color'), '#6e809c');
  assert.equal(style('classic', '.choice.selected', 'background'), '#49351e');
  assert.doesNotMatch(css, /\[data-theme="classic"\]/);
});

test('contrastful fixes measured weak small text without weakening the main conversation', () => {
  const theme = 'contrastful'; const palette = rootValues(theme);
  minimum(style(theme, '.message-body', 'color'), palette['--surface'], 7, 'main chat');
  minimum(style(theme, 'textarea::placeholder', 'color'), style(theme, '.composer-box', 'background'), 4.5, 'composer placeholder');
  minimum(style(theme, '.composer-foot', 'color'), style(theme, '.composer', 'background'), 4.5, 'composer footer');
  minimum(style(theme, '.activity-message small', 'color'), palette['--surface'], 4.5, 'activity metadata');
  minimum(style(theme, '.choice.selected span', 'color'), style(theme, '.choice.selected', 'background'), 4.5, 'selected choice description');
  minimum(style(theme, '.tab-close', 'color'), '#234252', 3, 'close glyph across selected-tab gradient');
});

test('contrastful and light give field boundaries and draggable handles sufficient contrast', () => {
  for (const theme of ['contrastful', 'light']) {
    const palette = rootValues(theme);
    minimum(style(theme, '.worker-model-controls select', 'border-color'), palette['--surface'], 3, `${theme} dropdown outline`);
    minimum(style(theme, '.composer-box', 'border-color'), style(theme, '.composer', 'background'), 3, `${theme} composer outline`);
    minimum(style(theme, '.overview-section-divider::after', 'background'), palette['--surface'], 3, `${theme} section divider`);
    minimum(style(theme, '.sidebar-divider::after', 'background'), palette['--surface'], 3, `${theme} sidebar divider`);
    minimum(palette['--accent'], palette['--surface'], 3, `${theme} focus outline`);
  }
});

test('light text and important states meet normal-size text contrast on their actual surfaces', () => {
  const theme = 'light'; const palette = rootValues(theme);
  const pairs = [
    ['chat', style(theme, '.message-body', 'color'), palette['--surface']],
    ['placeholder', style(theme, 'textarea::placeholder', 'color'), style(theme, '.composer-box', 'background')],
    ['footer', style(theme, '.composer-foot', 'color'), style(theme, '.composer', 'background')],
    ['primary action', style(theme, '.button.primary', 'color'), style(theme, '.button.primary', 'background')],
    ['interrupt', style(theme, '.button.interrupt', 'color'), style(theme, '.button.interrupt', 'background')],
    ['amber action', style(theme, '.button.amber', 'color'), style(theme, '.button.amber', 'background')],
    ['question', style(theme, '.question-card', 'color'), style(theme, '.question-card', 'background')],
    ['choice description', style(theme, '.choice span', 'color'), style(theme, '.choice', 'background')],
    ['selected choice description', style(theme, '.choice.selected span', 'color'), style(theme, '.choice.selected', 'background')],
    ['code', style(theme, 'pre', 'color'), style(theme, 'pre', 'background')],
    ['copy action', style(theme, '.message-copy', 'color'), style(theme, '.markdown-code-actions', 'background')],
    ['running', style(theme, '.status.running', 'color'), palette['--surface']],
    ['attention', style(theme, '.status.attention', 'color'), palette['--surface']],
    ['report options', style(theme, '.report-options label', 'color'), palette['--surface']],
    ['report cadence', style(theme, '.coordinator-worker .coordinator-report-cadence', 'color'), palette['--surface']],
    ['error', style(theme, '.status.error', 'color'), palette['--surface']],
    ['error banner', style(theme, '.error-banner', 'color'), style(theme, '.error-banner', 'background')],
    ['connection notice', style(theme, '.connection-banner', 'color'), style(theme, '.connection-banner', 'background')]
  ];
  for (const [name, foreground, background] of pairs) minimum(foreground, background, 4.5, name);
});

test('light covers selected tabs, dialogs, code/table surfaces and the transparent white logo', () => {
  assert.equal(rootValues('light')['color-scheme'], 'light');
  assert.equal(rootValues('contrastful')['color-scheme'], 'dark');
  minimum(style('light', '.tab-wrap.active .tab-text strong', 'color'), '#d4eef7', 4.5, 'selected tab text');
  assert.equal(style('light', '.agent-dialog', 'background'), '#ffffff');
  assert.equal(style('light', '.markdown th', 'background'), '#edf3f8');
  assert.equal(style('light', '.brandmark', 'filter'), 'brightness(0)');
  assert.doesNotMatch(css, /(?:html|body|app-shell)[^{]*\{[^}]*filter:\s*invert/s);
});

test('theme menu stays compact, layered and clearly selected without expanding the header', () => {
  assert.equal(style('classic', '.topbar', 'position'), 'relative');
  assert.equal(style('classic', '.topbar', 'z-index'), '5');
  assert.equal(style('classic', '.icon-button.theme-toggle', 'width'), '32px');
  assert.equal(style('classic', '.theme-menu', 'position'), 'absolute');
  assert.equal(style('classic', '.theme-menu', 'width'), '190px');
  assert.equal(style('classic', '.theme-menu', 'max-width'), 'calc(100vw - 24px)');
  assert.equal(style('classic', '.theme-menu', 'z-index'), '30');
  for (const theme of ['classic', 'contrastful', 'light']) {
    const palette = rootValues(theme);
    minimum(palette['--ink'], palette['--surface-raised'], 4.5, `${theme} theme choices`);
    const selected = '.theme-option[aria-checked="true"]';
    minimum(style(theme, selected, 'color'), composite(style(theme, selected, 'background'), palette['--surface-raised']), 4.5, `${theme} selected theme choice`);
  }
});

test('every fixed dark-theme text color has an explicit light counterpart', () => {
  const lightSelectors = new Set();
  sheet.walkRules(rule => {
    if (!rule.nodes.some(node => node.type === 'decl' && node.prop === 'color')) return;
    for (const selector of rule.selectors) {
      if (selector === ':root[data-theme="light"]') lightSelectors.add(':root');
      if (selector.startsWith(':root[data-theme="light"] ')) lightSelectors.add(selector.slice(':root[data-theme="light"] '.length));
    }
  });
  const classic = postcss.parse(css.split('/* Keep the original rules above')[0]);
  classic.walkRules(rule => {
    if (!rule.nodes.some(node => node.type === 'decl' && node.prop === 'color' && /^#/.test(node.value))) return;
    for (const selector of rule.selectors) assert.ok(lightSelectors.has(selector), `${selector} retains its dark-theme text color`);
  });
});
