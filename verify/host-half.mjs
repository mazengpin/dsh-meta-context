/**
 * The fused surface's own acceptance harness, against the BUILT Host artifact.
 *
 * WHAT IT ACTUALLY DRIVES
 *
 * It does not assert on the source. It imports `lib/index.js`, mounts its prefix
 * handler on a REAL loopback HTTP server, stands up fake member routes on that
 * same server, and then calls the fused routes over TCP. That matters because the
 * composer addresses members by the ORIGINATING REQUEST's authority
 * (`compose.ts`), so a test that called the handler directly would never exercise
 * the authority resolution, the loopback hop, or the timeout and status handling
 * that are the whole of the mechanism.
 *
 * It also loads `src/shared/protocol.ts` off disk to check every capability
 * CITATION: the member file must exist under `plugins-src/<member>/` and the cited
 * line must be inside it. A registry of plausible-looking `file:line` strings that
 * nothing verifies is the caption this program has published before.
 *
 * EXIT CODES, stated because the acceptance depends on them
 *
 *   0  PASS      every check ran and agreed
 *   1  FAIL      at least one check disagreed, or a check could not run
 *   2  BLINDED   the harness could not see its subject (no artifact, no server,
 *                or a zero denominator) — never reported as a pass
 *
 * Usage: node verify/host-half.mjs [lib/index.js]
 */
import { createServer } from 'node:http'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')
const BUNDLE = resolve(ROOT, process.argv[2] ?? 'lib/index.js')
const PLUGINS_SRC = resolve(ROOT, '..')

// ---------------------------------------------------------------------------
// A check recorder. `failures` drives the exit code; `run` and `skipped` are
// printed beside it so a reader can see what ran and what did not.
// ---------------------------------------------------------------------------
const results = []
let run = 0
let skipped = 0

/**
 * Run one check.
 * @param {string} name - the check's name, printed on failure.
 * @param {() => void | Promise<void>} body - throws on disagreement.
 */
async function check(name, body) {
  run += 1
  try {
    await body()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, message: error instanceof Error ? error.message : String(error) })
  }
}

/** Fail with a message. */
function must(condition, message) {
  if (!condition) throw new Error(message)
}

/** Fail unless two values are deeply equal (JSON comparison, adequate here). */
function mustEqual(actual, expected, message) {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) throw new Error(`${message} — got ${a}, want ${b}`)
}

/** Fail when the process is about to report a pass it has not earned. */
function blind(reason) {
  console.error(`BLINDED — ${reason}`)
  console.error('A zero denominator is a failure of the instrument, not a pass.')
  process.exit(2)
}

if (!existsSync(BUNDLE)) blind(`the built artifact is not on disk at ${BUNDLE}; run pnpm run build first`)

const mod = await import(pathToFileURL(BUNDLE).href)

// ---------------------------------------------------------------------------
// The fake member server. Each route is the smallest honest stand-in for the
// member's real payload: it exists to prove the composer relays what the member
// said, not to re-implement the member.
// ---------------------------------------------------------------------------
const state = {
  /** Set to a status code to make that member route answer with a failure. */
  failMember: 0,
  /** What the member's setter last received, so the forward-verbatim check has a witness. */
  lastSetBody: null,
}

const MEMBER_ROUTES = new Map()
function memberRoute(pathname, handler) {
  MEMBER_ROUTES.set(pathname, handler)
}

memberRoute('/context-out/api/state', (req, res, url) => {
  if (state.failMember !== 0) return sendJson(res, state.failMember, { ok: false, error: 'member is unhealthy' })
  const sessionId = url.searchParams.get('sessionId')
  sendJson(res, 200, {
    ok: true,
    modes: ['standard', 'auto', '128k', '64k', '32k', '16k', '8k'],
    policy: { global: 'auto', subagent: 'standard', run: {} },
    runKeys: sessionId === null ? [] : [sessionId],
    ...sessionId === null ? {} : { reading: { totalTokens: 42_000, folds: 3 } },
  })
})

memberRoute('/context-out/api/set', (req, res) => {
  readBody(req).then(text => {
    state.lastSetBody = text
    sendJson(res, 200, { ok: true, policy: { global: '16k', subagent: 'standard', run: {} } })
  })
})

memberRoute('/context-stats/api/formation', (_req, res) => {
  if (state.failMember !== 0) return sendJson(res, state.failMember, { ok: false, error: 'member is unhealthy' })
  sendJson(res, 200, { ok: true, artifacts: [{ path: 'runner/x.mjs', newerThanBoot: false }], censusAt: new Date().toISOString() })
})

