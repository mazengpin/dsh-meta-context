/**
 * The wire contract shared by both halves of dsh-meta-context, and the
 * authority on every route body and on the capability registry the parity
 * count is taken over.
 *
 * This module is the ONLY shared code between the Host half and the browser
 * half, and it imports nothing at all — not a Node builtin, not `react`, not
 * another plugin. That is deliberate: the browser bundle inlines this file, so
 * an import here would either leak a Node builtin into the module-loader
 * factory or add a module-table edge, and the client build's purity gate
 * rejects both.
 *
 * THE THREE STATUSES, AND WHY THERE ARE THREE RATHER THAN TWO
 *
 * D-0352 rule (2) makes capability parity — not route count — the acceptance
 * test, and rule (4) forbids publishing a number the surface cannot derive. A
 * two-valued PASS/FAIL vocabulary cannot express "the member still owns this
 * capability, its registration is cited, and the fused surface publishes it but
 * does not re-render it", so this contract names three:
 *
 *  - `driven`    the fused surface reproduces the capability itself, deriving
 *                the answer live from the member (a composed route call or a
 *                cordis service call). An HTTP probe proves it.
 *  - `attested`  the capability is a seat the member's OWN client bundle
 *                registers (a slot, a trigger, a projection definition). The
 *                fused surface publishes the exact registration with its
 *                member `file:line` and proves the member is mounted; it does
 *                not re-render another plugin's React tree, because that tree
 *                is closed inside that plugin's client artifact and copying it
 *                would be the fork D-0352 rule (1) forbids.
 *  - `unmeasured` the capability exists and the fused surface CANNOT reproduce
 *                it. It is reported with a `reason` and is never counted as a
 *                pass, never rendered as a zero, and never omitted.
 *
 * A `0/0` registry is BLINDED: `parityVerdict` returns `BLINDED` and the
 * harness exits non-zero. This program has published `0` from instruments that
 * could not see their subject; the guard is the denominator.
 *
 * @module dsh-meta-context/shared/protocol
 */

/**
 * The prefix this plugin's own routes are mounted under, WITHOUT a leading
 * slash. The Client resolves it against the page base (so the plugin keeps
 * working behind a reverse-proxy prefix); the Host adds the slash when it
 * registers, because the web server's prefix table matches absolute pathnames.
 */
export const ROUTE_PREFIX = 'meta-context/api'

/** The absolute pathname the Host registers the prefix route under. */
export const ROUTE_PATH = `/${ROUTE_PREFIX}`

/** The keyed `main` slot this plugin's page is registered under. Never `dsh-context`'s. */
export const PANEL_ID = 'dsh-meta-context'

/**
 * The `sidebar.panellist` row id. Distinct from every member's own row id
 * (`dsh-context` is the only member that owns one), because a duplicate id in a
 * keyed slot would either throw at load or silently replace the member's row.
 */
export const SIDEBAR_ID = 'dsh-meta-context'

/**
 * Position among the sidebar rows, ascending. The shipped Plugins row is 0,
 * Automation tasks is 10 and `dsh-context`'s own row is 20 (`insightPage.ts:18`),
 * so 12 seats the fused hub between Automation and the member it fronts —
 * additive, and it cannot displace a shipped or member row.
 */
export const SIDEBAR_ORDER = 12

/** The locale namespace both halves register under. */
export const LOCALE_NS = 'meta-context'

/** How the fused surface handles one capability. */
export type CapabilityStatus = 'driven' | 'attested' | 'unmeasured'

/** What kind of seam a member capability lives on. */
export type CapabilityKind = 'route' | 'fenced-route' | 'service' | 'slot' | 'trigger' | 'projection'

/** One member capability, cited to the member's own source. */
export interface Capability {
  /** Stable id, namespaced by member short name. */
  readonly id: string
  /** The loader row that owns it. */
  readonly member: string
  /** What kind of seam it is. */
  readonly kind: CapabilityKind
  /** The member source file, workspace-relative to `plugins-src/<member>/`. */
  readonly file: string
  /** The 1-based line the registration or dispatch lives on. */
  readonly line: number
  /** The registration identity as the member writes it (slot id/key, route path, service name). */
  readonly identity: string
  /** How the fused surface handles it. */
  readonly status: CapabilityStatus
  /** The fused route that drives it, when `status` is `driven`. */
  readonly fusedPath?: string
  /** Why it is UNMEASURED. Required when `status` is `unmeasured`, absent otherwise. */
  readonly reason?: string
}

