# dsh-meta-context

> **Status: PRE-RELEASE `0.9.0` — under active development.** This package is published on the `next` dist-tag, not `latest`.
> Its API, wire records and panel contracts may change between `0.9.x` releases, and each package carries its own `ROADMAP.md` naming what `1.0.0` still requires.
> A published tarball is a snapshot of a moving surface: read `ROADMAP.md` before depending on a shape.

One fused surface over the context family: **one route prefix** (`/meta-context/api`) and **one keyed sidebar entry**, instead of several entries doing one family's work.

Built under decision **D-0352**, which makes capability parity — not route count — the acceptance test, and forbids publishing a number the surface cannot derive.

## Adopting it inside DSH

This section explains adoption; it is not an install procedure. It contains no package-manager command, and the only command it names is the DSH build's own plugin sync.

**What the package provides.** One route prefix, `/meta-context/api`, and one keyed sidebar entry, composed from five member plugins on their live activation: a parity registry with `file:line` citations, per-scope ceilings, formation freshness, the fold aggregate, the admission probe, the assembly knobs and the meta bundle census. It replaces no member — it adds one loader row.

**What a deployment must already have.**

- A DSH profile whose web server serves loopback routes. Every member route is called through the originating request's own `Host` header, so the composer needs no config, no absolute path and no port discovery — and a deployment with no loopback route to reach has nothing to compose.
- Node `^22.19.0 || >=24.0.0` and DSH `>=0.2.2-0 <0.3.0`, both declared under `engines` in `package.json`.
- The member plugins themselves. A missing member is reported as `unmeasured` with a reason, never as a zero, so the surface degrades honestly instead of silently.

**How a profile enables a package.** A profile enables this package through its bundle list, not through a package manager. `dsh.bundle.patch` merges the single additive loader row `meta-context` at boot, and the boot graph serves `lib/client.js` from `exports["./client"]` to the browser, where it registers the one sidebar entry. A `dsh.profile.bundles` change hot-reloads; a change to this plugin's source needs a host restart — measured: re-syncing the profile does not reload new plugin code.

**Steps, in order.**

1. Confirm the prerequisites above, in that order: a loopback-serving web server, the engine range, the member plugins present in the same profile.
2. Point the profile at the package. A profile consumes a clone through a **relative** `link:` only — the registry entry in `profiles-info/plugins.json` with `spec: "link:../../plugins-src/dsh-meta-context"` is the only spec form; an absolute path is not consumed.
3. Add the `meta-context` row to that profile's bundle list. Take the registry row count before and after the edit, so a bad edit is a number rather than a suspicion:

   ```
   node -e "const f='profiles-info/plugins.json';const j=JSON.parse(require('fs').readFileSync(f,'utf8'));console.log('registry rows:',j.plugins.length)"
   ```

4. Re-sync the profile with the command your DSH build documents — `dsh plugin sync`, or the profile manager in the web app. No shell-script file and no PowerShell are required by this package, and a step that needs one is a step a Linux user cannot follow.
5. Open the sidebar entry and read the verdict before trusting a number. A `0/0` registry is `BLINDED` and exits non-zero; an unmeasured row without a reason turns the verdict into `GAP`.
6. Undo by removing the `meta-context` row. The members are NOT replaced: `dsh-context`, `dsh-context-out-controller`, `dsh-context-stats` and `dsh-fold-admission` keep their own rows, prefixes and seats, so removal restores exactly the profile you had.

**A source preview is readable, not installable.** The source tree beside this README is a preview: it is what the package does, with its checks and its limits, and it can be read, diffed and cited. Reading it installs nothing. It is not an installable artifact, and it is not a substitute for the release.

**The published release is what a deployment consumes.** `0.9.0` is published on the `next` dist-tag, not `latest`; the release tarball is the artifact a deployment resolves, and it is a snapshot of a moving surface, so read `ROADMAP.md` before depending on a shape.

## What it fuses

Five members, taken from the lane `census`'s clusters C3 (outgoing context budget) and C4 (reading the live context and program state):

| Member | Own prefix | Cluster |
|---|---|---|
| `dsh-context` | none (six fenced `/api` routes) | C4 |
| `dsh-context-out-controller` | `context-out/api` | C3 |
| `dsh-context-stats` | `context-stats/api` | C4 |
| `dsh-fold-admission` | none (one cordis service) | C3 |
| `s1cap` | `s1cap-7340` | C3 |

