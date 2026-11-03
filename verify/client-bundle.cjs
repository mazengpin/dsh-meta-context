/**
 * Functional test of the BUILT browser bundle, without a browser.
 *
 * Loads `lib/client.js` exactly as the page would: defines the module loader,
 * calls the factory with a stub `require` standing in for the frozen module
 * table, then drives `apply` against a recording fake Client context.
 *
 * THE HEADLINE ASSERTIONS, and each is an acceptance condition rather than a
 * style preference:
 *
 *  1. The seats injected are EXACTLY `main` and `sidebar.panellist` — one page,
 *     one row. The owner's complaint is a left sidebar with several entries doing
 *     one family's work; a third seat here would be the fusion failing at the one
 *     thing it exists to do.
 *  2. The sidebar id and the main key are this plugin's OWN (`dsh-meta-context`),
 *     never `dsh-context`'s. A duplicate id in a keyed slot throws at load or
 *     silently replaces the member's row, and either way the owner loses a
 *     surface he had.
 *  3. NO `conversation.view` entry is injected and NO registration carries
 *     `priority: 'builtin'`. An extension-band contributor that takes a builtin
 *     kind can hide the workbench; this plugin has no business owning a
 *     conversation band.
 *
 * Usage: node verify/client-bundle.cjs lib/client.js
 */
const path = require('node:path')
const assert = require('node:assert/strict')

const BUNDLE = process.argv[2]
if (!BUNDLE) throw new Error('usage: node verify/client-bundle.cjs <lib/client.js>')

// ---- the frozen module table the factory's `require` resolves against ------
const REACT_KEYS = [
  'createElement', 'useState', 'useEffect', 'useCallback', 'useMemo', 'useRef',
  'useLayoutEffect', 'useReducer', 'useContext', 'useId', 'forwardRef', 'memo',
  'Fragment', 'StrictMode', 'Children', 'cloneElement', 'isValidElement', 'createContext',
]
const reactStub = {}
for (const key of REACT_KEYS) reactStub[key] = () => undefined
reactStub.Fragment = Symbol('Fragment')

const TABLE = {
  react: reactStub,
  'react/jsx-runtime': { jsx: () => undefined, jsxs: () => undefined, Fragment: reactStub.Fragment },
}

const asked = []
function fakeRequire(id) {
  asked.push(id)
  if (!(id in TABLE)) throw new Error(`module table cannot answer ${JSON.stringify(id)}`)
  return TABLE[id]
}

// ---- the loader contract the bundle registers itself through ---------------
let loaded = null
global.window = {
  __ModuleLoader__: {
    load({ id, factory }) {
      loaded = { id, factory }
    },
  },
}

require(path.resolve(BUNDLE))

assert.ok(loaded, 'bundle did not call window.__ModuleLoader__.load')
assert.equal(loaded.id, 'dsh-meta-context', `wrong bundle id: ${loaded.id}`)

const mod = loaded.factory(fakeRequire)
assert.equal(mod.name, 'dsh-meta-context', 'wrong plugin name export')
assert.ok(Array.isArray(mod.inject), 'inject is not an array')
assert.deepEqual(mod.inject, ['slots', 'locale'], `unexpected inject: ${JSON.stringify(mod.inject)}`)
assert.equal(typeof mod.apply, 'function', 'apply is not a function')

// ---- drive apply against a recording fake context --------------------------
const registrations = []
const injections = []
const localeRegistrations = []
const effects = []

const ctx = {
  effect(cb, label) { effects.push(label); const off = cb(); return () => { if (off) off() } },
  locale: {
    register(ns, lang, dict) { localeRegistrations.push({ ns, lang, dict }); return () => {} },
    bind(ns) { return (key) => `${ns}:${key}` },
  },
  slots: {
    inject(kind, cb) { injections.push(kind); cb(); return () => {} },
    register(opts, Component) { registrations.push({ opts, Component }); return () => {} },
  },
  logger: { info() {}, warn() {} },
}

mod.apply(ctx)

// ---- 1. THE ONE-ENTRY CONTROL ---------------------------------------------
assert.deepEqual([...injections].sort(), ['main', 'sidebar.panellist'],
  `this plugin must inject EXACTLY main and sidebar.panellist; it injected ${JSON.stringify(injections)}`)