/** One member plugin of the fusion, with its mounting facts. */
export interface Member {
  /** The loader row name / package name. */
  readonly name: string
  /** The package directory under `plugins-src/`. */
  readonly clone: string
  /** The member's own route prefix, without a leading slash, or `null` when it owns none. */
  readonly prefix: string | null
  /** One line on what the member is, so a reader knows the fusion's scope. */
  readonly role: string
}

/**
 * THE MEMBER TABLE. Five rows.
 *
 * This table said FOUR rows and excluded `s1cap` until 2026-10-26T10:53Z. The
 * exclusion was overturned by the lane `census`'s measured cluster assignment,
 * and the reversal is recorded in `REVERSED_EXCLUSIONS` rather than quietly
 * edited away, because D-0352's whole subject is a surface that reports what it
 * cannot derive instead of presenting a tidy absence. The evidence that moved it:
 * the census's cluster C3 "Outgoing context budget" names
 * {dsh-context-out-controller, s1cap, dsh-fold-admission} as ONE intent, on the
 * ground that s1cap is the System-1 context-size gate for the running agents —
 * "the budget the model actually sees is the product of two independent
 * deciders" — and that both render a control for one decision. This lane then
 * measured s1cap's own route answering live, and it serves exactly that knob
 * band: `shortContextTokens: 32768`, `chunkTokens: 512`, `overlapTokens: 64`,
 * `window: 16`. Those are the same units the out-controller caps at 128k…8k, so
 * "not same-intent" was wrong and the census was right.
 *
 * The census's members for this surface are C3 {"dsh-context-out-controller",
 * "s1cap", "dsh-fold-admission"} + C4 {"dsh-context", "dsh-context-stats"} — the
 * same five the brief named, with s1cap INSIDE rather than outside.
 *
 * `dsh-context-routing` and `dsh-context-select` are absent, and the reason is
 * recorded in `EXCLUDED`: the census's own `couldNotMeasure` states that the
 * loaded bundle plugins outside its 27-row registry — which is where both live —
 * were not tabulated, so this lane's exclusion of them is this lane's own
 * measurement and is labelled as such rather than attributed to the census.
 */
export const MEMBERS: readonly Member[] = [
  {
    name: 'dsh-context',
    clone: 'dsh-context',
    prefix: null,
    role: 'Context insight the user reads in the GUI: composition, evolution and cost, over session projections plus six fenced /api routes.',
  },
  {
    name: 'dsh-context-out-controller',
    clone: 'dsh-context-out-controller',
    prefix: 'context-out/api',
    role: 'Per-scope context ceilings (standard|auto|128k|64k|32k|16k|8k) with a setter, enforced by a fold actuator on the agent/pre-step waterfall.',
  },
  {
    name: 'dsh-context-stats',
    clone: 'dsh-context-stats',
    prefix: 'context-stats/api',
    role: 'Program-status datasets that had no home: fold arithmetic over the durable log, formation freshness, and a fenced LVL1 liveness probe.',
  },
  {
    name: 'dsh-fold-admission',
    clone: 'dsh-fold-admission',
    prefix: null,
    role: 'The admission gate the controller\'s fold actuator consults: a deterministic payback floor, plus an opt-in and uncalibrated System-1 arm.',
  },
  {
    name: 's1cap',
    clone: 's1cap',
    prefix: 's1cap-7340',
    role: 'The System-1 context-size gate: the chunk, overlap, short-context and window knobs the running agent assembles its context from, plus the cell/tier observability around them.',
  },
]

/**
 * CAPABILITIES CONSIDERED AND NOT FUSED, with the evidence.
 *
 * Rule (4) forbids a silent absence, so a candidate that was excluded is
 * recorded here rather than dropped: the fused surface serves this list so a
 * reader can see what is out and check the reason.
 */
export interface Exclusion {
  /** The plugin name considered. */
  readonly name: string
  /** Why it is not a member. */
  readonly reason: string
  /** The measurement that supports the reason. */
  readonly evidence: string
  /** What would put it back in. */
  readonly reopenIf: string
}

