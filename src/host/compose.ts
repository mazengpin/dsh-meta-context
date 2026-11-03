/**
 * The composer: how the fused surface derives a member's answer WITHOUT copying
 * the member.
 *
 * THE PROBLEM THIS SOLVES
 *
 * The fused plugin must expose one route prefix that reproduces the family's
 * capabilities. It cannot do that by importing a member's `createRouteHandler`,
 * because each of those handlers is closed over state owned by that member's own
 * activation: `dsh-context-out-controller/src/index.ts:115` builds a
 * `policy` store inside `apply`, so a second handler built here would answer
 * from a SECOND policy — a setter that reports success and changes nothing the
 * actuator reads. A surface that publishes a cap which does not take effect is
 * worse than no surface at all, and it is precisely the "publishes a number it
 * cannot derive" failure D-0352 rule (4) forbids.
 *
 * THE RESOLUTION: CALL THE LIVE MEMBER ROUTE ON THE SAME SERVER
 *
 * Every member prefix route is already registered on the web server this plugin
 * is mounted on. So the composer issues a loopback HTTP request to that member's
 * own handler and returns what the member said. Three properties follow, and all
 * three are the point:
 *
 *  1. Completeness — the answer comes from the member's live activation, with
 *     the member's own policy store, ledger and caches. There is no second copy
 *     to drift, so a member change reaches this surface with no edit here.
 *  2. Addressability — the base is taken from the ORIGINATING REQUEST's own
 *     authority (`Host`), not from configuration. That is what keeps the plugin
 *     free of absolute machine paths and free of a port that a reverse proxy or
 *     an OS-assigned port would invalidate.
 *  3. Honesty — a member that 404s, 503s, times out or does not exist produces
 *     `outcome: 'unmeasured'` with the status and the reason. It never produces
 *     an empty success and never a zero.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not forward the caller's credentials or cookies, and it does not
 * target a fenced `/api` route. A fenced member route carries host-internal
 * topology or per-session log reads; proxying one onto this plugin's open prefix
 * would de-fence it. Those members' capabilities are recorded UNMEASURED with
 * that reason in the registry instead.
 *
 * @module dsh-meta-context/host/compose
 */

import { MEMBERS, type ComposedRead } from '../shared/protocol.ts'

/** How long one composed read may take before it is reported unmeasured. */
export const COMPOSE_TIMEOUT_MS = 8_000

/**
 * Every member path this composer is permitted to call.
 *
 * Derived from `MEMBERS`, never hand-written: a composer that accepted an
 * arbitrary path would turn this plugin's open prefix into a proxy for the whole
 * server, including the fenced `/api` surface. `dsh-context-stats` guards its
 * own handler against a foreign pathname for the mirror-image reason
 * (`src/host/routes.ts:100`), and the guard belongs on both sides of a hop.
 */
export const ALLOWED_MEMBER_PREFIXES: readonly string[] = MEMBERS
  .map(member => member.prefix)
  .filter((prefix): prefix is string => prefix !== null)

/**
 * The base authority of the request being served.
 *
 * `Host` is the RFC-mandated authority and is what the browser actually
 * addressed; `x-forwarded-host` is consulted only when `Host` is absent, so a
 * proxied deployment resolves to the proxy's public name rather than to the
 * inner port.
 * @param req - the originating request.
 * @returns the authority, or `undefined` when neither header is usable.
 */
export function authorityOf(req: { headers: Record<string, string | string[] | undefined> }): string | undefined {
  const raw = req.headers['host'] ?? req.headers['x-forwarded-host']
  const value = Array.isArray(raw) ? raw[0] : raw
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  // A Host header is echoed into an absolute URL, so it is validated rather than
  // trusted: only a host[:port] literal with no scheme, path, whitespace or
  // credential marker is accepted.
  if (trimmed === '' || !/^[A-Za-z0-9.\-[\]:]+$/.test(trimmed)) return undefined
  return trimmed
}

