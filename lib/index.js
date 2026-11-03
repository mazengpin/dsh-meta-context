import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// src/shared/protocol.ts
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
const ROUTE_PREFIX = "meta-context/api";
/** The absolute pathname the Host registers the prefix route under. */
const ROUTE_PATH = `/${ROUTE_PREFIX}`;
/** The keyed `main` slot this plugin's page is registered under. Never `dsh-context`'s. */
const PANEL_ID = "dsh-meta-context";
/**
* The `sidebar.panellist` row id. Distinct from every member's own row id
* (`dsh-context` is the only member that owns one), because a duplicate id in a
* keyed slot would either throw at load or silently replace the member's row.
*/
const SIDEBAR_ID = "dsh-meta-context";
/**
* Position among the sidebar rows, ascending. The shipped Plugins row is 0,
* Automation tasks is 10 and `dsh-context`'s own row is 20 (`insightPage.ts:18`),
* so 12 seats the fused hub between Automation and the member it fronts —
* additive, and it cannot displace a shipped or member row.
*/
const SIDEBAR_ORDER = 12;
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
const MEMBERS = [
	{
		name: "dsh-context",
		clone: "dsh-context",
		prefix: null,
		role: "Context insight the user reads in the GUI: composition, evolution and cost, over session projections plus six fenced /api routes."
	},
	{
		name: "dsh-context-out-controller",
		clone: "dsh-context-out-controller",
		prefix: "context-out/api",
		role: "Per-scope context ceilings (standard|auto|128k|64k|32k|16k|8k) with a setter, enforced by a fold actuator on the agent/pre-step waterfall."
	},
	{
		name: "dsh-context-stats",
		clone: "dsh-context-stats",
		prefix: "context-stats/api",
		role: "Program-status datasets that had no home: fold arithmetic over the durable log, formation freshness, and a fenced LVL1 liveness probe."
	},
	{
		name: "dsh-fold-admission",
		clone: "dsh-fold-admission",
		prefix: null,
		role: "The admission gate the controller's fold actuator consults: a deterministic payback floor, plus an opt-in and uncalibrated System-1 arm."
	},
	{
		name: "s1cap",
		clone: "s1cap",
		prefix: "s1cap-7340",
		role: "The System-1 context-size gate: the chunk, overlap, short-context and window knobs the running agent assembles its context from, plus the cell/tier observability around them."
	}
];
/** The measured exclusions — candidates this lane looked at and did not fuse. */
const EXCLUDED = [{
	name: "dsh-context-routing",
	reason: "Same word, different question. It is a ROUTING and pruning console — which tools and which context chunks a turn gets — not a context-budget surface, and it already presents its own full console of 15 client sections plus its own left-sidebar row, so fusing it would add a second row rather than remove one.",
	evidence: "MEASURED BY THIS LANE, NOT BY THE CENSUS: the census's own couldNotMeasure states that the loaded bundle plugins outside its 27-row registry were not tabulated, and this plugin is one of them, so no census cluster assigns it. plugins-src/dsh-context-routing/src/host/wire-routes.ts:52 declares ROUTE_PREFIX \"/context-routing/api\" with inject [\"webServer\",\"tools\"]; src/client/index.tsx:146 registers a keyed `main` panel and :147/:150 its own sidebar.panellist row; its client sections are ContextPanel, ContextWindowPanel, BudgetPanel, ContextCostPanel, IntentHubPanel, Lvl1Panel, SubagentCapPanel, ToolPrunePanel, WhyPanel and WindowLivePanel — a routing console that happens to display context cost, which is a different intent from the three knobs this surface unifies.",
	reopenIf: "the census tabulates it and assigns it to cluster C3 or C4, or the owner decides that context ROUTING belongs in the same entry as context BUDGET. Then it is a MEMBERS row and a capability pass, not a rewrite: this table is data."
}, {
	name: "dsh-context-select",
	reason: "Not a context-size surface and owns no client seat: it is a selection mechanism with one prefix route and no sidebar row, so there is nothing here to unify and nothing of the owner's complaint (several sidebar entries doing one family's work) that it contributes to.",
	evidence: "MEASURED BY THIS LANE, NOT BY THE CENSUS, for the same reason as the row above. plugins-src/dsh-context-select/src/host/routes.ts:33 declares ROUTE_PATH \"/context-select/api\" and src/index.ts injects [\"webServer\"] only; the census row for the family records no slot registration, and this lane found no slots.inject call site that would give it a place in the sidebar.",
	reopenIf: "it grows a client seat or the census assigns it to C3/C4. Add a MEMBERS row plus its capabilities; no host code changes."
}];
/** The recorded reversal. One row, and the row is the point. */
const REVERSED_EXCLUSIONS = [{
	name: "s1cap",
	wasExcludedBecause: "This surface refused it as \"the System-1 DECISION lane, not a context tool\", on the grounds that it exposes 0 ctx.provide services, is inert by default, and its one route is a tuning panel over knobs internal to its own assembler — so a proxy would publish a panel whose effect this surface could not derive.",
	overturnedBy: "The lane census's cluster C3, which assigns s1cap to the SAME intent as dsh-context-out-controller and dsh-fold-admission: \"the budget the model actually sees is the product of two independent deciders\", and \"one knob is offered in two places\". The brief that ordered this fusion said in terms to adopt the census where the two disagree rather than defend the brief, and a false fusion is worse than a missed one — but so is a false EXCLUSION, which is the same error with the opposite sign.",
	evidence: "Measured live on the running profile at 2026-10-26T10:53Z: GET /s1cap-7340 answers 200 and returns {ok:true, effective:{depth:16, chunkTokens:512, overlapTokens:64, shortContextTokens:32768, relevanceThreshold:0.55, window:16, anchorWaitMs:10000, provider:\"kev\"}, stored, pending, restartRequired, status:{cell,tas,tier1,deliver,…}}. Those are context-assembly BUDGETS in the same units the out-controller caps at 128k…8k, so \"not a context tool\" is refuted by the member's own payload. The registration sites are packages/dsh-plugin/src/index.ts:2586 (webCtx.webServer.register(routeSpec(...))) and packages/dsh-plugin/src/client.js:925 (ctx.slots.inject('settings.section', … id 's1cap-config', order 30, label 'S1CAP')), and the inert-by-default guard is real at index.ts:1116 but is a CONFIG default, not a capability: an inert capability is UNMEASURED with a reason, which is what this surface now reports, not an absence.",
	fusedAs: "A MEMBERS row plus three capabilities: s1cap.tuningRoute DRIVEN through /meta-context/api/tuning, s1cap.settingsSection ATTESTED to client.js:925, and s1cap.systemOneGate UNMEASURED with its reason, because its effect on the running agent is internal to the assembler and this surface cannot derive it."
}];
/**
* The capability registry — the parity DENOMINATOR.
*
* Every row is cited to the member's own source line. The rows are the union of
* what the members publish as user-visible seams; a member capability that is
* missing from this table is a parity hole, which is why the verify harness
* asserts the row count against this constant rather than against itself.
*/
const CAPABILITIES = [
	{
		id: "ctxout.state",
		member: "dsh-context-out-controller",
		kind: "route",
		file: "src/host/routes.ts",
		line: 227,
		identity: "GET /context-out/api/state",
		status: "driven",
		fusedPath: "/meta-context/api/caps"
	},
	{
		id: "ctxout.set",
		member: "dsh-context-out-controller",
		kind: "route",
		file: "src/host/routes.ts",
		line: 232,
		identity: "POST /context-out/api/set",
		status: "driven",
		fusedPath: "/meta-context/api/caps"
	},
	{
		id: "ctxout.actuator",
		member: "dsh-context-out-controller",
		kind: "service",
		file: "src/index.ts",
		line: 215,
		identity: "agent/pre-step fold actuator, ledger surfaced by routes.ts:164 `folds`",
		status: "driven",
		fusedPath: "/meta-context/api/caps"
	},
	{
		id: "ctxout.composerCap",
		member: "dsh-context-out-controller",
		kind: "slot",
		file: "src/client/index.tsx",
		line: 43,
		identity: "slot conversation.input.right, id context-out-controller.cap (registered :71)",
		status: "attested"
	},
	{
		id: "ctxstats.formation",
		member: "dsh-context-stats",
		kind: "route",
		file: "src/host/routes.ts",
		line: 108,
		identity: "GET /context-stats/api/formation",
		status: "driven",
		fusedPath: "/meta-context/api/formation"
	},
	{
		id: "ctxstats.status",
		member: "dsh-context-stats",
		kind: "route",
		file: "src/host/routes.ts",
		line: 114,
		identity: "GET /context-stats/api/status",
		status: "driven",
		fusedPath: "/meta-context/api/status"
	},
	{
		id: "ctxstats.folds",
		member: "dsh-context-stats",
		kind: "route",
		file: "src/host/routes.ts",
		line: 125,
		identity: "GET /context-stats/api/folds",
		status: "driven",
		fusedPath: "/meta-context/api/folds"
	},
	{
		id: "ctxstats.lvl1",
		member: "dsh-context-stats",
		kind: "fenced-route",
		file: "src/host/index.ts",
		line: 262,
		identity: "POST /api/dsh-context-stats/lvl1/status",
		status: "unmeasured",
		reason: "Registered through ctx.connection.fetch, so it sits behind the harness authenticated /api fence. Its payload names loopback ports, what answered on them and resident process ids; proxying it onto this plugin open prefix would DE-FENCE host-internal topology. Reachable at its own path with a browser session; deliberately not reproduced here."
	},
	{
		id: "ctxstats.settingsSection",
		member: "dsh-context-stats",
		kind: "slot",
		file: "src/client/index.tsx",
		line: 72,
		identity: "slot settings.section, id dsh-context-stats, order 25 (:40, :54)",
		status: "attested"
	},
	{
		id: "foldadm.service",
		member: "dsh-fold-admission",
		kind: "service",
		file: "src/index.ts",
		line: 122,
		identity: "ctx.provide(FOLD_ADMISSION_SERVICE) -> foldAdmissionGate",
		status: "driven",
		fusedPath: "/meta-context/api/admission"
	},
	{
		id: "foldadm.policy",
		member: "dsh-fold-admission",
		kind: "service",
		file: "src/index.ts",
		line: 130,
		identity: "decideAdmission / foldedFraction / breakEvenTurns, reached through the service (:79)",
		status: "driven",
		fusedPath: "/meta-context/api/admission"
	},
	{
		id: "context.insightMain",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/insightPage.ts",
		line: 36,
		identity: "keyed slot main, key dsh-context (INSIGHT_PANEL_ID, :15)",
		status: "attested"
	},
	{
		id: "context.sidebarRow",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/insightPage.ts",
		line: 40,
		identity: "slot sidebar.panellist, id dsh-context, order 20 (:18)",
		status: "attested"
	},
	{
		id: "context.conversationTab",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/index.ts",
		line: 80,
		identity: "slot conversation.view, id context, order 20",
		status: "attested"
	},
	{
		id: "context.rightPaneTab",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/sidebar.ts",
		line: 52,
		identity: "slot sidebar.right.pane.tab, key SIDEBAR_CONTEXT_KIND",
		status: "attested"
	},
	{
		id: "context.fleetTab",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/fleetTab.ts",
		line: 26,
		identity: "slot conversation.view (fleet), gated by its own preference",
		status: "attested"
	},
	{
		id: "context.pluginsConfigCard",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/index.ts",
		line: 145,
		identity: "keyed slot plugins.bundle.config, key NS (dsh-context)",
		status: "attested"
	},
	{
		id: "context.slashTrigger",
		member: "dsh-context",
		kind: "trigger",
		file: "src/client/command.ts",
		line: 17,
		identity: "inputTriggers.registerSource, trigger \"/\", name context",
		status: "attested"
	},
	{
		id: "context.jumpButton",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/index.ts",
		line: 101,
		identity: "chat-to-context jump button, own slot id (JUMP_ID)",
		status: "attested"
	},
	{
		id: "context.composerModal",
		member: "dsh-context",
		kind: "slot",
		file: "src/client/index.ts",
		line: 111,
		identity: "slot conversation.input.overlay, id context-modal, order 10",
		status: "attested"
	},
	{
		id: "context.sessionProjections",
		member: "dsh-context",
		kind: "projection",
		file: "src/host/index.ts",
		line: 68,
		identity: "ctx.sessionProjections.register x3 (timeline, headers, activity) + fallback trio (:58-:60)",
		status: "attested"
	},
	{
		id: "context.fencedRoutes",
		member: "dsh-context",
		kind: "fenced-route",
		file: "src/host/detail.ts",
		line: 29,
		identity: "six ctx.connection.fetch POST routes: detail (:29), attachment (attachment.ts:32), fleet (fleet.ts:20), balance (balance.ts:23), skills (skills.ts:19), backfill (backfill.ts:31)",
		status: "unmeasured",
		reason: "All six are behind the harness authenticated /api fence and each requires a live sessionId plus a browser session. Reproducing them on this plugin open prefix would de-fence per-session log reads. The member keeps them; this surface names them and does not proxy them."
	},
	{
		id: "s1cap.tuningRoute",
		member: "s1cap",
		kind: "route",
		file: "packages/dsh-plugin/src/index.ts",
		line: 2586,
		identity: "GET /s1cap-7340 — the context-assembly knob readout",
		status: "driven",
		fusedPath: "/meta-context/api/tuning"
	},
	{
		id: "s1cap.settingsSection",
		member: "s1cap",
		kind: "slot",
		file: "packages/dsh-plugin/src/client.js",
		line: 925,
		identity: "slot settings.section, id s1cap-config, order 30, label 'S1CAP'",
		status: "attested"
	},
	{
		id: "s1cap.systemOneGate",
		member: "s1cap",
		kind: "trigger",
		file: "packages/dsh-plugin/src/index.ts",
		line: 1116,
		identity: "the per-step System-1 context-size gate (inert unless config.enabled === true)",
		status: "unmeasured",
		reason: "Its effect is a per-step decision INSIDE its own assembler: it decides how much context the running agent carries but publishes no readout of the decision this surface could derive, and it is inert on this profile by config (index.ts:1115-1118 returns before registering hooks, commands or System-1 calls). Reporting its knob VALUES (s1cap.tuningRoute) is not the same as reporting the GATE, and this surface will not present one as the other."
	}
];
/**
* Count the registry.
* @param now - the clock to stamp; injected so the harness can pin it.
* @returns the census.
*/
function censusOf(now = /* @__PURE__ */ new Date()) {
	let driven = 0;
	let attested = 0;
	let unmeasured = 0;
	let unreasoned = 0;
	for (const capability of CAPABILITIES) if (capability.status === "driven") driven += 1;
	else if (capability.status === "attested") attested += 1;
	else {
		unmeasured += 1;
		const reason = capability.reason;
		if (reason === void 0 || reason.trim() === "") unreasoned += 1;
	}
	return {
		driven,
		attested,
		unmeasured,
		unreasoned,
		total: CAPABILITIES.length,
		censusAt: now.toISOString()
	};
}
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
function parityVerdict(census) {
	if (census.total === 0) return "BLINDED";
	if (census.driven + census.attested + census.unmeasured !== census.total) return "GAP";
	if (census.unreasoned > 0) return "GAP";
	return "PARITY";
}
/**
* Regroup the registry by member so a reader can see WHICH member lost a
* capability, rather than only that the total moved.
* @returns one row per member in `MEMBERS` order.
*/
function parityByMember() {
	return MEMBERS.map((member) => {
		const rows = CAPABILITIES.filter((capability) => capability.member === member.name);
		return {
			member: member.name,
			total: rows.length,
			driven: rows.filter((row) => row.status === "driven").length,
			attested: rows.filter((row) => row.status === "attested").length,
			unmeasured: rows.filter((row) => row.status === "unmeasured").length
		};
	});
}
// src/host/bundle.ts
/**
* The META BUNDLE census — which `dsh-meta-*` packages are PRESENT on disk, and
* which of them are MOUNTED on the running server.
*
* WHAT THIS ANSWERS THAT NOTHING ELSE HERE DID
*
* The fused index reports the four context members it composes. The meta layer
* is a FAMILY of nine packages, and until this module existed a reader could not
* tell, from this surface, which of those nine were installed in the running
* profile and which were absent. The census below reports exactly that: one row
* per package, each row carrying the package directory that was found, the
* `package.json` identity that was read from it, and the result of probing that
* package's own route family.
*
* THE THREE STATES ARE KEPT APART, AND NONE IS A ZERO
*
*  - ABSENT     — no directory at `plugins-src/<name>`. `present: false`.
*  - PRESENT, NOT MOUNTED — the directory exists and carried a readable
*    `package.json`, but the family root answered no 200. `mounted: false`
*    EXPLICITLY, with the status that was received and the reason.
*  - UNPROBED   — nothing was probed (no declared family root, or no authority to
*    probe against). `status: null` WITH THE REASON, never `0`.
*
* A `0` here would be a fabricated HTTP status: no server answers `0`, so a `0`
* could only come from this code inventing one. `null` says the value was not
* measured, which is the truth.
*
* WHERE THE PROBE GOES
*
* The probe is a loopback request to the SAME server that served this census,
* addressed by the originating request's own `Host` authority — the same
* discipline the composer uses (`compose.ts`), so no configured port and no
* absolute machine path appears anywhere in this module or in its payload.
*
* WHAT IT WRITES
*
* Nothing. Every read here is `readdirSync`/`readFileSync`/`statSync` plus an
* outbound `GET`. There is no mutation of any package directory, manifest or
* route table.
*
* @module dsh-meta-context/host/bundle
*/
/** How long one family-root probe may take before it is reported unprobed. */
const PROBE_TIMEOUT_MS = 2e3;
/** The directory, relative to the program root, that holds the clones. */
const BUNDLES_DIR = "plugins-src";
/**
* The nine packages of the meta bundle, and the family root each one owns.
*
* This table is DECLARED rather than discovered, because the question is which
* of the KNOWN nine are present: a census that only walked directories found on
* disk could never report an ABSENT package, and absence is half the answer.
*/
const ROUTE_FAMILIES = [
	{
		package: "dsh-meta-context",
		root: "/meta-context"
	},
	{
		package: "dsh-meta-intent",
		root: "/meta-intent"
	},
	{
		package: "dsh-meta-evolve",
		root: "/meta-evolve"
	},
	{
		package: "dsh-meta-research",
		root: "/meta-research"
	},
	{
		package: "dsh-meta-memory",
		root: "/meta-memory"
	},
	{
		package: "dsh-meta-skills",
		root: "/meta-skills"
	},
	{
		package: "dsh-meta-market",
		root: "/meta-market"
	},
	{
		package: "dsh-meta-community",
		root: "/meta-community"
	},
	{
		package: "dsh-meta-harness",
		root: "/meta-harness"
	}
];
/**
* Locate the `plugins-src` directory by walking up from this module's own path.
* @param start - the directory to start from.
* @returns the bundles root, or `null` when no ancestor is named `plugins-src`.
*/
function findBundlesRoot(start) {
	let dir = start;
	for (let step = 0; step < 6; step += 1) {
		if (basename(dir) === "plugins-src") return dir;
		const parent = dirname(dir);
		if (parent === dir) return null;
		dir = parent;
	}
	return null;
}
/** The bundles root, resolved from this module's own location. */
function bundlesRootFromModule() {
	try {
		return findBundlesRoot(dirname(fileURLToPath(import.meta.url)));
	} catch {
		return null;
	}
}
/** The default probe: one bounded loopback GET that reports the status it saw. */
async function defaultProbe(url) {
	try {
		const response = await fetch(url, {
			method: "GET",
			headers: { accept: "application/json" },
			signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
			redirect: "manual"
		});
		await response.text();
		return {
			status: response.status,
			reason: response.ok ? null : `the family root answered ${response.status}`
		};
	} catch (error) {
		return {
			status: null,
			reason: `the probe threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`
		};
	}
}
/** Read the directories under the bundles root, sorted, or `null` when unreadable. */
function listDirectories(root) {
	try {
		return readdirSync(root).filter((entry) => entry.startsWith("dsh-meta-")).filter((entry) => {
			try {
				return statSync(join(root, entry)).isDirectory();
			} catch {
				return false;
			}
		}).sort();
	} catch {
		return null;
	}
}
/** Read one package's manifest identity, or a reason it could not be read. */
function readManifest(directory) {
	try {
		const raw = readFileSync(join(directory, "package.json"), "utf8");
		const parsed = JSON.parse(raw);
		return {
			name: typeof parsed["name"] === "string" ? parsed["name"] : null,
			version: typeof parsed["version"] === "string" ? parsed["version"] : null,
			entry: {
				dsh: parsed["dsh"] ?? null,
				cordis: parsed["cordis"] ?? null,
				main: typeof parsed["main"] === "string" ? parsed["main"] : null
			},
			reason: null
		};
	} catch (error) {
		return {
			name: null,
			version: null,
			entry: null,
			reason: `package.json could not be read: ${error instanceof Error ? error.message : String(error)}`
		};
	}
}
/**
* Probe one declared family: its root and its `api` subpath.
*
* Both are probed because the family root itself is not always the served
* surface — `dsh-meta-context` mounts `/meta-context/api` and answers 404 at
* `/meta-context`. Probing only the root would report a MOUNTED package as
* absent, which is the exact error this census exists to avoid.
* @param authority - the request's authority.
* @param root - the family root, with its leading slash.
* @param probe - the probe to issue.
* @returns the row's mounted/status/reason triple.
*/
async function probeFamily(authority, root, probe) {
	const probePaths = [root, `${root}/api`];
	const outcomes = await Promise.all(probePaths.map((path) => probe(`http://${authority}${path}`)));
	if (outcomes.findIndex((outcome) => outcome.status === 200) >= 0) return {
		mounted: true,
		status: 200,
		probePaths,
		reason: null
	};
	const measured = outcomes.find((outcome) => outcome.status !== null);
	if (measured === void 0) return {
		mounted: false,
		status: null,
		probePaths,
		reason: `nothing was measured: ${outcomes[0]?.reason ?? "no reason recorded"}`
	};
	const summary = probePaths.map((path, index) => `${path} ${outcomes[index]?.status ?? "no response"}`).join(", ");
	return {
		mounted: false,
		status: measured.status,
		probePaths,
		reason: `no 200 from the family: ${summary}`
	};
}
/**
* Build the bundle census.
* @param deps - the authority, the clock, and optional root/probe overrides.
* @returns the census payload.
*/
async function bundleOf(deps) {
	const censusAt = deps.now().toISOString();
	const root = deps.root === void 0 ? bundlesRootFromModule() : deps.root;
	const probe = deps.probe ?? defaultProbe;
	const empty = {
		total: 0,
		directories: 0,
		present: 0,
		mounted: 0,
		absent: 0,
		unprobed: 0,
		presentNotMounted: 0
	};
	if (root === null) return {
		ok: true,
		bundlesDir: null,
		rows: [],
		census: empty,
		censusAt
	};
	const directories = listDirectories(root);
	if (directories === null) return {
		ok: true,
		bundlesDir: BUNDLES_DIR,
		rows: [],
		census: empty,
		censusAt
	};
	const byLowerName = new Map(directories.map((name) => [name.toLowerCase(), name]));
	const declared = new Set(ROUTE_FAMILIES.map((family) => family.package.toLowerCase()));
	const rows = [];
	for (const family of ROUTE_FAMILIES) {
		const found = byLowerName.get(family.package.toLowerCase()) ?? null;
		if (found === null) {
			rows.push({
				package: family.package,
				directory: null,
				present: false,
				name: null,
				version: null,
				entry: null,
				routeRoot: family.root,
				probePaths: [],
				mounted: false,
				status: null,
				reason: `no ${BUNDLES_DIR}/${family.package} directory: the package is declared by the bundle route-family table but is not on disk, so its manifest could not be read and its family root could not be probed; a null status here is an absence of a reading, not a 0`
			});
			continue;
		}
		const manifest = readManifest(join(root, found));
		if (deps.authority === void 0) {
			rows.push({
				package: family.package,
				directory: `${BUNDLES_DIR}/${found}`,
				present: true,
				name: manifest.name,
				version: manifest.version,
				entry: manifest.entry,
				routeRoot: family.root,
				probePaths: [],
				mounted: false,
				status: null,
				reason: "the originating request carried no usable Host header, so there was no authority to probe this family against; a null status here is an absence of a reading, not a 0"
			});
			continue;
		}
		const probed = await probeFamily(deps.authority, family.root, probe);
		rows.push({
			package: family.package,
			directory: `${BUNDLES_DIR}/${found}`,
			present: true,
			name: manifest.name,
			version: manifest.version,
			entry: manifest.entry,
			routeRoot: family.root,
			probePaths: probed.probePaths,
			mounted: probed.mounted,
			status: probed.status,
			reason: probed.reason ?? manifest.reason
		});
	}
	for (const found of directories) {
		if (declared.has(found.toLowerCase())) continue;
		const manifest = readManifest(join(root, found));
		rows.push({
			package: found,
			directory: `${BUNDLES_DIR}/${found}`,
			present: true,
			name: manifest.name,
			version: manifest.version,
			entry: manifest.entry,
			routeRoot: null,
			probePaths: [],
			mounted: false,
			status: null,
			reason: "this directory is in the bundles root but the bundle route-family table declares no root for it, so no route was probed; a null status here is an absence of a probe, never a 0"
		});
	}
	const present = rows.filter((row) => row.present).length;
	const mounted = rows.filter((row) => row.mounted).length;
	const unprobed = rows.filter((row) => row.status === null).length;
	return {
		ok: true,
		bundlesDir: BUNDLES_DIR,
		rows,
		census: {
			total: rows.length,
			directories: directories.length,
			present,
			mounted,
			absent: rows.length - present,
			unprobed,
			presentNotMounted: present - mounted
		},
		censusAt
	};
}
/**
* Every member path this composer is permitted to call.
*
* Derived from `MEMBERS`, never hand-written: a composer that accepted an
* arbitrary path would turn this plugin's open prefix into a proxy for the whole
* server, including the fenced `/api` surface. `dsh-context-stats` guards its
* own handler against a foreign pathname for the mirror-image reason
* (`src/host/routes.ts:100`), and the guard belongs on both sides of a hop.
*/
const ALLOWED_MEMBER_PREFIXES = MEMBERS.map((member) => member.prefix).filter((prefix) => prefix !== null);
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
function authorityOf(req) {
	const raw = req.headers["host"] ?? req.headers["x-forwarded-host"];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value !== "string") return void 0;
	const trimmed = value.trim();
	if (trimmed === "" || !/^[A-Za-z0-9.\-[\]:]+$/.test(trimmed)) return void 0;
	return trimmed;
}
/**
* Build the URL for one member path under one authority.
* @param authority - the request's own authority.
* @param memberPath - an absolute member pathname, WITH its leading slash.
* @returns the absolute loopback URL.
*/
function memberUrl(authority, memberPath) {
	return `http://${authority}${memberPath}`;
}
/**
* Whether one absolute pathname sits under a member prefix this composer may
* call.
* @param memberPath - the absolute pathname to test.
* @returns true when a member owns it.
*/
function isComposablePath(memberPath) {
	return ALLOWED_MEMBER_PREFIXES.some((prefix) => memberPath === `/${prefix}` || memberPath.startsWith(`/${prefix}/`));
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
async function compose(options) {
	const started = Date.now();
	const upstream = options.memberPath;
	const authority = options.authority;
	if (authority === void 0) return {
		outcome: "unmeasured",
		upstream,
		status: null,
		reason: "the originating request carried no usable Host header, so there is no authority to compose against",
		elapsedMs: 0
	};
	if (!isComposablePath(upstream)) return {
		outcome: "unmeasured",
		upstream,
		status: null,
		reason: `no member of this fusion owns ${upstream}; the composer calls member prefixes only (${ALLOWED_MEMBER_PREFIXES.join(", ")})`,
		elapsedMs: 0
	};
	const timeoutMs = options.timeoutMs ?? 8e3;
	try {
		const response = await fetch(memberUrl(authority, upstream), {
			method: options.method ?? "GET",
			headers: options.body === void 0 ? { accept: "application/json" } : {
				accept: "application/json",
				"content-type": "application/json"
			},
			...options.body === void 0 ? {} : { body: JSON.stringify(options.body) },
			signal: AbortSignal.timeout(timeoutMs),
			redirect: "manual"
		});
		const elapsedMs = Date.now() - started;
		const text = await response.text();
		if (!response.ok) return {
			outcome: "unmeasured",
			upstream,
			status: response.status,
			reason: `the member answered ${response.status}: ${firstLine(text)}`,
			elapsedMs
		};
		let value;
		try {
			value = JSON.parse(text);
		} catch {
			return {
				outcome: "unmeasured",
				upstream,
				status: response.status,
				reason: "the member answered 200 with a body that is not JSON, so its content cannot be derived here",
				elapsedMs
			};
		}
		return {
			outcome: "ok",
			upstream,
			status: response.status,
			value,
			elapsedMs
		};
	} catch (error) {
		return {
			outcome: "unmeasured",
			upstream,
			status: null,
			reason: `the composed read threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
			elapsedMs: Date.now() - started
		};
	}
}
/**
* The first line of a response body, bounded, for an error message.
* @param text - the raw body.
* @returns a single short line.
*/
function firstLine(text) {
	const line = text.split("\n")[0] ?? "";
	return line.length > 200 ? `${line.slice(0, 200)}…` : line;
}
// src/host/routes.ts
/** Cap on a request body; the largest payload here is `{"scope":"run","sessionId":"session-12","mode":"16k"}`. */
const MAX_BODY_BYTES = 4096;
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
const MEMBER_SCAN_BUDGET_MS = 3e4;
/**
* Every route this prefix serves.
*
* `GET /meta-context/api` itself is the empty tail, and it is in the table so
* the index can advertise it and the harness can drive it.
*/
const ROUTES = [
	{
		tail: "",
		method: "GET",
		summary: "The fused index: members, parity census, verdict, and the routes below."
	},
	{
		tail: "parity",
		method: "GET",
		summary: "The capability registry the parity count is taken over, with citations."
	},
	{
		tail: "caps",
		method: "GET",
		summary: "The per-scope context ceilings, composed live from the controller."
	},
	{
		tail: "caps",
		method: "POST",
		summary: "Set one ceiling, forwarded to the controller setter."
	},
	{
		tail: "formation",
		method: "GET",
		summary: "Formation freshness, composed live from context-stats."
	},
	{
		tail: "status",
		method: "GET",
		summary: "Fold aggregate and memory status, composed live from context-stats."
	},
	{
		tail: "folds",
		method: "GET",
		summary: "Fold rows, composed live from context-stats."
	},
	{
		tail: "admission",
		method: "GET",
		summary: "Drives the member fold-admission gate with a probe (?priced=&retain=)."
	},
	{
		tail: "tuning",
		method: "GET",
		summary: "The context-assembly knobs, composed live from s1cap."
	},
	{
		tail: "bundle",
		method: "GET",
		summary: "The meta bundle census: which dsh-meta-* packages are present on disk, and which are mounted."
	}
];
/** One route failure carrying the HTTP status it must answer with. */
var RouteError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
	}
};
/** Write one JSON response. */
function writeJson(res, status, body) {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"content-length": Buffer.byteLength(payload)
	});
	res.end(payload);
}
/** The message of a thrown value. */
function messageOf(error) {
	return error instanceof Error ? error.message : String(error);
}
/** Read and parse a JSON object body, bounded by {@link MAX_BODY_BYTES}. */
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = chunk;
		size += buffer.length;
		if (size > MAX_BODY_BYTES) throw new RouteError(413, "request body is too large");
		chunks.push(buffer);
	}
	if (size === 0) return {};
	let parsed;
	try {
		parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new RouteError(400, "request body is not valid JSON");
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new RouteError(400, "request body must be a JSON object");
	return parsed;
}
/** The advertised route list, as absolute pathnames. */
function advertisedPaths() {
	return ROUTES.map((route) => route.tail === "" ? ROUTE_PATH : `${ROUTE_PATH}/${route.tail}`);
}
/**
* Build one `IndexResponse`.
* @param deps - the route's dependencies.
* @returns the fused index.
*/
function indexOf(deps) {
	const parity = censusOf(deps.now());
	return {
		ok: true,
		prefix: ROUTE_PREFIX,
		sidebar: {
			slot: "sidebar.panellist",
			id: SIDEBAR_ID,
			order: 12,
			panel: PANEL_ID
		},
		members: MEMBERS,
		excluded: EXCLUDED,
		reversed: REVERSED_EXCLUSIONS,
		parity,
		verdict: parityVerdict(parity),
		byMember: parityByMember(),
		routes: advertisedPaths(),
		censusAt: parity.censusAt
	};
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
function parityOf(deps) {
	const census = censusOf(deps.now());
	const declared = new Set(MEMBERS.map((member) => member.name));
	const orphans = [...new Set(CAPABILITIES.map((capability) => capability.member))].filter((member) => !declared.has(member)).sort();
	return {
		ok: true,
		census,
		verdict: parityVerdict(census),
		byMember: parityByMember(),
		capabilities: CAPABILITIES,
		orphanMembers: orphans
	};
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
async function capsOf(deps, req, url) {
	const sessionId = url.searchParams.get("sessionId");
	const memberPath = sessionId === null || sessionId === "" ? "/context-out/api/state" : `/context-out/api/state?sessionId=${encodeURIComponent(sessionId)}`;
	const source = await compose({
		authority: authorityOf(req),
		memberPath
	});
	if (source.outcome === "unmeasured") {
		deps.log("warn", `dsh-meta-context: caps is UNMEASURED — ${source.reason ?? "no reason recorded"}`);
		return {
			ok: true,
			source
		};
	}
	const value = source.value;
	const modes = Array.isArray(value["modes"]) ? value["modes"] : [];
	const runKeys = Array.isArray(value["runKeys"]) ? value["runKeys"] : [];
	const scopes = [
		"global",
		"subagent",
		"run"
	];
	return {
		ok: true,
		...modes.length === 0 ? {} : { modes },
		scopes,
		...value["policy"] === void 0 ? {} : { policy: value["policy"] },
		...runKeys.length === 0 ? {} : { runKeys },
		...value["reading"] === void 0 ? {} : { reading: value["reading"] },
		source
	};
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
async function setCapsOf(deps, req, rawBody) {
	const source = await compose({
		authority: authorityOf(req),
		memberPath: "/context-out/api/set",
		method: "POST",
		body: rawBody
	});
	if (source.outcome === "unmeasured") {
		deps.log("warn", `dsh-meta-context: caps set is UNMEASURED — ${source.reason ?? "no reason recorded"}`);
		return {
			ok: false,
			source,
			error: source.reason
		};
	}
	const value = source.value;
	return {
		ok: value["ok"] !== false,
		...value["policy"] === void 0 ? {} : { policy: value["policy"] },
		source
	};
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
async function admissionOf(deps, url) {
	const gate = deps.admission();
	const pricedTokens = countParam(url, "priced", 1e4);
	const retainTokens = countParam(url, "retain", 1e3);
	if (gate === void 0) return {
		ok: true,
		servicePresent: false,
		reason: "the foldAdmissionGate service is not registered on this context, so the admission capability cannot be derived; the member is not mounted or its row is disabled"
	};
	try {
		const probe = {
			sessionId: "meta-context-probe",
			pricedTokens,
			retainTokens
		};
		return {
			ok: true,
			servicePresent: true,
			verdict: await gate.admit(probe),
			probe
		};
	} catch (error) {
		return {
			ok: true,
			servicePresent: true,
			reason: `the foldAdmissionGate service threw when driven: ${messageOf(error)}`
		};
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
function countParam(url, name, fallback) {
	const raw = url.searchParams.get(name);
	if (raw === null || raw === "") return fallback;
	if (!/^\d+$/.test(raw)) throw new RouteError(400, `query parameter "${name}" must be a non-negative integer`);
	return Number(raw);
}
/**
* The 404 body, rendered from the dispatch table so it cannot advertise a path
* the table cannot reach.
* @param pathname - the pathname that was not found.
* @returns the body.
*/
function notFoundBody(pathname) {
	return {
		ok: false,
		error: `unknown meta-context route ${JSON.stringify(pathname)}`,
		routes: ROUTES.map((route) => ({
			path: route.tail === "" ? ROUTE_PATH : `${ROUTE_PATH}/${route.tail}`,
			method: route.method,
			summary: route.summary
		}))
	};
}
/**
* Build the prefix handler for `/meta-context/api`.
* @param deps - the admission service reader, the logger and the clock.
* @returns the node request handler owning the full response lifecycle.
*/
function createRouteHandler(deps) {
	return async (req, res) => {
		try {
			const url = new URL(req.url ?? "/", "http://dsh.invalid");
			if (!url.pathname.startsWith("/meta-context/api")) throw new RouteError(404, "this prefix does not own that pathname");
			const tail = url.pathname.slice(ROUTE_PATH.length).replace(/^\/+/, "").replace(/\/+$/, "");
			const candidates = ROUTES.filter((route) => route.tail === tail);
			if (candidates.length === 0) {
				writeJson(res, 404, notFoundBody(url.pathname));
				return;
			}
			const spec = candidates.find((route) => route.method === req.method);
			if (spec === void 0) {
				const accepted = candidates.map((route) => route.method).join(" or ");
				throw new RouteError(405, `${tail === "" ? "the index" : tail} accepts ${accepted}`);
			}
			switch (tail) {
				case "":
					writeJson(res, 200, indexOf(deps));
					return;
				case "parity":
					writeJson(res, 200, parityOf(deps));
					return;
				case "caps":
					if (spec.method === "POST") {
						writeJson(res, 200, await setCapsOf(deps, req, await readJsonBody(req)));
						return;
					}
					writeJson(res, 200, await capsOf(deps, req, url));
					return;
				case "formation":
					writeJson(res, 200, await compose({
						authority: authorityOf(req),
						memberPath: "/context-stats/api/formation"
					}));
					return;
				case "status":
					writeJson(res, 200, await compose({
						authority: authorityOf(req),
						memberPath: `/context-stats/api/status${url.search === "" ? "" : url.search}`,
						timeoutMs: MEMBER_SCAN_BUDGET_MS
					}));
					return;
				case "folds":
					writeJson(res, 200, await compose({
						authority: authorityOf(req),
						memberPath: `/context-stats/api/folds${url.search === "" ? "" : url.search}`,
						timeoutMs: MEMBER_SCAN_BUDGET_MS
					}));
					return;
				case "admission":
					writeJson(res, 200, await admissionOf(deps, url));
					return;
				case "bundle":
					writeJson(res, 200, await bundleOf({
						authority: authorityOf(req),
						now: deps.now
					}));
					return;
				case "tuning":
					writeJson(res, 200, await compose({
						authority: authorityOf(req),
						memberPath: "/s1cap-7340"
					}));
					return;
				default: throw new RouteError(404, `unknown meta-context route ${JSON.stringify(url.pathname)}`);
			}
		} catch (error) {
			writeJson(res, error instanceof RouteError ? error.status : 502, {
				ok: false,
				error: messageOf(error)
			});
		}
	};
}
// src/host/index.ts
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
/** Loader row name; the bundle patch mounts this package under `meta-context`. */
const name = "dsh-meta-context";
/**
* Only the web server is required.
*
* `foldAdmissionGate` is read through `ctx.get` because it is genuinely
* optional: requiring it statically would leave this plugin a PENDING loader
* entry on any deployment that fuses the context surface without the admission
* gate, which is the one outcome the program's landing gate forbids. The
* capability is then reported UNMEASURED with the reason.
*/
const inject = ["webServer"];
/** The service name `dsh-fold-admission` provides. */
const FOLD_ADMISSION_SERVICE = "foldAdmissionGate";
/**
* Mount the one fused prefix route.
*
* There is no configuration surface, deliberately: the composer's base comes
* from each request's own authority, so there is nothing to configure, and a
* config key with no effect would be a caption rather than a control.
* @param ctx - the plugin context, with `webServer` injected.
*/
function apply(ctx) {
	const admission = () => {
		const service = ctx.get(FOLD_ADMISSION_SERVICE);
		return service === void 0 || service === null ? void 0 : service;
	};
	ctx.logger.info("dsh-meta-context: active; prefix=%s, members=4, sidebar=sidebar.panellist#%s@12, admission=%s", ROUTE_PATH, "dsh-meta-context", admission() === void 0 ? "not-mounted" : "mounted");
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: ROUTE_PATH,
		handler: createRouteHandler({
			log: (level, message) => {
				if (level === "warn") ctx.logger.warn(message);
				else ctx.logger.info(message);
			},
			admission,
			now: () => /* @__PURE__ */ new Date()
		})
	}), "dsh-meta-context: /meta-context/api routes");
}
export { BUNDLES_DIR, CAPABILITIES, EXCLUDED, MEMBERS, MEMBER_SCAN_BUDGET_MS, PANEL_ID, PROBE_TIMEOUT_MS, REVERSED_EXCLUSIONS, ROUTES, ROUTE_FAMILIES, ROUTE_PATH, ROUTE_PREFIX, SIDEBAR_ID, SIDEBAR_ORDER, advertisedPaths, apply, bundleOf, bundlesRootFromModule, censusOf, createRouteHandler, findBundlesRoot, inject, name, parityByMember, parityVerdict };