memberRoute('/context-stats/api/status', (_req, res) => {
  if (state.failMember !== 0) return sendJson(res, state.failMember, { ok: false, error: 'member is unhealthy' })
  sendJson(res, 200, { folds: { sessionsScanned: 2, pricedTokens: 1_000, unknownRows: 0 }, memory: { state: 'ok' } })
})

memberRoute('/context-stats/api/folds', (_req, res) => {
  if (state.failMember !== 0) return sendJson(res, state.failMember, { ok: false, error: 'member is unhealthy' })
  sendJson(res, 200, { sessionsScanned: 2, sessionsAvailable: 2, truncated: false, rows: [] })
})

// s1cap owns no `api` segment: its single route is the fixed literal
// `/s1cap-7340`. The payload below is the shape the real member serves,
// measured live on 2026-10-26 — the context-assembly knobs are in the same units
// the out-controller caps, which is the census's C3 claim.
memberRoute('/s1cap-7340', (_req, res) => {
  if (state.failMember !== 0) return sendJson(res, state.failMember, { ok: false, error: 'member is unhealthy' })
  sendJson(res, 200, {
    ok: true,
    stored: { relevanceThreshold: 0.55 },
    effective: { depth: 16, chunkTokens: 512, overlapTokens: 64, shortContextTokens: 32_768, window: 16, provider: 'kev' },
    restartRequired: false,
    status: { cell: 'C2', tier1: 's1', deliver: false },
  })
})

/** Write one JSON response from a fake member. */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(payload) })
  res.end(payload)
}

/** Read a whole request body as text. */
async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

// ---------------------------------------------------------------------------
// The gate the fused admission route drives. Two gates, because the route must
// be shown to relay BOTH a refusal and an allowance.
// ---------------------------------------------------------------------------
const allowGate = {
  async admit(request) {
    const removal = request.pricedTokens === 0 ? 0 : 1 - request.retainTokens / request.pricedTokens
    return removal >= 0.8
      ? { kind: 'allow', reason: `removal ${removal.toFixed(2)} clears the 0.80 floor` }
      : { kind: 'refuse', reason: `removal ${removal.toFixed(2)} is under the 0.80 floor` }
  },
}

// ---------------------------------------------------------------------------
// Mount the plugin's handler on the same server as the fake members, so the
// composer's loopback hop lands back here — exactly as it does in a live boot.
// ---------------------------------------------------------------------------
let gate = allowGate
const ctx = {
  webServer: { register: () => () => {} },
  logger: { info() {}, warn() {} },
  get: name => (name === 'foldAdmissionGate' ? gate : undefined),
  effect: () => () => {},
}

must(typeof mod.apply === 'function', 'the built artifact exports no apply()')

const handler = mod.createRouteHandler({
  log: () => {},
  admission: () => gate,
  now: () => new Date('2026-10-26T00:00:00.000Z'),
})
must(typeof handler === 'function', 'createRouteHandler did not return a function')

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://dsh.invalid')
  if (url.pathname === mod.ROUTE_PATH || url.pathname.startsWith(`${mod.ROUTE_PATH}/`)) {
    handler(req, res)
    return
  }
  const member = MEMBER_ROUTES.get(url.pathname)
  if (member !== undefined) {
    member(req, res, url)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('no member route here')
})

await new Promise((ok, no) => server.listen(0, '127.0.0.1', error => (error ? no(error) : ok())))
const port = server.address().port
if (typeof port !== 'number' || port === 0) blind('the harness server did not bind a port')
const ORIGIN = `http://127.0.0.1:${port}`

/** One request against the mounted server. */
async function call(path, init) {
  const response = await fetch(`${ORIGIN}${path}`, init)
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: response.status, text, json }
}

// ---------------------------------------------------------------------------
// A SECOND server that hands the plugin handler EVERY pathname, including ones
// the plugin does not own. The main server dispatches by prefix the way a live
// boot does, so it can never show the plugin a foreign path; the plugin's own
// prefix guard exists for exactly that case (a handler must not depend on its
// router for its own correctness), so it needs a mount that can reach it.
// ---------------------------------------------------------------------------
const foreignServer = createServer((req, res) => {
  handler(req, res)
})
await new Promise((ok, no) => foreignServer.listen(0, '127.0.0.1', error => (error ? no(error) : ok())))
const foreignPort = foreignServer.address().port
const FOREIGN_ORIGIN = `http://127.0.0.1:${foreignPort}`

