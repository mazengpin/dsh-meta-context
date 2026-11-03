/**
 * ============================================================================
 * dsh-meta-context — Host half
 * ============================================================================
 *
 * WHAT THIS PLUGIN IS
 *
 * The ONE fused surface for the context family. Its members — `dsh-context`,
 * `dsh-context-out-controller`, `dsh-context-stats` and `dsh-fold-admission` —
 * each present their own route prefix and their own GUI seat, which is the
 * owner's complaint: several left-sidebar entries doing one family's work. This
 * plugin presents ONE prefix (`/meta-context/api`) and ONE keyed sidebar entry,
 * and derives each member's answer from the member's own live route or service.
 *
 * WHAT IT DELIBERATELY IS NOT
 *
 * It is a NEW CLONE, not a rewrite: D-0352 rule (1) forbids deleting, reverting
 * or unregistering a member until capability parity is proven, and rule (3)
 * requires the members to stay LOADED while the fusion is in progress. So this
 * row is strictly additive. Every member keeps its own loader row, its own
 * prefix and its own seats; removing THIS row restores exactly the profile the
 * owner had. No member source file is modified by this package.
 *
 * THE FOUR RULES, AND WHERE EACH IS ENFORCED IN CODE
 *
 *  1. New clone, members untouched — this file mounts one row and imports no
 *     member; the members' own registrations are read over HTTP, never edited.
 *  2. Capability parity is the test, not route count — the denominator is
 *     `CAPABILITIES` in `shared/protocol.ts`, every row cited to a member
 *     `file:line`, and `GET /meta-context/api/parity` serves the whole registry so
 *     the count can be audited rather than trusted.
 *  3. Members stay loaded — nothing here disposes, unregisters or shadows a
 *     member: no shared slot id, no shared route path, no `ctx.provide` that
 *     could collide with `foldAdmissionGate`.
 *  4. Never publish a number it cannot derive — a composed read that fails
 *     returns `outcome: 'unmeasured'` WITH ITS REASON, and `parityVerdict`
 *     turns an UNMEASURED row with no reason into a GAP. `0/0` is BLINDED, not a
 *     pass.
 *
 * WHY NOTHING HERE IMPORTS THE HARNESS
 *
 * This package builds standalone from `plugins-src/` and is consumed through a
 * relative `link:`, so it has no TypeScript project reference to the checkout and
 * must have ZERO runtime `@deepseek-ai/*` value imports. Every Host surface is
 * declared structurally in `src/host/types.ts` (the house pattern from
 * `dsh-context-out-controller`).
 *
 * WHAT THE NEXT PERSON MUST KNOW
 *
 *  1. **Only `webServer` is injected.** The admission service is read through
 *     `ctx.get` per request, so a deployment without `dsh-fold-admission` still
 *     ACTIVATES this plugin and reports that ONE capability as UNMEASURED rather
 *     than leaving a pending loader entry — the outcome the program's landing
 *     gate forbids.
 *  2. **A composed read costs one loopback hop.** It is bounded (8 s) and it is
 *     the only way to read a member's LIVE state: a second in-process policy
 *     store would answer from a state the actuator does not read.
 *  3. **A changed plugin SOURCE needs a restart.** A `dsh.profile.bundles`
 *     change hot-reloads; this package's own `lib/` does not.
 * ============================================================================
 */

import { ROUTE_PATH } from '../shared/protocol.ts'
import { createRouteHandler } from './routes.ts'
import type { FoldAdmissionGateLike, HostContext } from './types.ts'

/** Loader row name; the bundle patch mounts this package under `meta-context`. */
export const name = 'dsh-meta-context'

/**
 * Only the web server is required.
 *
 * `foldAdmissionGate` is read through `ctx.get` because it is genuinely
 * optional: requiring it statically would leave this plugin a PENDING loader
 * entry on any deployment that fuses the context surface without the admission
 * gate, which is the one outcome the program's landing gate forbids. The
 * capability is then reported UNMEASURED with the reason.
 */
export const inject = ['webServer']

/** The service name `dsh-fold-admission` provides. */
const FOLD_ADMISSION_SERVICE = 'foldAdmissionGate'

/**
 * The fused contract, re-exported.
 *
 * A fused plugin is a STABLE SURFACE, so its own contract is part of its public
 * face rather than an internal detail: the redirect below lets a harness, a
 * sibling plugin or a reader take the capability registry and the parity verdict
 * from the built artifact instead of from a second copy of the same rule. The
 * verify harness imports exactly these, so a change to the registry that the
 * harness does not see is impossible.
 */
export {
  CAPABILITIES,
  EXCLUDED,
  MEMBERS,
  PANEL_ID,
  REVERSED_EXCLUSIONS,
  ROUTE_PATH,
  ROUTE_PREFIX,
  SIDEBAR_ID,
  SIDEBAR_ORDER,
  censusOf,
  parityByMember,
  parityVerdict,
} from '../shared/protocol.ts'
export type {
  AdmissionResponse,
  Capability,
  CapsResponse,
  ComposedRead,
  Exclusion,
  IndexResponse,
  Member,
  MemberParity,
  ParityCensus,
  ParityResponse,
  ParityVerdict,
  ReversedExclusion,
} from '../shared/protocol.ts'
export { advertisedPaths, createRouteHandler, MEMBER_SCAN_BUDGET_MS, ROUTES } from './routes.ts'
export type { RouteDeps } from './routes.ts'
export {
  BUNDLES_DIR,
  PROBE_TIMEOUT_MS,
  ROUTE_FAMILIES,
  bundleOf,
  bundlesRootFromModule,
  findBundlesRoot,
} from './bundle.ts'
export type { BundleCensus, BundleDeps, BundleEntry, BundleFamily, BundleResponse, BundleRow, ProbeOutcome } from './bundle.ts'

/**
 * Mount the one fused prefix route.
 *
 * There is no configuration surface, deliberately: the composer's base comes
 * from each request's own authority, so there is nothing to configure, and a
 * config key with no effect would be a caption rather than a control.
 * @param ctx - the plugin context, with `webServer` injected.
 */
export function apply(ctx: HostContext): void {
  const admission = (): FoldAdmissionGateLike | undefined => {
    const service = ctx.get(FOLD_ADMISSION_SERVICE)
    return service === undefined || service === null ? undefined : service as FoldAdmissionGateLike
  }

  ctx.logger.info(
    'dsh-meta-context: active; prefix=%s, members=4, sidebar=sidebar.panellist#%s@12, admission=%s',
    ROUTE_PATH,
    'dsh-meta-context',
    admission() === undefined ? 'not-mounted' : 'mounted',
  )

  ctx.effect(
    () => ctx.webServer.register({
      kind: 'prefix',
      // `ROUTE_PATH` carries the leading slash because the web server's prefix
      // table matches absolute pathnames; the Client resolves the slash-less
      // `ROUTE_PREFIX` against the page base instead.
      path: ROUTE_PATH,
      handler: createRouteHandler({
        log: (level, message) => {
          if (level === 'warn') ctx.logger.warn(message)
          else ctx.logger.info(message)
        },
        admission,
        now: () => new Date(),
      }),
    }),
    'dsh-meta-context: /meta-context/api routes',
  )
}
