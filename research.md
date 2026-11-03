# research.md - dsh-meta-context

## The question

Does the meta layer publish one census a stranger can check, or a set of per-plugin claims that cannot disagree with themselves?

In measurable form: for each of the nine `dsh-meta-*` packages, is there one row carrying `present`, `mounted` and `status`, with the three states kept apart so that absent, unmounted and unprobed never collapse into the same value?

## What is measured

- `GET /meta-context/api/bundle` returns one row per package, and a package that is present but answered no 200 is `mounted: false` with its status and reason, not a zero.
- Host half `verify/host-half.mjs` passes 48 of 48, its registry 25 of 25, verdict PARITY.
- Client bundle `verify/client-bundle.cjs` seats exactly `main` + `sidebar.panellist`, with 20 locale keys twice.
- `verify/falsify.mjs` turns 4 of 4 mutations RED and restores 4 of 4 byte-identical.

## What is NOT MEASURED

- Cold-read cost of the panel route: not stated as a number anywhere, so NOT MEASURED.
- Whether the `dsh.client.inject` list matches the slots actually registered: not audited, so NOT MEASURED.
- Any user-visible surface: no browser harness exists in this package, so every panel claim is a build and registration claim, and what is on screen is not measured here.

## The next measurement

Extend `verify/host-half.mjs` with a check that refuses a payload whose contract field is a bare string, and report 49 of 49. Falsifier: revert that check and the count must fall back to 48 of 48.
