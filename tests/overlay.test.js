/* Drive overlay.js against a stub DOM: open it, close it three different
   ways, and assert the dialog actually goes away each time. */
const fs = require('fs');

function makeEl(extra = {}) {
  return {
    hidden: false,
    textContent: '',
    children: [],
    style: {},
    dataset: {},
    clientWidth: 840,
    clientHeight: 600,
    offsetParent: {},
    _classes: new Set(),
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    replaceChildren(...n) { this.children = n; },
    querySelectorAll() { return []; },
    focus() { this.focused = true; },
    ...extra,
  };
}

const panel = makeEl();
const border = makeEl();
const content = makeEl();
const closeBtn = makeEl();
const overlay = makeEl({
  querySelector(sel) {
    return { '.overlay__panel': panel, '.overlay__border': border,
             '.overlay__content': content, '.overlay__close': closeBtn }[sel];
  },
});
panel.querySelectorAll = () => [closeBtn];

const template = { content: { cloneNode: () => ({ tag: 'cv-content' }) } };
const listeners = {};

global.window = {
  matchMedia: () => ({ matches: false }),
  addEventListener() {}, removeEventListener() {},
};
// The overlay announces what it put on screen so other modules can attach
// to cloned content without it knowing they exist. Record those here.
const events = [];
global.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = (init || {}).detail; } };

global.document = {
  dispatchEvent(e) { events.push(e); return true; },
  body: { classList: { _s: new Set(),
    add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
    contains(c) { return this._s.has(c); } } },
  activeElement: null,
  getElementById: (id) => (id === 'overlay' ? overlay
                        : id === 'tpl-cv' ? template : null),
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  removeEventListener: (t, fn) => {
    listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
  },
};
global.requestAnimationFrame = (fn) => fn();
global.setInterval = () => 1;
global.clearInterval = () => {};

eval(fs.readFileSync(require('path').join(__dirname, '..', 'scripts/overlay.js'), 'utf8'));

const fire = (type, ev) => (listeners[type] || []).slice().forEach((fn) => fn(ev));
const trigger = { dataset: { overlay: 'cv' }, focus() {},
                  closest: (s) => (s === '[data-overlay]' ? trigger : null) };
const closeTarget = { closest: (s) => (s === '[data-overlay-close]' ? closeBtn : null) };

let pass = true;
function check(label, cond) {
  if (!cond) pass = false;
  console.log(`  ${label.padEnd(44)} ${cond ? 'OK' : 'FAIL'}`);
}

console.log('open by click:');
fire('click', { target: trigger });
check('overlay.hidden === false', overlay.hidden === false);
check('content populated from template', content.children.length === 1);
check('body scroll locked', document.body.classList.contains('is-locked'));
check('border drawn', border.textContent.length > 0);
check('keydown handler registered', (listeners.keydown || []).length === 1);
check('overlay:open announced with its key and content',
      events.some((e) => e.type === 'overlay:open' && e.detail.key === 'cv'
                      && e.detail.content === content));

console.log('close with Escape:');
fire('keydown', { key: 'Escape' });
check('overlay.hidden === true', overlay.hidden === true);
check('body unlocked', !document.body.classList.contains('is-locked'));
check('content emptied', content.children.length === 0);
check('keydown handler removed', (listeners.keydown || []).length === 0);
check('overlay:close announced', events.some((e) => e.type === 'overlay:close'));

console.log('reopen, then close by clicking the close control:');
fire('click', { target: trigger });
check('reopened', overlay.hidden === false);
fire('click', { target: closeTarget });
check('closed again', overlay.hidden === true);

console.log('closing an already-closed overlay is a no-op:');
fire('click', { target: closeTarget });
check('still closed, no throw', overlay.hidden === true);

console.log('\n' + (pass ? 'all overlay checks passed' : 'OVERLAY FAILURE'));
process.exit(pass ? 0 : 1);
