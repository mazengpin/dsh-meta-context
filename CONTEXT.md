# CONTEXT — dsh-meta-context

**Written so that a reader who never saw the session that produced this package can rebuild the reasoning, not only the files.** Read `DISCLOSURE.md` for what it does and does not guarantee, and `ROADMAP.md` for what 1.0.0 still requires.

## (a) The problem

An agent working inside a large program has no reliable answer to one question: *what am I allowed to see of this program right now?*
Every surface it could consult is a separate service with a separate shape — a plan store, a decision log, an intent field, a gate, a set of sibling plugins — and each answers in its own spelling. A model that assembles that picture free-hand will sometimes include a number it was never given, or omit a surface that is down and read the omission as a zero.
This package exists to make that picture **one composed, quotable surface**, with the reads declared and the absences marked.

## (b) The context it was built in, and the constraint that shaped it

It is one of eight `dsh-meta-*` packages that form the meta layer of the `dsh-meta-evolve` program, built beside `dsh-meta-evolve` (rounds and deltas), `dsh-meta-intent` (the intent field), `dsh-meta-market` (the peer layer), `dsh-meta-memory`, `dsh-meta-research`, `dsh-meta-skills` and `dsh-meta-community`.
The constraint that shaped this one is the **seating contract of the host web client**. A panel is not one registration but two, in two different slots, spelled differently: `ui-sidebar` declares `sidebar.panellist` and builds its row list from a row`s `id`, while `ui-layout` declares `main` and keys the panel body by `key`. **A row whose `id` does not equal its panel`s `key` renders as a row that opens nothing, or as a panel nothing can reach** — and both look like a styling bug until the pairing is checked. That is why the client half here carries one row and one keyed panel with one shared constant, and why `verify/client-bundle.cjs` asserts the seats rather than trusting them.
The second constraint is deployment reality: a profile consumes this package through a **relative `link:`**, so nothing in the package may assume an absolute path and nothing may assume it is the only consumer of a slot.

## (c) The intent, and what was deliberately not attempted

**Intent:** give a reader — human or model — a single page that states what the meta layer can see, with each figure carrying the route that produced it, so that a claim can be checked without opening five services.
**Deliberately not attempted:** a second data store (this package reads; it does not keep the record), any write path to the program it describes, a rendered-page proof (no browser harness exists, so every panel claim is a build/registration claim and is labelled as one), and any model call — the package opens no device and never reaches the GPU, which this program reaches only through `llama.cpp` and its controlling scripts.

## (d) Alternatives considered, and why each lost

**A single flat JSON endpoint with no slot registration** — lost because the panel then lives outside the host`s own navigation, and a surface a user cannot find is not a surface.
**Reusing one of the sibling packages` panels** — lost because the composition would inherit that package`s release cadence; a break in its shape would silently change this one.
**A client-side fetch per surface** — lost on failure semantics: five independent fetches give five independent failures, and a reader cannot tell "the gate is down" from "the gate said nothing". One server-side composition with marked absences is the only shape where an absence is expressible.
**Signing the composed payload** — `NOT RECORDED` as a considered alternative; no design note for it exists, and this package does not sign anything.

## (e) Recreating a working environment

Numbered steps; `node`, `pnpm` and `git` only — no PowerShell, no shell script file, no Windows-only step.
1. `git clone <repository-url> dsh-meta-context` into the directory you keep harness plugins in.
2. `cd dsh-meta-context`
3. `pnpm install`
4. `pnpm run build` — writes the host half and the client bundle; both are what a profile loads.
5. `node -e "const j=require('./package.json');console.log(j.name,j.version,j.publishConfig&&j.publishConfig.tag)"` — confirm the version and that the publish tag is `next`.
6. Add the package to a profile as a relative link: in that profile`s `package.json`, `"dsh-meta-context": "link:../../plugins-src/dsh-meta-context"`.
7. Add `"dsh-meta-context"` to the same file`s `dsh.profile.bundles`.
8. `pnpm install` in the profile so the link materialises.
9. Restart the profile: a newly added dependency is not seen until the next boot.
10. Verify the boot took it: `node -e "fetch('http://127.0.0.1:3083/meta-context/api/caps').then(r=>r.text()).then(t=>console.log(t.slice(0,120)))"` — a `404` means the row did not load, and that is a boot problem, not a package problem.
11. Run the package`s own checks: `node verify/host-half.mjs lib/index.js` and `node verify/falsify.mjs`.

## (f) What to read next

`DISCLOSURE.md` for the limits and the security posture, `ROADMAP.md` for what 1.0.0 requires, and then `src/client/index.tsx`, whose header comment states the two-slot identity rule that this whole package is shaped around.
