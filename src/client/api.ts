/**
 * The Client half's transport.
 *
 * One route family, resolved against the PAGE BASE rather than written as an
 * absolute path, so the plugin keeps working when the app is served under a
 * reverse-proxy prefix. The page's query and hash are dropped before resolution.
 *
 * A failure is TYPED rather than collapsed into one boolean, because the page has
 * to distinguish "the fused route rejected this body" (400) from "the fused route
 * is not mounted" (404) — the second is a deployment fact the owner needs to see
 * as a fact, not as an empty list. Nothing here reads a Node builtin or another
 * plugin: `shared/protocol.ts` is inlined because it imports nothing at all.
 *
 * @module dsh-meta-context/client/api
 */

import { ROUTE_PREFIX, type IndexResponse, type ParityResponse } from '../shared/protocol.ts'

/** Placeholder origin for the non-DOM case (specs, SSR): resolution needs an absolute base. */
const PLACEHOLDER_ORIGIN = 'http://dsh.invalid/'

/** Why one call failed, as far as the UI needs to distinguish it. */
export type ReadFailure = 'rejected' | 'not-mounted' | 'unreachable'

/** A typed failure from the fused route. */
export class MetaContextError extends Error {
  constructor(readonly failure: ReadFailure, message: string) {
    super(message)
    this.name = 'MetaContextError'
  }
}

/** The failure kind matching one HTTP status. */
function failureFor(status: number): ReadFailure {
  if (status === 400) return 'rejected'
  if (status === 404) return 'not-mounted'
  return 'unreachable'
}

/** Turn any page base into a directory base, so a relative route resolves inside it. */
function directoryBase(baseUrl: string): string {
  const url = new URL(baseUrl === '' ? PLACEHOLDER_ORIGIN : baseUrl, PLACEHOLDER_ORIGIN)
  url.search = ''
  url.hash = ''
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.href
}

/**
 * Resolve one fused route against the page base.
 * @param tail - the route tail without a leading slash (`''` for the index).
 * @returns the absolute route URL, page prefix included.
 */
function routeUrl(tail: string): URL {
  const base = typeof document === 'undefined' ? PLACEHOLDER_ORIGIN : document.baseURI
  const path = tail === '' ? ROUTE_PREFIX : `${ROUTE_PREFIX}/${tail}`
  return new URL(path.replace(/^\/+/, ''), directoryBase(base))
}

/** One GET against a fused route, returning the parsed body. */
async function read(tail: string): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(routeUrl(tail), { headers: { accept: 'application/json' }, cache: 'no-store' })
  } catch (error) {
    throw new MetaContextError('unreachable', error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    throw new MetaContextError(failureFor(response.status), `the fused route answered ${response.status}`)
  }
  return await response.json() as Record<string, unknown>
}

/**
 * Read the fused index.
 * @returns the index payload.
 */
export async function readIndex(): Promise<IndexResponse> {
  return await read('') as unknown as IndexResponse
}

/**
 * Read the capability registry.
 * @returns the parity payload.
 */
export async function readParity(): Promise<ParityResponse> {
  return await read('parity') as unknown as ParityResponse
}