/** One request against the foreign-path mount. */
async function callForeign(path) {
  const response = await fetch(`${FOREIGN_ORIGIN}${path}`)
  const text = await response.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: response.status, text, json }
}

// ===========================================================================
// A. MODULE CONTRACT
// ===========================================================================
await check('A1 the row name is dsh-meta-context', () => {
  mustEqual(mod.name, 'dsh-meta-context', 'wrong name export')
})

await check('A2 inject is exactly [webServer]', () => {
  mustEqual(mod.inject, ['webServer'], 'the admission service must be OPTIONAL (read via ctx.get), so inject names webServer only')
})

await check('A3 ROUTE_PREFIX is meta-context/api', () => {
  mustEqual(mod.ROUTE_PREFIX, 'meta-context/api', 'wrong prefix')
})

await check('A4 ROUTE_PATH carries the leading slash', () => {
  mustEqual(mod.ROUTE_PATH, '/meta-context/api', 'the web server prefix table matches absolute pathnames')
})

await check('A5 one sidebar seat, id and key are this plugin own', async () => {
  const index = (await call('/meta-context/api')).json
  must(index !== undefined, 'the index did not parse as JSON')
  mustEqual(index.sidebar.slot, 'sidebar.panellist', 'wrong sidebar slot')
  mustEqual(index.sidebar.id, 'dsh-meta-context', 'the sidebar id must be this plugin own')
  must(index.sidebar.id !== 'dsh-context', "the sidebar id must never be dsh-context's")
  mustEqual(index.sidebar.panel, 'dsh-meta-context', 'the panel key must be this plugin own')
  must(index.sidebar.panel !== 'dsh-context', "the panel key must never be dsh-context's")
  mustEqual(index.sidebar.order, 12, 'unexpected sidebar order')
})

// ===========================================================================
// B. REGISTRY INTEGRITY — the denominator and every citation in it
// ===========================================================================
const EXPECTED_TOTAL = 25

await check(`B1 the registry has ${EXPECTED_TOTAL} rows (explicit, not self-referential)`, () => {
  mustEqual(mod.CAPABILITIES.length, EXPECTED_TOTAL, 'the denominator moved; every published parity number must be restated with it')
})

await check('B2 every row carries a complete citation', () => {
  for (const row of mod.CAPABILITIES) {
    for (const field of ['id', 'member', 'kind', 'file', 'line', 'identity', 'status']) {
      must(row[field] !== undefined && row[field] !== '', `row ${row.id ?? '(no id)'} is missing ${field}`)
    }
    must(Number.isInteger(row.line) && row.line > 0, `row ${row.id} has a non-integer line ${row.line}`)
  }
})

await check('B3 every cited member is declared in MEMBERS', () => {
  const declared = new Set(mod.MEMBERS.map(member => member.name))
  for (const row of mod.CAPABILITIES) must(declared.has(row.member), `row ${row.id} cites undeclared member ${row.member}`)
})

await check('B4 every cited member FILE exists on disk', () => {
  const clones = new Map(mod.MEMBERS.map(member => [member.name, member.clone]))
  for (const row of mod.CAPABILITIES) {
    const path = join(PLUGINS_SRC, clones.get(row.member), row.file)
    must(existsSync(path), `row ${row.id} cites a file that does not exist: ${row.member}/${row.file}`)
  }
})

await check('B5 every cited LINE is inside its file', () => {
  const clones = new Map(mod.MEMBERS.map(member => [member.name, member.clone]))
  for (const row of mod.CAPABILITIES) {
    const path = join(PLUGINS_SRC, clones.get(row.member), row.file)
    const lines = readFileSync(path, 'utf8').split('\n').length
    must(row.line <= lines, `row ${row.id} cites ${row.file}:${row.line} but that file has ${lines} lines`)
  }
})

await check('B6 no duplicate capability ids', () => {
  const ids = mod.CAPABILITIES.map(row => row.id)
  mustEqual(ids.length, new Set(ids).size, 'two rows share an id, so a count could double-book a capability')
})

await check('B7 every UNMEASURED row carries a reason', () => {
  for (const row of mod.CAPABILITIES.filter(r => r.status === 'unmeasured')) {
    must(typeof row.reason === 'string' && row.reason.trim() !== '', `row ${row.id} is UNMEASURED with no reason — that is a silent absence`)
  }
})

await check('B8 every DRIVEN row names the fused route that drives it', () => {
  for (const row of mod.CAPABILITIES.filter(r => r.status === 'driven')) {
    must(typeof row.fusedPath === 'string' && row.fusedPath.startsWith('/meta-context/api/'), `row ${row.id} is driven but names no fused route`)
  }
})