/** The measured exclusions — candidates this lane looked at and did not fuse. */
export const EXCLUDED: readonly Exclusion[] = [
  {
    name: 'dsh-context-routing',
    reason:
      'Same word, different question. It is a ROUTING and pruning console — which tools and which context chunks a turn gets — not a context-budget surface, and it already presents its own full console of 15 client sections plus its own left-sidebar row, so fusing it would add a second row rather than remove one.',
    evidence:
      'MEASURED BY THIS LANE, NOT BY THE CENSUS: the census\'s own couldNotMeasure states that the loaded bundle plugins outside its 27-row registry were not tabulated, and this plugin is one of them, so no census cluster assigns it. plugins-src/dsh-context-routing/src/host/wire-routes.ts:52 declares ROUTE_PREFIX "/context-routing/api" with inject ["webServer","tools"]; src/client/index.tsx:146 registers a keyed `main` panel and :147/:150 its own sidebar.panellist row; its client sections are ContextPanel, ContextWindowPanel, BudgetPanel, ContextCostPanel, IntentHubPanel, Lvl1Panel, SubagentCapPanel, ToolPrunePanel, WhyPanel and WindowLivePanel — a routing console that happens to display context cost, which is a different intent from the three knobs this surface unifies.',
    reopenIf:
      'the census tabulates it and assigns it to cluster C3 or C4, or the owner decides that context ROUTING belongs in the same entry as context BUDGET. Then it is a MEMBERS row and a capability pass, not a rewrite: this table is data.',
  },
  {
    name: 'dsh-context-select',
    reason:
      'Not a context-size surface and owns no client seat: it is a selection mechanism with one prefix route and no sidebar row, so there is nothing here to unify and nothing of the owner\'s complaint (several sidebar entries doing one family\'s work) that it contributes to.',
    evidence:
      'MEASURED BY THIS LANE, NOT BY THE CENSUS, for the same reason as the row above. plugins-src/dsh-context-select/src/host/routes.ts:33 declares ROUTE_PATH "/context-select/api" and src/index.ts injects ["webServer"] only; the census row for the family records no slot registration, and this lane found no slots.inject call site that would give it a place in the sidebar.',
    reopenIf:
      'it grows a client seat or the census assigns it to C3/C4. Add a MEMBERS row plus its capabilities; no host code changes.',
  },
]

/**
 * A verdict this surface HELD and then overturned, with what overturned it.
 *
 * Why this exists rather than a deleted draft: an exclusion that is edited out
 * leaves no trace that the question was ever asked, and this program's recorded
 * failure mode is exactly that — an absence indistinguishable from a thing that
 * was never there. A reader who wants to know whether `s1cap` was considered must
 * be able to find that it was, that the first answer was wrong, and what the
 * wrong answer rested on. The fused surface serves this list beside `EXCLUDED`.
 */
export interface ReversedExclusion {
  /** The plugin the earlier verdict refused. */
  readonly name: string
  /** The verdict this surface held first, in its own words. */
  readonly wasExcludedBecause: string
  /** What overturned it. */
  readonly overturnedBy: string
  /** The measurement that made the first verdict untenable. */
  readonly evidence: string
  /** How it is represented now. */
  readonly fusedAs: string
}

/** The recorded reversal. One row, and the row is the point. */
export const REVERSED_EXCLUSIONS: readonly ReversedExclusion[] = [
  {
    name: 's1cap',
    wasExcludedBecause:
      'This surface refused it as "the System-1 DECISION lane, not a context tool", on the grounds that it exposes 0 ctx.provide services, is inert by default, and its one route is a tuning panel over knobs internal to its own assembler — so a proxy would publish a panel whose effect this surface could not derive.',
    overturnedBy:
      'The lane census\'s cluster C3, which assigns s1cap to the SAME intent as dsh-context-out-controller and dsh-fold-admission: "the budget the model actually sees is the product of two independent deciders", and "one knob is offered in two places". The brief that ordered this fusion said in terms to adopt the census where the two disagree rather than defend the brief, and a false fusion is worse than a missed one — but so is a false EXCLUSION, which is the same error with the opposite sign.',
    evidence:
      'Measured live on the running profile at 2026-10-26T10:53Z: GET /s1cap-7340 answers 200 and returns {ok:true, effective:{depth:16, chunkTokens:512, overlapTokens:64, shortContextTokens:32768, relevanceThreshold:0.55, window:16, anchorWaitMs:10000, provider:"kev"}, stored, pending, restartRequired, status:{cell,tas,tier1,deliver,…}}. Those are context-assembly BUDGETS in the same units the out-controller caps at 128k…8k, so "not a context tool" is refuted by the member\'s own payload. The registration sites are packages/dsh-plugin/src/index.ts:2586 (webCtx.webServer.register(routeSpec(...))) and packages/dsh-plugin/src/client.js:925 (ctx.slots.inject(\'settings.section\', … id \'s1cap-config\', order 30, label \'S1CAP\')), and the inert-by-default guard is real at index.ts:1116 but is a CONFIG default, not a capability: an inert capability is UNMEASURED with a reason, which is what this surface now reports, not an absence.',
    fusedAs:
      'A MEMBERS row plus three capabilities: s1cap.tuningRoute DRIVEN through /meta-context/api/tuning, s1cap.settingsSection ATTESTED to client.js:925, and s1cap.systemOneGate UNMEASURED with its reason, because its effect on the running agent is internal to the assembler and this surface cannot derive it.',
  },
]

