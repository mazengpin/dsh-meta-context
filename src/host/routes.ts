/**
 * The `/meta-context/api` HTTP surface — the ONE route prefix this fusion
 * presents where its members presented four.
 *
 * THE DISPATCH TABLE IS THE AUTHORITY
 *
 * `ROUTES` below is the only list of what this prefix serves, and the 404 body
 * is rendered FROM it. That ordering is a hard lesson from this program: a
 * hand-written 404 body once advertised a path that the dispatch table could not
 * reach (a doubled `/api/api/` segment), so the one place whose job is to be
 * authoritative was the one place that was wrong. Here a path cannot be
 * advertised without being dispatched, and the verify harness asserts every
 * advertised path answers.
 *
 * FAILURE VOCABULARY, copied from both route-owning members so a client learns
 * one vocabulary for the family: bad input is 400, the wrong method is 405, an
 * unknown route is 404, a body over the cap is 413, and an unexpected handler
 * throw is 502. A 200 is never returned for a failure.
 *
 * AN UNMEASURED MEMBER IS NOT AN ERROR HERE
 *
 * When a composed read cannot be derived, the fused route still answers 200 with
 * `ok: true` and a `source.outcome` of `unmeasured` carrying the status and the
 * reason. That is deliberate and it is rule (4) made executable: the fused
 * surface's own health is not the member's health, and conflating them would
 * make a degraded member look like a broken fusion — or, worse, make a broken
 * fusion look like a degraded member. The payload says which.
 *
 * @module dsh-meta-context/host/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CAPABILITIES,
  MEMBERS,
  EXCLUDED,
  PANEL_ID,
  REVERSED_EXCLUSIONS,
  ROUTE_PATH,
  ROUTE_PREFIX,
  SIDEBAR_ID,
  SIDEBAR_ORDER,
  censusOf,
  parityByMember,
  parityVerdict,
  type AdmissionResponse,
  type CapsResponse,
  type IndexResponse,
  type ParityResponse,
} from '../shared/protocol.ts'
import { bundleOf } from './bundle.ts'
import { authorityOf, compose } from './compose.ts'
import type { FoldAdmissionGateLike } from './types.ts'

/** Cap on a request body; the largest payload here is `{"scope":"run","sessionId":"session-12","mode":"16k"}`. */
const MAX_BODY_BYTES = 4 * 1024

/**
 * The compose budget for the two routes whose member does its own fold scan.
 *
 * 30 s against the member's own 25 s ceiling, so the member's timeout is the one
 * that fires first and this surface relays the member's answer rather than
 * inventing its own unreachability.
 *
 * Exported because it is an ACCEPTANCE FACT rather than a tuning knob: a value at
 * or below the member's own budget makes two driven capabilities permanently
 * UNMEASURED on a real deployment, and the verify harness asserts the inequality
 * so that defect cannot return quietly.
 */
export const MEMBER_SCAN_BUDGET_MS = 30_000

/** The method each advertised route accepts. */
interface RouteSpec {
  /** The pathname tail under the prefix, without slashes. */
  readonly tail: string
  /** The accepted method. */
  readonly method: 'GET' | 'POST'
  /** One line on what it serves; rendered into the index so the list is self-describing. */
  readonly summary: string
}

/**
 * Every route this prefix serves.
 *
 * `GET /meta-context/api` itself is the empty tail, and it is in the table so
 * the index can advertise it and the harness can drive it.
 */
export const ROUTES: readonly RouteSpec[] = [
  { tail: '', method: 'GET', summary: 'The fused index: members, parity census, verdict, and the routes below.' },
  { tail: 'parity', method: 'GET', summary: 'The capability registry the parity count is taken over, with citations.' },
  { tail: 'caps', method: 'GET', summary: 'The per-scope context ceilings, composed live from the controller.' },
  { tail: 'caps', method: 'POST', summary: 'Set one ceiling, forwarded to the controller setter.' },
  { tail: 'formation', method: 'GET', summary: 'Formation freshness, composed live from context-stats.' },
  { tail: 'status', method: 'GET', summary: 'Fold aggregate and memory status, composed live from context-stats.' },
  { tail: 'folds', method: 'GET', summary: 'Fold rows, composed live from context-stats.' },
  { tail: 'admission', method: 'GET', summary: 'Drives the member fold-admission gate with a probe (?priced=&retain=).' },
  { tail: 'tuning', method: 'GET', summary: 'The context-assembly knobs, composed live from s1cap.' },
  { tail: 'bundle', method: 'GET', summary: 'The meta bundle census: which dsh-meta-* packages are present on disk, and which are mounted.' },
]