await check('B9 the per-member census closes against the denominator', () => {
  const byMember = mod.parityByMember()
  const sum = byMember.reduce((total, row) => total + row.total, 0)
  mustEqual(sum, mod.CAPABILITIES.length, 'the per-member counts do not add up to the registry')
  for (const row of byMember) {
    mustEqual(row.driven + row.attested + row.unmeasured, row.total, `${row.member} buckets do not close`)
  }
})

await check('B10 the census reports the expected split', () => {
  const census = mod.censusOf(new Date('2026-10-26T00:00:00.000Z'))
  mustEqual(
    { total: census.total, driven: census.driven, attested: census.attested, unmeasured: census.unmeasured, unreasoned: census.unreasoned },
    { total: 25, driven: 9, attested: 13, unmeasured: 3, unreasoned: 0 },
    'the census moved; restate the published numbers',
  )
  mustEqual(census.censusAt, '2026-10-26T00:00:00.000Z', 'the census stamp is not the injected clock')
})

// ===========================================================================
// C. THE VERDICT FUNCTION's three outcomes
// ===========================================================================
await check('C1 a zero denominator is BLINDED, never PARITY', () => {
  mustEqual(mod.parityVerdict({ driven: 0, attested: 0, unmeasured: 0, unreasoned: 0, total: 0, censusAt: '' }), 'BLINDED', '0/0 must not pass')
})

await check('C2 an UNMEASURED row with no reason is a GAP', () => {
  mustEqual(mod.parityVerdict({ driven: 1, attested: 0, unmeasured: 1, unreasoned: 1, total: 2, censusAt: '' }), 'GAP', 'a silent absence must not pass')
})

await check('C3 buckets that do not sum to the denominator are a GAP', () => {
  mustEqual(mod.parityVerdict({ driven: 1, attested: 0, unmeasured: 0, unreasoned: 0, total: 2, censusAt: '' }), 'GAP', 'an uncounted row must not pass')
})

await check('C4 the real registry is PARITY', () => {
  mustEqual(mod.parityVerdict(mod.censusOf()), 'PARITY', 'the shipped registry does not account for every capability')
})

// ===========================================================================
// D. THE LIVE ROUTE SURFACE
// ===========================================================================
const indexResponse = await call('/meta-context/api')

await check('D1 GET /meta-context/api answers 200', () => {
  mustEqual(indexResponse.status, 200, `the fused index answered ${indexResponse.status}: ${indexResponse.text.slice(0, 200)}`)
  mustEqual(indexResponse.json?.ok, true, 'the index body does not say ok')
})

await check('D2 the index publishes the census with its denominator and verdict', () => {
  const { parity, verdict } = indexResponse.json
  mustEqual(verdict, 'PARITY', 'the index does not report PARITY')
  mustEqual(parity.total, 25, 'the index denominator is not the registry length')
  must(parity.censusAt !== undefined && parity.censusAt !== '', 'the index carries no census stamp')
})

await check('D3 the index advertises every route and only its own prefix', () => {
  const routes = indexResponse.json.routes
  mustEqual(routes.length, 10, `advertised ${routes.length} routes; the dispatch table declares 10`)
  for (const path of routes) must(path.startsWith('/meta-context/api'), `advertised a foreign path: ${path}`)
})

await check('D4 EVERY advertised path answers and NONE is 404', async () => {
  const routes = indexResponse.json.routes
  must(routes.length > 0, 'an empty route list would make this loop pass vacuously')
  const bad = []
  for (const path of routes) {
    const response = await call(path)
    if (response.status === 404) bad.push(`${path} -> 404`)
  }
  mustEqual(bad, [], 'a path the index advertises is not served')
})

await check('D5 GET /meta-context/api/parity serves the whole registry', async () => {
  const { status, json } = await call('/meta-context/api/parity')
  mustEqual(status, 200, `parity answered ${status}`)
  mustEqual(json.capabilities.length, 25, 'the parity route does not serve every row')
  mustEqual(json.orphanMembers, [], 'a row cites a member the fusion does not declare')
})

await check('D6 GET /meta-context/api/caps composes the controller live', async () => {
  const { status, json } = await call('/meta-context/api/caps')
  mustEqual(status, 200, `caps answered ${status}`)
  mustEqual(json.source.outcome, 'ok', `caps did not reach the member: ${json.source.reason ?? ''}`)
  mustEqual(json.source.status, 200, 'the member status was not relayed')
  must(json.modes.includes('128k'), 'the member modes were not relayed')
  mustEqual(json.policy, { global: 'auto', subagent: 'standard', run: {} }, 'the member policy was not relayed verbatim')
})