/**
 * The capability registry — the parity DENOMINATOR.
 *
 * Every row is cited to the member's own source line. The rows are the union of
 * what the members publish as user-visible seams; a member capability that is
 * missing from this table is a parity hole, which is why the verify harness
 * asserts the row count against this constant rather than against itself.
 */
export const CAPABILITIES: readonly Capability[] = [
  // dsh-context-out-controller — routes.ts:227 dispatches `state`, :232 dispatches `set`.
  {
    id: 'ctxout.state',
    member: 'dsh-context-out-controller',
    kind: 'route',
    file: 'src/host/routes.ts',
    line: 227,
    identity: 'GET /context-out/api/state',
    status: 'driven',
    fusedPath: '/meta-context/api/caps',
  },
  {
    id: 'ctxout.set',
    member: 'dsh-context-out-controller',
    kind: 'route',
    file: 'src/host/routes.ts',
    line: 232,
    identity: 'POST /context-out/api/set',
    status: 'driven',
    fusedPath: '/meta-context/api/caps',
  },
  {
    id: 'ctxout.actuator',
    member: 'dsh-context-out-controller',
    kind: 'service',
    file: 'src/index.ts',
    line: 215,
    identity: 'agent/pre-step fold actuator, ledger surfaced by routes.ts:164 `folds`',
    status: 'driven',
    fusedPath: '/meta-context/api/caps',
  },
  {
    id: 'ctxout.composerCap',
    member: 'dsh-context-out-controller',
    kind: 'slot',
    file: 'src/client/index.tsx',
    line: 43,
    identity: 'slot conversation.input.right, id context-out-controller.cap (registered :71)',
    status: 'attested',
  },

  // dsh-context-stats — routes.ts:108/114/125 dispatch formation/status/folds; the fenced route is host/index.ts:262.
  {
    id: 'ctxstats.formation',
    member: 'dsh-context-stats',
    kind: 'route',
    file: 'src/host/routes.ts',
    line: 108,
    identity: 'GET /context-stats/api/formation',
    status: 'driven',
    fusedPath: '/meta-context/api/formation',
  },
  {
    id: 'ctxstats.status',
    member: 'dsh-context-stats',
    kind: 'route',
    file: 'src/host/routes.ts',
    line: 114,
    identity: 'GET /context-stats/api/status',
    status: 'driven',
    fusedPath: '/meta-context/api/status',
  },
  {
    id: 'ctxstats.folds',
    member: 'dsh-context-stats',
    kind: 'route',
    file: 'src/host/routes.ts',
    line: 125,
    identity: 'GET /context-stats/api/folds',
    status: 'driven',
    fusedPath: '/meta-context/api/folds',
  },
  {
    id: 'ctxstats.lvl1',
    member: 'dsh-context-stats',
    kind: 'fenced-route',
    file: 'src/host/index.ts',
    line: 262,
    identity: 'POST /api/dsh-context-stats/lvl1/status',
    status: 'unmeasured',
    reason:
      'Registered through ctx.connection.fetch, so it sits behind the harness authenticated /api fence. Its payload names loopback ports, what answered on them and resident process ids; proxying it onto this plugin open prefix would DE-FENCE host-internal topology. Reachable at its own path with a browser session; deliberately not reproduced here.',
  },
  {
    id: 'ctxstats.settingsSection',
    member: 'dsh-context-stats',
    kind: 'slot',
    file: 'src/client/index.tsx',
    line: 72,
    identity: 'slot settings.section, id dsh-context-stats, order 25 (:40, :54)',
    status: 'attested',
  },

  // dsh-fold-admission — src/index.ts:122 provides the service; the service calls decideAdmission at :79.
  {
    id: 'foldadm.service',
    member: 'dsh-fold-admission',
    kind: 'service',
    file: 'src/index.ts',
    line: 122,
    identity: 'ctx.provide(FOLD_ADMISSION_SERVICE) -> foldAdmissionGate',
    status: 'driven',
    fusedPath: '/meta-context/api/admission',
  },
  {
    id: 'foldadm.policy',
    member: 'dsh-fold-admission',
    kind: 'service',
    file: 'src/index.ts',
    line: 130,
    identity: 'decideAdmission / foldedFraction / breakEvenTurns, reached through the service (:79)',
    status: 'driven',
    fusedPath: '/meta-context/api/admission',
  },

  // dsh-context — the GUI seats it owns, plus the two host seams.
  {
    id: 'context.insightMain',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/insightPage.ts',
    line: 36,
    identity: 'keyed slot main, key dsh-context (INSIGHT_PANEL_ID, :15)',
    status: 'attested',
  },
  {
    id: 'context.sidebarRow',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/insightPage.ts',
    line: 40,
    identity: 'slot sidebar.panellist, id dsh-context, order 20 (:18)',
    status: 'attested',
  },
  {
    id: 'context.conversationTab',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/index.ts',
    line: 80,
    identity: 'slot conversation.view, id context, order 20',
    status: 'attested',
  },
  {
    id: 'context.rightPaneTab',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/sidebar.ts',
    line: 52,
    identity: 'slot sidebar.right.pane.tab, key SIDEBAR_CONTEXT_KIND',
    status: 'attested',
  },
  {
    id: 'context.fleetTab',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/fleetTab.ts',
    line: 26,
    identity: 'slot conversation.view (fleet), gated by its own preference',
    status: 'attested',
  },
  {
    id: 'context.pluginsConfigCard',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/index.ts',
    line: 145,
    identity: 'keyed slot plugins.bundle.config, key NS (dsh-context)',
    status: 'attested',
  },
  {
    id: 'context.slashTrigger',
    member: 'dsh-context',
    kind: 'trigger',
    file: 'src/client/command.ts',
    line: 17,
    identity: 'inputTriggers.registerSource, trigger "/", name context',
    status: 'attested',
  },
  {
    id: 'context.jumpButton',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/index.ts',
    line: 101,
    identity: 'chat-to-context jump button, own slot id (JUMP_ID)',
    status: 'attested',
  },
  {
    id: 'context.composerModal',
    member: 'dsh-context',
    kind: 'slot',
    file: 'src/client/index.ts',
    line: 111,
    identity: 'slot conversation.input.overlay, id context-modal, order 10',
    status: 'attested',
  },
  {
    id: 'context.sessionProjections',
    member: 'dsh-context',
    kind: 'projection',
    file: 'src/host/index.ts',
    line: 68,
    identity: 'ctx.sessionProjections.register x3 (timeline, headers, activity) + fallback trio (:58-:60)',
    status: 'attested',
  },
  {
    id: 'context.fencedRoutes',
    member: 'dsh-context',
    kind: 'fenced-route',
    file: 'src/host/detail.ts',
    line: 29,
    identity:
      'six ctx.connection.fetch POST routes: detail (:29), attachment (attachment.ts:32), fleet (fleet.ts:20), balance (balance.ts:23), skills (skills.ts:19), backfill (backfill.ts:31)',
    status: 'unmeasured',
    reason:
      'All six are behind the harness authenticated /api fence and each requires a live sessionId plus a browser session. Reproducing them on this plugin open prefix would de-fence per-session log reads. The member keeps them; this surface names them and does not proxy them.',
  },

  // s1cap — added 2026-10-26 on the census's C3 cluster; see REVERSED_EXCLUSIONS.
  {
    id: 's1cap.tuningRoute',
    member: 's1cap',
    kind: 'route',
    file: 'packages/dsh-plugin/src/index.ts',
    line: 2586,
    identity: 'GET /s1cap-7340 — the context-assembly knob readout',
    status: 'driven',
    fusedPath: '/meta-context/api/tuning',
  },
  {
    id: 's1cap.settingsSection',
    member: 's1cap',
    kind: 'slot',
    file: 'packages/dsh-plugin/src/client.js',
    line: 925,
    identity: "slot settings.section, id s1cap-config, order 30, label 'S1CAP'",
    status: 'attested',
  },
  {
    id: 's1cap.systemOneGate',
    member: 's1cap',
    kind: 'trigger',
    file: 'packages/dsh-plugin/src/index.ts',
    line: 1116,
    identity: 'the per-step System-1 context-size gate (inert unless config.enabled === true)',
    status: 'unmeasured',
    reason:
      'Its effect is a per-step decision INSIDE its own assembler: it decides how much context the running agent carries but publishes no readout of the decision this surface could derive, and it is inert on this profile by config (index.ts:1115-1118 returns before registering hooks, commands or System-1 calls). Reporting its knob VALUES (s1cap.tuningRoute) is not the same as reporting the GATE, and this surface will not present one as the other.',
  },
]

