# ROADMAP — dsh-meta-context

**Version `0.9.0` is a PRE-RELEASE.** It is published on the `next` dist-tag and it is under active development: the surface below is what `1.0.0` still requires, not a wish list appended after the fact.

## What this package is

The context half of the meta layer: what the agent is allowed to see of the program, and how the panel that shows it is seated.

## What is measured today

Host half `verify/host-half.mjs` 48 of 48 with registry 25 of 25 and verdict PARITY; client bundle `verify/client-bundle.cjs` seats exactly `main` + `sidebar.panellist` with 20 locale keys twice; `verify/falsify.mjs` 4 of 4 mutations RED and 4 of 4 restores byte-identical.

## What 1.0.0 still requires

1. A typed contract for the context window it publishes, so a consumer can reject a shape instead of reading a string.
2. One falsifier per published field: a field that cannot be made to disagree with its source is not measured.
3. Cold-read timing on the panel route stated as a number in the README, not implied.
4. The `dsh.client.inject` list audited against the slots actually registered, so an injected slot nobody uses is removed.

## Limits, stated rather than implied

No rendered-page verification exists in this package (no browser harness); every panel claim is a build/registration claim.

## Compatibility seam

Consumes `@deepseek-ai/dsh-client-ui-slots` and `@deepseek-ai/dsh-client-locale`; both are peer surfaces that can renumber between dsh minor versions.

## How this roadmap is graded

An item is DONE only when a command proves it and the command is named here. An item that is only described is not done, and a roadmap whose items all read as prose is a plan, not a state.