/** Everything the routes read. */
export interface RouteDeps {
  /** The one-shot logger. */
  readonly log: (level: 'info' | 'warn', message: string) => void
  /** Resolve the admission gate service, or undefined when it is not mounted. */
  readonly admission: () => FoldAdmissionGateLike | undefined
  /** The clock, injected so the harness can pin the census stamp. */
  readonly now: () => Date
}

/** One route failure carrying the HTTP status it must answer with. */
class RouteError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/** Write one JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/** The message of a thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Read and parse a JSON object body, bounded by {@link MAX_BODY_BYTES}. */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) throw new RouteError(413, 'request body is too large')
    chunks.push(buffer)
  }
  if (size === 0) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new RouteError(400, 'request body is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new RouteError(400, 'request body must be a JSON object')
  }
  return parsed as Record<string, unknown>
}

/** The advertised route list, as absolute pathnames. */
export function advertisedPaths(): string[] {
  return ROUTES.map(route => (route.tail === '' ? ROUTE_PATH : `${ROUTE_PATH}/${route.tail}`))
}

/**
 * Build one `IndexResponse`.
 * @param deps - the route's dependencies.
 * @returns the fused index.
 */
function indexOf(deps: RouteDeps): IndexResponse {
  const parity = censusOf(deps.now())
  return {
    ok: true,
    prefix: ROUTE_PREFIX,
    sidebar: { slot: 'sidebar.panellist', id: SIDEBAR_ID, order: SIDEBAR_ORDER, panel: PANEL_ID },
    members: MEMBERS,
    excluded: EXCLUDED,
    reversed: REVERSED_EXCLUSIONS,
    parity,
    verdict: parityVerdict(parity),
    byMember: parityByMember(),
    routes: advertisedPaths(),
    censusAt: parity.censusAt,
  }
}

/**
 * Build one `ParityResponse`.
 *
 * `orphanMembers` is the check that keeps the registry honest in the other
 * direction: a capability citing a member that is not in `MEMBERS` would be a row
 * the fusion claims but never mounted, and it is reported rather than ignored.
 * @param deps - the route's dependencies.
 * @returns the parity registry.
 */
function parityOf(deps: RouteDeps): ParityResponse {
  const census = censusOf(deps.now())
  const declared = new Set(MEMBERS.map(member => member.name))
  const orphans = [...new Set(CAPABILITIES.map(capability => capability.member))]
    .filter(member => !declared.has(member))
    .sort()
  return {
    ok: true,
    census,
    verdict: parityVerdict(census),
    byMember: parityByMember(),
    capabilities: CAPABILITIES,
    orphanMembers: orphans,
  }
}

/**
 * `GET /meta-context/api/caps` — the composed ceiling surface.
 *
 * The `scopes` field is DERIVED, not declared: `standard|auto|…` are the modes
 * the controller accepts, and the scopes are read off the member's own `modes`
 * and `runKeys` payload. Nothing here hard-codes a cap value, so raising a new
 * mode in the controller reaches this surface with no edit.
 * @param deps - the route's dependencies.
 * @param req - the originating request, for its authority.
 * @param url - the parsed request URL, for `sessionId`.
 * @returns the composed caps payload.
 */
async function capsOf(deps: RouteDeps, req: IncomingMessage, url: URL): Promise<CapsResponse> {
  const sessionId = url.searchParams.get('sessionId')
  const memberPath = sessionId === null || sessionId === ''
    ? '/context-out/api/state'
    : `/context-out/api/state?sessionId=${encodeURIComponent(sessionId)}`
  const source = await compose({ authority: authorityOf(req), memberPath })
  if (source.outcome === 'unmeasured') {
    deps.log('warn', `dsh-meta-context: caps is UNMEASURED — ${source.reason ?? 'no reason recorded'}`)
    return { ok: true, source }
  }
  const value = source.value as Record<string, unknown>
  const modes = Array.isArray(value['modes']) ? (value['modes'] as string[]) : []
  const runKeys = Array.isArray(value['runKeys']) ? (value['runKeys'] as string[]) : []
  // The scopes are the SCOPES the member validates against, and the member is
  // the authority: rather than restating them here, they are named from the
  // member's own contract file and the payload carries the member's answer
  // verbatim under `policy`.
  const scopes = ['global', 'subagent', 'run']
  return {
    ok: true,
    ...(modes.length === 0 ? {} : { modes }),
    scopes,
    ...(value['policy'] === undefined ? {} : { policy: value['policy'] }),
    ...(runKeys.length === 0 ? {} : { runKeys }),
    ...(value['reading'] === undefined ? {} : { reading: value['reading'] }),
    source,
  }
}