/** Counts by status over the registry. Every field carries its denominator. */
export interface ParityCensus {
  /** Rows the fused surface reproduces and derives live. */
  readonly driven: number
  /** Rows the member still owns and the fused surface publishes with a citation. */
  readonly attested: number
  /** Rows the fused surface cannot reproduce, each with a reason. */
  readonly unmeasured: number
  /**
   * UNMEASURED rows that carry NO reason.
   *
   * This is the field that makes rule (4) mechanical. An UNMEASURED row is
   * permitted — a capability that genuinely cannot be reproduced is reported,
   * not faked — but an UNMEASURED row with no reason is a SILENT ABSENCE wearing
   * the permitted label, and it turns the verdict into GAP.
   */
  readonly unreasoned: number
  /** `CAPABILITIES.length`. */
  readonly total: number
  /** When this census was taken. */
  readonly censusAt: string
}

/**
 * Count the registry.
 * @param now - the clock to stamp; injected so the harness can pin it.
 * @returns the census.
 */
export function censusOf(now: Date = new Date()): ParityCensus {
  let driven = 0
  let attested = 0
  let unmeasured = 0
  let unreasoned = 0
  for (const capability of CAPABILITIES) {
    if (capability.status === 'driven') driven += 1
    else if (capability.status === 'attested') attested += 1
    else {
      unmeasured += 1
      const reason = capability.reason
      if (reason === undefined || reason.trim() === '') unreasoned += 1
    }
  }
  return { driven, attested, unmeasured, unreasoned, total: CAPABILITIES.length, censusAt: now.toISOString() }
}