await check('D7 GET /meta-context/api/caps carries a live reading for a named session', async () => {
  const { json } = await call('/meta-context/api/caps?sessionId=session-12')
  mustEqual(json.source.outcome, 'ok', 'the named-session read did not reach the member')
  mustEqual(json.reading, { totalTokens: 42_000, folds: 3 }, 'the member reading was not relayed')
  mustEqual(json.runKeys, ['session-12'], 'the member run keys were not relayed')
})

await check('D8 POST /meta-context/api/caps forwards the body VERBATIM to the member setter', async () => {
  state.lastSetBody = null
  const body = { scope: 'run', sessionId: 'session-12', mode: '16k' }
  const { status, json } = await call('/meta-context/api/caps', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  mustEqual(status, 200, `caps POST answered ${status}`)
  mustEqual(json.ok, true, 'the setter was reported as failed')
  mustEqual(json.policy, { global: '16k', subagent: 'standard', run: {} }, 'the member policy after the set was not relayed')
  must(state.lastSetBody !== null, 'the member setter never received a body')
  mustEqual(JSON.parse(state.lastSetBody), body, 'the fused route did not forward the body verbatim')
})

await check('D9 GET /meta-context/api/formation composes context-stats', async () => {
  const { status, json } = await call('/meta-context/api/formation')
  mustEqual(status, 200, `formation answered ${status}`)
  mustEqual(json.outcome, 'ok', `formation did not reach the member: ${json.reason ?? ''}`)
  must(Array.isArray(json.value?.artifacts), 'the member formation payload was not relayed')
})

await check('D10 GET /meta-context/api/status composes context-stats', async () => {
  const { status, json } = await call('/meta-context/api/status')
  mustEqual(status, 200, `status answered ${status}`)
  mustEqual(json.outcome, 'ok', `status did not reach the member: ${json.reason ?? ''}`)
  mustEqual(json.value?.folds?.sessionsScanned, 2, 'the member status payload was not relayed')
})

await check('D11 GET /meta-context/api/folds composes context-stats', async () => {
  const { status, json } = await call('/meta-context/api/folds')
  mustEqual(status, 200, `folds answered ${status}`)
  mustEqual(json.outcome, 'ok', `folds did not reach the member: ${json.reason ?? ''}`)
  mustEqual(json.value?.sessionsAvailable, 2, 'the member folds payload was not relayed')
})

await check('D12 the admission route drives the gate and can ALLOW', async () => {
  const { status, json } = await call('/meta-context/api/admission?priced=10000&retain=1000')
  mustEqual(status, 200, `admission answered ${status}`)
  mustEqual(json.servicePresent, true, 'the gate service was not found')
  mustEqual(json.verdict.kind, 'allow', `a fold retaining 10% must be admitted, got ${JSON.stringify(json.verdict)}`)
})

await check('D13 the admission route RELAYS A REFUSAL — the gate is not a rubber stamp', async () => {
  const { json } = await call('/meta-context/api/admission?priced=10000&retain=9500')
  mustEqual(json.servicePresent, true, 'the gate service was not found')
  mustEqual(json.verdict.kind, 'refuse', `a fold retaining 95% must be refused, got ${JSON.stringify(json.verdict)}`)
})

await check('D14 a malformed admission probe is refused, not defaulted', async () => {
  const { status } = await call('/meta-context/api/admission?priced=abc')
  mustEqual(status, 400, 'a malformed probe was accepted; a default would hide that the caller drove the gate with other numbers')
})

await check('D15 with NO gate service the capability is UNMEASURED with a reason, never a zero', async () => {
  const saved = gate
  gate = undefined
  try {
    const { status, json } = await call('/meta-context/api/admission')
    mustEqual(status, 200, `admission answered ${status}`)
    mustEqual(json.servicePresent, false, 'the absent gate was reported as present')
    must(typeof json.reason === 'string' && json.reason.trim() !== '', 'an absent gate produced no reason — that is a silent absence')
    mustEqual(json.verdict, undefined, 'an absent gate produced a verdict, which cannot be true')
  } finally {
    gate = saved
  }
})

await check('D17 GET /meta-context/api/tuning composes s1cap and relays its context knobs', async () => {
  const { status, json } = await call('/meta-context/api/tuning')
  mustEqual(status, 200, `tuning answered ${status}`)
  mustEqual(json.outcome, 'ok', `tuning did not reach s1cap: ${json.reason ?? ''}`)
  // The knob band is the WHOLE justification for fusing s1cap, so these are the
  // fields the check reads rather than merely "a 200 came back".
  mustEqual(json.value?.effective?.shortContextTokens, 32_768, 'the short-context budget was not relayed')
  mustEqual(json.value?.effective?.chunkTokens, 512, 'the chunk size was not relayed')
  mustEqual(json.value?.effective?.overlapTokens, 64, 'the chunk overlap was not relayed')
  mustEqual(json.value?.status?.cell, 'C2', 'the member status block was not relayed')
})

await check('D18 the s1cap member prefix is the one the composer will call', () => {
  const s1cap = mod.MEMBERS.find(member => member.name === 's1cap')
  must(s1cap !== undefined, 's1cap is not a member, so the tuning route has no owner to cite')
  mustEqual(s1cap.prefix, 's1cap-7340', 's1cap owns no api segment; its route is the fixed literal /s1cap-7340')
})

await check('D19 the fold-scan compose budget OUTLASTS the member own 25 s scan', () => {
  // Measured live 2026-10-26: an 8 s budget made /status answer UNMEASURED while
  // the member was still scanning, so two DRIVEN capabilities could never be
  // derived on a real deployment. The member budgets 25 s at
  // dsh-context-stats/src/host/routes.ts:120; this side must be larger.
  const MEMBER_SCAN_BUDGET_S = 25_000
  must(typeof mod.MEMBER_SCAN_BUDGET_MS === 'number', 'the budget is not exported, so this cannot be checked')
  must(mod.MEMBER_SCAN_BUDGET_MS > MEMBER_SCAN_BUDGET_S,
    `the compose budget (${mod.MEMBER_SCAN_BUDGET_MS} ms) is not longer than the member's own (${MEMBER_SCAN_BUDGET_S} ms), so the member would always be reported unreachable`)
})

// ===========================================================================
// E. THE FAILURE VOCABULARY AND THE UNMEASURED DISCIPLINE
// ===========================================================================
await check('E1 an unknown path answers 404 with THIS plugin body', async () => {
  const { status, json } = await call('/meta-context/api/nope')
  mustEqual(status, 404, `unknown path answered ${status}`)
  must(typeof json?.error === 'string' && json.error.includes('meta-context'), `the 404 body is not ours: ${JSON.stringify(json)}`)
  mustEqual(json.routes.length, 10, 'the 404 body does not advertise the route table, so it cannot be authoritative')
})

await check('E2 a foreign prefix answers 404, not a foreign 405', async () => {
  // Driven through the mount that hands the plugin every pathname, so this check
  // exercises the plugin's own prefix guard rather than the router's dispatch.
  const { status, json } = await callForeign('/context-stats/api/formation')
  mustEqual(status, 404, `a foreign prefix answered ${status}; only this prefix's tail is matched`)
  must(json.error.includes('does not own'), `the refusal did not say why: ${JSON.stringify(json)}`)
})

await check('E3 the wrong method answers 405', async () => {
  const { status } = await call('/meta-context/api/parity', { method: 'POST' })
  mustEqual(status, 405, 'a POST to a GET route was not refused')
})

await check('E4 a FAILING member yields UNMEASURED with the member status, never a zero', async () => {
  state.failMember = 503
  try {
    const { status, json } = await call('/meta-context/api/formation')
    mustEqual(status, 200, `the fused route answered ${status}; a degraded member is not a broken fusion`)
    mustEqual(json.outcome, 'unmeasured', 'a 503 from the member was reported as a measured value')
    mustEqual(json.status, 503, 'the member status was not relayed')
    mustEqual(json.value, undefined, 'an unmeasured read published a value')
    must(typeof json.reason === 'string' && json.reason.includes('503'), `the reason does not name the member status: ${json.reason}`)
  } finally {
    state.failMember = 0
  }
})

await check('E5 the same read recovers to ok, so E4 measured the member and not a constant', async () => {
  const { json } = await call('/meta-context/api/formation')
  mustEqual(json.outcome, 'ok', 'the read did not recover after the member came back')
})

await check('E6 a member route that does not exist yields UNMEASURED with a 404 reason', async () => {
  const saved = MEMBER_ROUTES.get('/context-stats/api/folds')
  MEMBER_ROUTES.delete('/context-stats/api/folds')
  try {
    const { status, json } = await call('/meta-context/api/folds')
    mustEqual(status, 200, 'a missing member route broke the fused route')
    mustEqual(json.outcome, 'unmeasured', 'a missing member route was reported as a measured value')
    mustEqual(json.status, 404, 'the member 404 was not relayed')
  } finally {
    MEMBER_ROUTES.set('/context-stats/api/folds', saved)
  }
})

// ===========================================================================
// F. THE EXCLUSION LEDGER AND THE RECORDED REVERSAL
// ===========================================================================
await check('F1 every excluded candidate carries a reason, evidence and a reopen condition', () => {
  must(mod.EXCLUDED.length > 0, 'an empty exclusion list is not a claim, it is an absence')
  for (const row of mod.EXCLUDED) {
    for (const field of ['reason', 'evidence', 'reopenIf']) {
      must(typeof row[field] === 'string' && row[field].trim() !== '', `the ${row.name} exclusion has no ${field}`)
    }
  }
})

await check('F2 nothing is both a member and an exclusion', () => {
  const members = new Set(mod.MEMBERS.map(member => member.name))
  for (const row of mod.EXCLUDED) must(!members.has(row.name), `${row.name} is both fused and excluded`)
})

await check('F3 the overturned s1cap verdict is PUBLISHED, not edited away', () => {
  const row = mod.REVERSED_EXCLUSIONS.find(entry => entry.name === 's1cap')
  must(row !== undefined, 's1cap was excluded first and fused second; a deleted draft would leave that invisible')
  for (const field of ['wasExcludedBecause', 'overturnedBy', 'evidence', 'fusedAs']) {
    must(typeof row[field] === 'string' && row[field].trim() !== '', `the reversal record has no ${field}`)
  }
  must(mod.MEMBERS.some(member => member.name === 's1cap'), 'the reversal says s1cap is fused but MEMBERS omits it')
  must(!mod.EXCLUDED.some(entry => entry.name === 's1cap'), 's1cap is still in EXCLUDED as well as MEMBERS')
})

await check('F4 the served index publishes the reversal', () => {
  const reversed = indexResponse.json.reversed
  must(Array.isArray(reversed) && reversed.length === mod.REVERSED_EXCLUSIONS.length, 'the index does not serve the reversal list')
  must(reversed.some(entry => entry.name === 's1cap'), 'the served reversal list omits s1cap')
})

await check('F5 every member names its clone and its role', () => {
  for (const member of mod.MEMBERS) {
    must(typeof member.role === 'string' && member.role.length > 20, `${member.name} has no role`)
    must(existsSync(join(PLUGINS_SRC, member.clone)), `the clone for ${member.name} is not on disk at plugins-src/${member.clone}`)
  }
})

// ===========================================================================
// G. THE META BUNDLE CENSUS — present vs absent, mounted vs unmounted, and a
//    mutation that must turn this section RED.
// ===========================================================================
const bundleResponse = await call('/meta-context/api/bundle')

/** Every `dsh-meta-*` DIRECTORY that exists in `plugins-src/`, sorted. */
function bundleDirectoriesOnDisk() {
  return readdirSync(PLUGINS_SRC, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('dsh-meta-'))
    .map(entry => entry.name)
    .sort()
}

await check('G1 the bundle census has a row for EVERY directory found', async () => {
  mustEqual(bundleResponse.status, 200, `bundle answered ${bundleResponse.status}: ${bundleResponse.text.slice(0, 200)}`)
  const { rows, census } = bundleResponse.json
  const directories = bundleDirectoriesOnDisk()
  must(directories.length > 0, 'no dsh-meta-* directory was found, so this check would pass vacuously')
  mustEqual(rows.length, census.total, 'the row list and its own denominator disagree')
  const covered = directories.filter(name => rows.some(row => (row.directory ?? '').toLowerCase() === `plugins-src/${name}`.toLowerCase()))
  console.log(`  [G1] bundle rows for directories: ${covered.length}/${directories.length}`)
  mustEqual(covered.length, directories.length, `missing a bundle row for: ${directories.filter(name => !covered.includes(name)).join(', ')}`)
  mustEqual(census.directories, directories.length, 'the census directory count does not match the disk')
  mustEqual(census.present + census.absent, census.total, 'the present/absent buckets do not close against the denominator')
})

await check('G2 an UNMOUNTED package is mounted:false explicitly, and its status is never a zero', async () => {
  const { rows } = bundleResponse.json
  const mountedRows = rows.filter(row => row.mounted)
  must(mountedRows.length > 0, 'no row reported mounted, so the probe cannot be shown able to say yes')
  const presentNotMounted = rows.filter(row => row.present && !row.mounted)
  must(presentNotMounted.length > 0, 'every present package reported mounted, so the unmounted branch was never exercised')
  for (const row of presentNotMounted) {
    mustEqual(row.mounted, false, `${row.package} is present but not mounted and does not say mounted: false`)
    must(row.status !== 0, `${row.package} reports status 0; no server answers 0, so that number was invented`)
    must(row.status === null || row.status > 0, `${row.package} reports a status no server can return: ${row.status}`)
    must(typeof row.reason === 'string' && row.reason.trim() !== '', `${row.package} is unmounted with no reason — that is a silent absence`)
  }
  for (const row of rows.filter(entry => !entry.present)) {
    mustEqual(row.status, null, `${row.package} is absent from disk yet carries a status; nothing was measured`)
    must(typeof row.reason === 'string' && row.reason.trim() !== '', `${row.package} is absent with no reason`)
  }
  for (const row of rows.filter(entry => entry.status === null)) {
    must(row.reason !== null, `${row.package} has a null status and no reason — null must never be an unexplained zero`)
  }
  console.log(`  [G2] mounted ${mountedRows.length}/${rows.length}; present-not-mounted ${presentNotMounted.length}/${rows.length}; unprobed ${rows.filter(row => row.status === null).length}/${rows.length}`)
})

await check('G3 MUTATION: removing a family route turns the census RED', async () => {
  // The mutation is a real one: a route is registered, the census is read, the
  // route is REMOVED, and the census is read again through the same route. If
  // the second read still said mounted, the census would not be reading the
  // server at all — so the pre-read is also asserted, or this check could pass
  // by the probe answering `false` to everything.
  const FAMILY = '/meta-intent/api'
  const handlerForFamily = (_req, res) => sendJson(res, 200, { ok: true, probe: 'meta-intent' })
  MEMBER_ROUTES.set(FAMILY, handlerForFamily)
  try {
    const before = await call('/meta-context/api/bundle')
    const beforeRow = before.json.rows.find(row => row.routeRoot === '/meta-intent')
    must(beforeRow !== undefined, 'the census has no row for the /meta-intent family')
    mustEqual(beforeRow.mounted, true, `with ${FAMILY} registered, /meta-intent must read mounted:true; it read ${beforeRow.mounted}, so the probe is not reading the server`)
    mustEqual(beforeRow.status, 200, 'the mounted row did not relay the 200 it received')

    MEMBER_ROUTES.delete(FAMILY)
    const after = await call('/meta-context/api/bundle')
    const afterRow = after.json.rows.find(row => row.routeRoot === '/meta-intent')
    must(afterRow !== undefined, 'the census lost the /meta-intent row when the route was removed')
    mustEqual(afterRow.mounted, false, `after removing ${FAMILY} the census still reported mounted:${afterRow.mounted} — the census is not reading the route table`)
    mustEqual(afterRow.status, 404, `after removing ${FAMILY} the census reported ${afterRow.status}, not the 404 the server answered`)
    must(typeof afterRow.reason === 'string' && afterRow.reason.includes('404'), `the unmounted reason does not name the 404: ${afterRow.reason}`)
    console.log(`  [G3] mutation ${FAMILY}: mounted ${beforeRow.mounted} -> ${afterRow.mounted}; status ${beforeRow.status} -> ${afterRow.status}`)
  } finally {
    MEMBER_ROUTES.delete(FAMILY)
  }
})

// ===========================================================================
// REPORT
// ===========================================================================
server.close()
foreignServer.close()

const failed = results.filter(row => !row.ok)
const passed = results.filter(row => row.ok).length
const census = mod.censusOf()

console.log('')
console.log('dsh-meta-context host-half harness')
console.log(`  checks        : ${passed}/${results.length} passed, ${skipped} skipped`)
console.log(`  registry      : ${census.driven + census.attested + census.unmeasured}/${census.total} accounted — ` +
  `${census.driven} driven, ${census.attested} attested, ${census.unmeasured} unmeasured (${census.unreasoned} without a reason)`)
console.log(`  verdict       : ${mod.parityVerdict(census)}`)
console.log(`  census at     : ${census.censusAt}`)
console.log(`  routes served : ${mod.advertisedPaths().length}`)
console.log('')

if (failed.length > 0) {
  for (const row of failed) console.log(`FAILED  ${row.name}\n        ${row.message}`)
  console.log('')
  console.log(`VERDICT: FAIL — ${failed.length} of ${results.length} checks disagreed`)
  process.exit(1)
}

console.log(`VERDICT: PASS — ${passed}/${results.length} checks agreed`)
process.exit(0)