for (const forbidden of ['conversation.view', 'conversation.composer.dock', 'conversation.input.right', 'settings.section', 'sidebar.right.pane.tab']) {
  assert.ok(!injections.includes(forbidden),
    `a member already owns ${forbidden}; a second entry there is the scatter the fusion removes`)
}

assert.equal(registrations.length, 2, `expected exactly 2 registrations (one row, one page), got ${registrations.length}`)

const sidebar = registrations.find(r => r.opts.name === 'sidebar.panellist')
const panel = registrations.find(r => r.opts.name === 'main')
assert.ok(sidebar, 'no sidebar.panellist registration')
assert.ok(panel, 'no main registration')

// ---- 2. DISTINCT IDS AND KIND ----------------------------------------------
assert.equal(sidebar.opts.id, 'dsh-meta-context', `sidebar id must be this plugin's own, got ${sidebar.opts.id}`)
assert.notEqual(sidebar.opts.id, 'dsh-context', "the sidebar id must never be dsh-context's (insightPage.ts:15)")
assert.equal(sidebar.opts.order, 12, `unexpected sidebar order: ${sidebar.opts.order}`)
assert.equal(typeof sidebar.Component, 'function', 'the sidebar row component is not a function')

assert.equal(panel.opts.key, 'dsh-meta-context', `main key must be this plugin's own, got ${panel.opts.key}`)
assert.notEqual(panel.opts.key, 'dsh-context', "the main key must never be dsh-context's (insightPage.ts:15)")
assert.equal(typeof panel.Component, 'function', 'the page component is not a function')

// ---- 3. NO BUILTIN-KIND TAKEOVER ------------------------------------------
for (const { opts } of registrations) {
  assert.equal(opts.priority, undefined,
    `registration ${opts.name} carries priority=${JSON.stringify(opts.priority)}; an extension-band entry must never take a builtin kind`)
  assert.notEqual(opts.priority, 'builtin', `registration ${opts.name} takes priority 'builtin', which can hide the workbench`)
}

// the nav label is a thunk, so the shell can re-read it on a locale change
assert.equal(typeof sidebar.opts.label, 'function', 'sidebar.panellist requires a label thunk')
const label = sidebar.opts.label()
assert.equal(typeof label, 'string', `label() returned ${typeof label}`)
assert.ok(label.length > 0, 'the label must not be empty')

// dictionaries for both languages, under one namespace
const langs = localeRegistrations.map(r => r.lang).sort()
assert.deepEqual(langs, ['en', 'zh'], `registered locales: ${JSON.stringify(langs)}`)
const namespaces = new Set(localeRegistrations.map(r => r.ns))
assert.equal(namespaces.size, 1, `more than one locale namespace: ${JSON.stringify([...namespaces])}`)
assert.equal([...namespaces][0], 'meta-context', `unexpected namespace: ${[...namespaces][0]}`)

// the en and zh dictionaries must have the same key set, or the UI shows a key
const [en, zh] = localeRegistrations
assert.deepEqual(Object.keys(en.dict).sort(), Object.keys(zh.dict).sort(), 'en and zh key sets differ')

// only module-table ids were requested — nothing else could resolve in a page
const allowed = new Set(Object.keys(TABLE))
const unexpected = asked.filter(id => !allowed.has(id))
assert.deepEqual(unexpected, [], `requested non-module-table ids: ${JSON.stringify(unexpected)}`)

console.log('PASS')
console.log('  bundle id       :', loaded.id)
console.log('  inject          :', JSON.stringify(mod.inject))
console.log('  slots injected  :', JSON.stringify(injections), '  <- one-entry control')
console.log('  sidebar seat    : slot=sidebar.panellist id=' + sidebar.opts.id + ' order=' + sidebar.opts.order)
console.log('  panel seat      : slot=main key=' + panel.opts.key)
console.log('  nav label       :', JSON.stringify(label))
console.log('  locales         :', JSON.stringify(langs), 'ns =', [...namespaces][0], `(${Object.keys(en.dict).length} keys each)`)
console.log('  effects         :', effects.length)
console.log('  required ids    :', JSON.stringify([...new Set(asked)]))