/** The parity verdict over a census. */
export type ParityVerdict = 'PARITY' | 'GAP' | 'BLINDED'

/**
 * The one decision the parity harness makes.
 *
 * Three outcomes, and each is a guard this program has paid for:
 *
 *  - `BLINDED` when the denominator is zero. An instrument that cannot see its
 *    subject must not report a clean zero; `0/0` is a failure of the instrument,
 *    never a pass.
 *  - `GAP` when the statuses do not sum to the denominator (a row is in no
 *    bucket, which means the counting code and the registry disagree), or when an
 *    UNMEASURED row carries no reason (rule 4's silent absence).
 *  - `PARITY` otherwise. Note what this does NOT say: it does not say every row
 *    is `driven`. An UNMEASURED row WITH a reason is an accounted-for capability,
 *    which is exactly what rule (4) asks for; the count of them travels in the
 *    census so a reader can see how much of the fusion is reproduced versus
 *    merely published.
 * @param census - the census to judge.
 * @returns the verdict.
 */
export function parityVerdict(census: ParityCensus): ParityVerdict {
  if (census.total === 0) return 'BLINDED'
  const accounted = census.driven + census.attested + census.unmeasured
  if (accounted !== census.total) return 'GAP'
  if (census.unreasoned > 0) return 'GAP'
  return 'PARITY'
}

/** Which member each registry row belongs to, and how many each contributes. */
export interface MemberParity {
  /** The member name. */
  readonly member: string
  /** Rows for this member. */
  readonly total: number
  /** Driven rows for this member. */
  readonly driven: number
  /** Attested rows for this member. */
  readonly attested: number
  /** Unmeasured rows for this member. */
  readonly unmeasured: number
}