/**
 * Build the URL for one member path under one authority.
 * @param authority - the request's own authority.
 * @param memberPath - an absolute member pathname, WITH its leading slash.
 * @returns the absolute loopback URL.
 */
export function memberUrl(authority: string, memberPath: string): string {
  return `http://${authority}${memberPath}`
}

/**
 * Whether one absolute pathname sits under a member prefix this composer may
 * call.
 * @param memberPath - the absolute pathname to test.
 * @returns true when a member owns it.
 */
export function isComposablePath(memberPath: string): boolean {
  return ALLOWED_MEMBER_PREFIXES.some(prefix => memberPath === `/${prefix}` || memberPath.startsWith(`/${prefix}/`))
}

/** What one composed read needs. */
export interface ComposeOptions {
  /** The request's own authority, or undefined when it could not be resolved. */
  readonly authority: string | undefined
  /** The absolute member pathname, including the leading slash. */
  readonly memberPath: string
  /** The HTTP method; defaults to GET. */
  readonly method?: 'GET' | 'POST'
  /** The JSON body for a POST. */
  readonly body?: unknown
  /** Override the timeout, for a harness that wants a fast refusal. */
  readonly timeoutMs?: number
}

/**
 * One composed member read.
 *
 * Every failure branch returns `outcome: 'unmeasured'` with a `reason` and a
 * `status` of `null` when no response was received. There is no path through
 * this function that returns an empty value and calls it a success.
 * @param options - what to call.
 * @returns the composed read.
 */
export async function compose(options: ComposeOptions): Promise<ComposedRead> {
  const started = Date.now()
  const upstream = options.memberPath
  const authority = options.authority
  if (authority === undefined) {
    return {
      outcome: 'unmeasured',
      upstream,
      status: null,
      reason: 'the originating request carried no usable Host header, so there is no authority to compose against',
      elapsedMs: 0,
    }
  }
  if (!isComposablePath(upstream)) {
    return {
      outcome: 'unmeasured',
      upstream,
      status: null,
      reason: `no member of this fusion owns ${upstream}; the composer calls member prefixes only (${ALLOWED_MEMBER_PREFIXES.join(', ')})`,
      elapsedMs: 0,
    }
  }
  const timeoutMs = options.timeoutMs ?? COMPOSE_TIMEOUT_MS
  try {
    const response = await fetch(memberUrl(authority, upstream), {
      method: options.method ?? 'GET',
      headers: options.body === undefined
        ? { accept: 'application/json' }
        : { accept: 'application/json', 'content-type': 'application/json' },
      ...options.body === undefined ? {} : { body: JSON.stringify(options.body) },
      signal: AbortSignal.timeout(timeoutMs),
      // A 3xx from a member is a member that did not answer the question; it is
      // reported rather than followed, so no redirect can move this read onto a
      // route the prefix guard above never vetted.
      redirect: 'manual',
    })
    const elapsedMs = Date.now() - started
    const text = await response.text()
    if (!response.ok) {
      return {
        outcome: 'unmeasured',
        upstream,
        status: response.status,
        reason: `the member answered ${response.status}: ${firstLine(text)}`,
        elapsedMs,
      }
    }
    let value: unknown
    try {
      value = JSON.parse(text)
    } catch {
      return {
        outcome: 'unmeasured',
        upstream,
        status: response.status,
        reason: 'the member answered 200 with a body that is not JSON, so its content cannot be derived here',
        elapsedMs,
      }
    }
    return { outcome: 'ok', upstream, status: response.status, value, elapsedMs }
  } catch (error) {
    return {
      outcome: 'unmeasured',
      upstream,
      status: null,
      reason: `the composed read threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
      elapsedMs: Date.now() - started,
    }
  }
}

/**
 * The first line of a response body, bounded, for an error message.
 * @param text - the raw body.
 * @returns a single short line.
 */
function firstLine(text: string): string {
  const line = text.split('\n')[0] ?? ''
  return line.length > 200 ? `${line.slice(0, 200)}…` : line
}


