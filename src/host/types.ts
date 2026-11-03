/**
 * The Host surfaces this plugin touches, declared STRUCTURALLY.
 *
 * The package builds standalone from `plugins-src/` and is consumed by a
 * profile through a relative `link:`, so it has no TypeScript project reference
 * to the Harness checkout and must have ZERO runtime `@deepseek-ai/*` value
 * imports. Every Host face is therefore an interface written here, exactly as
 * `dsh-context-out-controller/src/host/types.ts` and
 * `dsh-context-stats/src/host/types.ts` do it — the house pattern, not a
 * workaround.
 *
 * @module dsh-meta-context/host/types
 */

import type { IncomingMessage, ServerResponse } from 'node:http'

/** The web server's prefix-route registration face. */
export interface WebServerFace {
  /**
   * Register one route.
   * @param route - the route spec; `kind: 'prefix'` matches the path and any tail.
   * @returns the disposer that removes the route.
   */
  readonly register: (route: {
    readonly kind: 'prefix'
    readonly path: string
    readonly handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void
  }) => () => void
}

/** A logger with printf-style calls; `ctx.logger` satisfies it. */
export interface LoggerLike {
  readonly info: (message: string, ...args: unknown[]) => void
  readonly warn: (message: string, ...args: unknown[]) => void
}

/** One admission request, as `dsh-fold-admission/src/types.ts` declares it. */
export interface FoldAdmissionRequestLike {
  readonly sessionId: string
  readonly pricedTokens: number
  readonly retainTokens: number
}

/** One admission verdict, structurally. `kind` is the only field read. */
export interface FoldAdmissionVerdictLike {
  readonly kind: 'allow' | 'refuse'
  readonly reason?: string
  readonly record?: unknown
}

/**
 * The admission gate service, as `dsh-fold-admission` provides it.
 *
 * The fused surface calls `admit()` — the member's OWN implementation, resolved
 * through cordis — rather than re-deriving the predicate. That is the difference
 * between composing a member and copying it: if the member's policy changes, the
 * fused answer changes with it, and there is no second copy to drift.
 */
export interface FoldAdmissionGateLike {
  readonly admit: (request: FoldAdmissionRequestLike) => Promise<FoldAdmissionVerdictLike>
}

/** The plugin context, narrowed to what this half reads. */
export interface HostContext {
  /** The web server, injected. */
  readonly webServer: WebServerFace
  /** The logger. */
  readonly logger: LoggerLike
  /**
   * Resolve a cordis service, or `undefined` when it is absent.
   * @param name - the service name.
   */
  readonly get: (name: string) => unknown
  /**
   * Run an effect whose disposer rides this plugin's fiber.
   * @param execute - the effect body; returns its disposer.
   * @param label - the effect label, for the harness's own diagnostics.
   * @returns the effect's disposer.
   */
  readonly effect: (execute: () => () => void, label?: string) => () => void
}