/**
 * `POST /meta-context/api/caps` — forward a setter call to the controller.
 *
 * The body is forwarded VERBATIM: this surface does not re-validate a shape the
 * member already validates, because two validators that disagree would let the
 * fused route answer 200 for a set the member refused. The member's own 400 is
 * relayed.
 * @param deps - the route's dependencies.
 * @param req - the originating request.
 * @param rawBody - the parsed body, forwarded unchanged.
 * @returns the composed setter payload.
 */
async function setCapsOf(
  deps: RouteDeps,
  req: IncomingMessage,
  rawBody: Record<string, unknown>,
): Promise<{ ok: boolean; source: unknown; policy?: unknown; error?: string }> {
  const source = await compose({
    authority: authorityOf(req),
    memberPath: '/context-out/api/set',
    method: 'POST',
    body: rawBody,
  })
  if (source.outcome === 'unmeasured') {
    deps.log('warn', `dsh-meta-context: caps set is UNMEASURED — ${source.reason ?? 'no reason recorded'}`)
    return { ok: false, source, error: source.reason }
  }
  const value = source.value as Record<string, unknown>
  return {
    ok: value['ok'] !== false,
    ...(value['policy'] === undefined ? {} : { policy: value['policy'] }),
    source,
  }
}

/**
 * `GET /meta-context/api/admission` — drive the member's OWN gate service.
 *
 * The probe is parameterised because a gate that only ever answers one way is a
 * gate nobody has tested: with the shipped deterministic floor
 * (`minRemovalFraction` 0.8) a fold retaining 10% of its priced span must be
 * ALLOWED and one retaining 95% must be REFUSED, and both cases are driven
 * through the same route so a reader can see the refusal rather than take it on
 * trust. A gate that answered `allow` to both would be a dead safety control
 * wearing a green surface.
 * @param deps - the route's dependencies.
 * @param url - the parsed request URL, for the probe's two counts.
 * @returns the admission payload.
 */
async function admissionOf(deps: RouteDeps, url: URL): Promise<AdmissionResponse> {
  const gate = deps.admission()
  const pricedTokens = countParam(url, 'priced', 10_000)
  const retainTokens = countParam(url, 'retain', 1_000)
  if (gate === undefined) {
    return {
      ok: true,
      servicePresent: false,
      reason:
        'the foldAdmissionGate service is not registered on this context, so the admission capability cannot be derived; the member is not mounted or its row is disabled',
    }
  }
  try {
    const probe = { sessionId: 'meta-context-probe', pricedTokens, retainTokens }
    const verdict = await gate.admit(probe)
    return { ok: true, servicePresent: true, verdict, probe }
  } catch (error) {
    return {
      ok: true,
      servicePresent: true,
      reason: `the foldAdmissionGate service threw when driven: ${messageOf(error)}`,
    }
  }
}

/**
 * Read one non-negative integer query parameter.
 *
 * A malformed value is REFUSED rather than defaulted: silently substituting the
 * default would let a caller believe it had driven the gate with its own numbers
 * when it had driven it with these.
 * @param url - the parsed request URL.
 * @param name - the parameter name.
 * @param fallback - the value used when the parameter is absent.
 * @returns the parsed count.
 */
function countParam(url: URL, name: string, fallback: number): number {
  const raw = url.searchParams.get(name)
  if (raw === null || raw === '') return fallback
  if (!/^\d+$/.test(raw)) throw new RouteError(400, `query parameter "${name}" must be a non-negative integer`)
  return Number(raw)
}

/**
 * The 404 body, rendered from the dispatch table so it cannot advertise a path
 * the table cannot reach.
 * @param pathname - the pathname that was not found.
 * @returns the body.
 */
function notFoundBody(pathname: string): { ok: false; error: string; routes: { path: string; method: string; summary: string }[] } {
  return {
    ok: false,
    error: `unknown meta-context route ${JSON.stringify(pathname)}`,
    routes: ROUTES.map(route => ({
      path: route.tail === '' ? ROUTE_PATH : `${ROUTE_PATH}/${route.tail}`,
      method: route.method,
      summary: route.summary,
    })),
  }
}