`dsh-context-routing` and `dsh-context-select` are **not** fused; the reason and the reopening condition are served at `/meta-context/api` under `excluded`.

`s1cap` was excluded first and fused second. That reversal is served under `reversed` rather than edited away, because an absence and a thing that was never there are indistinguishable in a record that deletes its drafts.

## Composition, not copying

Every member route is called **on the member's live activation**, through the originating request's own `Host` header — no config, no absolute path, no port discovery, so it survives an OS-assigned port and a reverse proxy.

Importing a member's `createRouteHandler` instead would construct a **second** policy store (`dsh-context-out-controller/src/index.ts:115` builds `policy` inside `apply`), so a setter would report success while changing nothing the actuator reads. The only thing composed in process is `dsh-fold-admission`'s `foldAdmissionGate`, read through `ctx.get` on every request so a deployment without that plugin still activates.

## Routes

| Path | Method | What it does |
|---|---|---|
| `/meta-context/api` | GET | The index: members, census, verdict, exclusions, reversals, routes. |
| `/meta-context/api/parity` | GET | The registry the parity count is taken over, with `file:line` citations. |
| `/meta-context/api/caps` | GET | Per-scope ceilings, composed live from the out-controller. |
| `/meta-context/api/caps` | POST | Set one ceiling, forwarded **verbatim** to the member's setter. |
| `/meta-context/api/formation` | GET | Formation freshness, composed live from context-stats. |
| `/meta-context/api/status` | GET | Fold aggregate and memory status (`?refresh=1` forces a rescan). |
| `/meta-context/api/folds` | GET | Fold rows. |
| `/meta-context/api/admission` | GET | Drives the fold-admission gate with a probe (`?priced=&retain=`). |
| `/meta-context/api/tuning` | GET | Context-assembly knobs, composed live from `s1cap`. |
| `/meta-context/api/bundle` | GET | The meta bundle census: one row per `dsh-meta-*` package — present on disk, mounted or not, with its `package.json` identity. |

`status` and `folds` get a **30 s** compose budget against the member's own 25 s scan. An 8 s budget was measured reporting a healthy member as unreachable, which is its own defect: a surface that can never derive its number is a worse instrument than one that knows it cannot.

## The three statuses

- **driven** — the fused surface reproduces the capability and derives it live. An HTTP probe proves it.
- **attested** — a seat the member's own client bundle registers. The fused surface publishes the exact registration and proves the member is mounted; it does not re-render another plugin's React tree, which is closed inside that plugin's client artifact.
- **unmeasured** — cannot be reproduced. Reported **with a reason**, never as a zero, never omitted. An unmeasured row *without* a reason turns the verdict into `GAP`; a `0/0` registry is `BLINDED` and exits non-zero.

## Verify

```
pnpm typecheck                      # exit 0
pnpm run build                      # exit 0
node verify/host-half.mjs           # 51 checks, exit 0 / 1 FAIL / 2 BLINDED
node verify/client-bundle.cjs lib/client.js
node verify/falsify.mjs             # mutates source, rebuilds, requires RED, restores, requires GREEN
```

`verify/host-half.mjs` mounts the built handler on a real loopback server beside fake member routes, so the composer's authority resolution and loopback hop are exercised for real. It also checks every cited `file:line` resolves inside the member's clone — a registry of plausible-looking citations that nothing verifies is a caption.

`verify/falsify.mjs` is the check that the harness can disagree: four mutations (dropped route, wrong shape, an unmeasured read republished as a success, a zeroed denominator) must each go red, and every restore is verified byte-identical by sha256.

## Roadmap at a glance

A glance, not a second record: the authoritative list — with the evidence for every done row, the reason for every deferred one and the rows marked `NOT MEASURED` — is [`ROADMAP.md`](ROADMAP.md). Where this list and that file differ, that file is right and this list is the defect.

- **What this package is**
- **What is measured today**
- **What 1.0.0 still requires**
- **Limits, stated rather than implied**
- **Compatibility seam**
- **How this roadmap is graded**

The roadmap currently carries **0** row(s) marked `NOT MEASURED`; a row moves to done only when its own command prints a green result.