/**
 * Regroup the registry by member so a reader can see WHICH member lost a
 * capability, rather than only that the total moved.
 * @returns one row per member in `MEMBERS` order.
 */
export function parityByMember(): MemberParity[] {
  return MEMBERS.map(member => {
    const rows = CAPABILITIES.filter(capability => capability.member === member.name)
    return {
      member: member.name,
      total: rows.length,
      driven: rows.filter(row => row.status === 'driven').length,
      attested: rows.filter(row => row.status === 'attested').length,
      unmeasured: rows.filter(row => row.status === 'unmeasured').length,
    }
  })
}

/** How a composed member read turned out. */
export type ComposeOutcome = 'ok' | 'unmeasured'

/**
 * One composed member reading.
 *
 * `value` is present exactly when `outcome` is `ok`. It is ABSENT otherwise —
 * never `null`, never `{}`, never `0` — because this program has published
 * wrong numbers three times by letting a missing value stand in for a zero.
 */
export interface ComposedRead {
  /** Whether the member answered. */
  readonly outcome: ComposeOutcome
  /** The member route that was called. */
  readonly upstream: string
  /** The member's HTTP status, or null when no response was received at all. */
  readonly status: number | null
  /** The member's payload, present only on `ok`. */
  readonly value?: unknown
  /** Why it is UNMEASURED. Present only on `unmeasured`. */
  readonly reason?: string
  /** Round-trip duration in ms. */
  readonly elapsedMs: number
}

/** `GET /meta-context/api` — the fused index. */
export interface IndexResponse {
  readonly ok: true
  /** This surface's prefix, so a reader can find the routes from one call. */
  readonly prefix: string
  /** The one sidebar seat this plugin registers. */
  readonly sidebar: { readonly slot: string; readonly id: string; readonly order: number; readonly panel: string }
  /** The members of the fusion, in table order. */
  readonly members: readonly Member[]
  /** The capabilities this surface cannot reproduce, always present even when empty. */
  readonly excluded: readonly Exclusion[]
  /** Verdicts this surface held and then overturned, so the question cannot vanish. */
  readonly reversed: readonly ReversedExclusion[]
  /** The parity census. */
  readonly parity: ParityCensus
  /** The verdict derived from it. */
  readonly verdict: ParityVerdict
  /** Per-member counts. */
  readonly byMember: readonly MemberParity[]
  /** The routes this surface serves, derived from its own dispatch table. */
  readonly routes: readonly string[]
  /** When this index was assembled. */
  readonly censusAt: string
}

/** `GET /meta-context/api/parity` — the registry itself, so it is auditable. */
export interface ParityResponse {
  readonly ok: true
  readonly census: ParityCensus
  readonly verdict: ParityVerdict
  readonly byMember: readonly MemberParity[]
  readonly capabilities: readonly Capability[]
  /** Members present in the registry but absent from `MEMBERS` — a structural GAP. */
  readonly orphanMembers: readonly string[]
}

/** `GET /meta-context/api/caps` — the composed ceiling surface. */
export interface CapsResponse {
  readonly ok: true
  /** The scopes the member accepts. Present only when the member answered. */
  readonly scopes?: readonly string[]
  /** The cap modes the member offers, verbatim. */
  readonly modes?: readonly string[]
  /** The policy in force, verbatim from the member. */
  readonly policy?: unknown
  /** Run-scoped session ids the member holds a cap for. */
  readonly runKeys?: readonly string[]
  /** The live reading for the named session, verbatim from the member. */
  readonly reading?: unknown
  /** The composed member read; `unmeasured` here means the member did not answer. */
  readonly source: ComposedRead
}

/** `GET /meta-context/api/admission` — the gate, driven in process. */
export interface AdmissionResponse {
  readonly ok: true
  /** Whether the foldAdmissionGate service is registered at all. */
  readonly servicePresent: boolean
  /** The verdict the gate returned, verbatim. */
  readonly verdict?: unknown
  /** The probe request that was handed to the gate. */
  readonly probe?: { readonly sessionId: string; readonly pricedTokens: number; readonly retainTokens: number }
  /** Why it is UNMEASURED. Present only when the service is absent or the call threw. */
  readonly reason?: string
}