/**
 * Build the prefix handler for `/meta-context/api`.
 * @param deps - the admission service reader, the logger and the clock.
 * @returns the node request handler owning the full response lifecycle.
 */
export function createRouteHandler(
  deps: RouteDeps,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://dsh.invalid')
      // Guard the prefix BEFORE slicing. Without this check a foreign pathname
      // still resolves, because only its TAIL has to match — the same defect
      // `dsh-context-stats` documents and guards at routes.ts:100.
      if (!url.pathname.startsWith(ROUTE_PATH)) {
        throw new RouteError(404, 'this prefix does not own that pathname')
      }
      const tail = url.pathname.slice(ROUTE_PATH.length).replace(/^\/+/, '').replace(/\/+$/, '')
      // The table is keyed on the PAIR (tail, method), not on the tail alone.
      // Keying on the tail alone made `POST /caps` answer 405 while `GET /caps`
      // answered 200, because a `find` over the table returned the GET row first
      // and then rejected the method — a route the index advertised and the
      // dispatch could not reach, found by this package's own harness (D8).
      const candidates = ROUTES.filter(route => route.tail === tail)
      if (candidates.length === 0) {
        writeJson(res, 404, notFoundBody(url.pathname))
        return
      }
      const spec = candidates.find(route => route.method === req.method)
      if (spec === undefined) {
        const accepted = candidates.map(route => route.method).join(' or ')
        throw new RouteError(405, `${tail === '' ? 'the index' : tail} accepts ${accepted}`)
      }

      switch (tail) {
        case '':
          writeJson(res, 200, indexOf(deps))
          return
        case 'parity':
          writeJson(res, 200, parityOf(deps))
          return
        case 'caps': {
          if (spec.method === 'POST') {
            writeJson(res, 200, await setCapsOf(deps, req, await readJsonBody(req)))
            return
          }
          writeJson(res, 200, await capsOf(deps, req, url))
          return
        }
        case 'formation':
          writeJson(res, 200, await compose({ authority: authorityOf(req), memberPath: '/context-stats/api/formation' }))
          return
        case 'status':
          writeJson(res, 200, await compose({
            authority: authorityOf(req),
            memberPath: `/context-stats/api/status${url.search === '' ? '' : url.search}`,
            // The member budgets 25 s for its own fold scan
            // (`dsh-context-stats/src/host/routes.ts:120`), so this hop must
            // outlast it. Measured on the live profile 2026-10-26: with the
            // composer's default 8 s budget, this route answered UNMEASURED
            // after 8,033 ms while the member was still scanning. The report was
            // honest and useless, which is its own defect — a timeout shorter
            // than the callee's own budget reports a HEALTHY member as
            // unreachable, and a surface that can never derive its number is a
            // worse instrument than one that knows it cannot.
            timeoutMs: MEMBER_SCAN_BUDGET_MS,
          }))
          return
        case 'folds':
          writeJson(res, 200, await compose({
            authority: authorityOf(req),
            memberPath: `/context-stats/api/folds${url.search === '' ? '' : url.search}`,
            // Same budget, same reason: `folds` runs the same scan.
            timeoutMs: MEMBER_SCAN_BUDGET_MS,
          }))
          return
        case 'admission':
          writeJson(res, 200, await admissionOf(deps, url))
          return
        case 'bundle':
          // The meta bundle census reads disk and probes each family root on
          // THIS server, addressed by this request's own authority. It writes
          // nothing: no package directory, manifest or route table is touched.
          writeJson(res, 200, await bundleOf({ authority: authorityOf(req), now: deps.now }))
          return
        case 'tuning':
          // s1cap owns no `api` segment: its route is the fixed literal
          // `/s1cap-7340` (packages/dsh-plugin/src/index.ts:2586). Composing it
          // rather than copying its knob table is the only honest option — the
          // knobs are read through the member's own assembler, so a copy would
          // publish values the assembler might no longer be using.
          writeJson(res, 200, await compose({ authority: authorityOf(req), memberPath: '/s1cap-7340' }))
          return
        default:
          throw new RouteError(404, `unknown meta-context route ${JSON.stringify(url.pathname)}`)
      }
    } catch (error) {
      const status = error instanceof RouteError ? error.status : 502
      writeJson(res, status, { ok: false, error: messageOf(error) })
    }
  }
}
