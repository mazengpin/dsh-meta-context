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

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** How long one family-root probe may take before it is reported unprobed. */
export const PROBE_TIMEOUT_MS = 2_000

/** The directory, relative to the program root, that holds the clones. */
export const BUNDLES_DIR = 'plugins-src'

/** One declared package and the route family root it owns. */
export interface BundleFamily {
  /** The `dsh-meta-*` package name. */
  readonly package: string
  /** The family root, WITH its leading slash. */
  readonly root: string
}

/**
 * The nine packages of the meta bundle, and the family root each one owns.
 *
 * This table is DECLARED rather than discovered, because the question is which
 * of the KNOWN nine are present: a census that only walked directories found on
 * disk could never report an ABSENT package, and absence is half the answer.
 */
export const ROUTE_FAMILIES: readonly BundleFamily[] = [
  { package: 'dsh-meta-context', root: '/meta-context' },
  { package: 'dsh-meta-intent', root: '/meta-intent' },
  { package: 'dsh-meta-evolve', root: '/meta-evolve' },
  { package: 'dsh-meta-research', root: '/meta-research' },
  { package: 'dsh-meta-memory', root: '/meta-memory' },
  { package: 'dsh-meta-skills', root: '/meta-skills' },
  { package: 'dsh-meta-market', root: '/meta-market' },
  { package: 'dsh-meta-community', root: '/meta-community' },
  { package: 'dsh-meta-harness', root: '/meta-harness' },
]

/** The `dsh`/`cordis` entry a package manifest declares, read verbatim. */
export interface BundleEntry {
  /** The `dsh` block, verbatim; `null` when the manifest has none. */
  readonly dsh: unknown
  /** The `cordis` block, verbatim; `null` when the manifest has none. */
  readonly cordis: unknown
  /** The manifest `main`, or `null`. */
  readonly main: string | null
}

/** One census row: one package of the bundle. */
export interface BundleRow {
  /** The declared package name (or the directory name for an undeclared one). */
  readonly package: string
  /** The directory that was found, relative to the program root; `null` when absent. */
  readonly directory: string | null
  /** Whether the package directory exists. */
  readonly present: boolean
  /** `package.json` name, or `null` when it could not be read. */
  readonly name: string | null
  /** `package.json` version, or `null`. */
  readonly version: string | null
  /** The `dsh`/`cordis` entry, or `null` when no manifest could be read. */
  readonly entry: BundleEntry | null
  /** The declared family root, or `null` when the table declares none. */
  readonly routeRoot: string | null
  /** Every pathname that was probed, in order. Empty when nothing was probed. */
  readonly probePaths: readonly string[]
  /** Whether a family root answered 200. */
  readonly mounted: boolean
  /** The HTTP status received, or `null` when nothing was measured — never `0`. */
  readonly status: number | null
  /** Why the row reads as it does; present whenever `status` is `null` or `mounted` is false. */
  readonly reason: string | null
}

/** The census over the rows, with numerators and denominators. */
export interface BundleCensus {
  /** Rows in this census (declared packages plus any undeclared directory found). */
  readonly total: number
  /** Package directories found on disk. */
  readonly directories: number
  /** Rows whose package directory exists. */
  readonly present: number
  /** Rows whose family root answered 200. */
  readonly mounted: number
  /** Rows whose package directory does not exist. */
  readonly absent: number
  /** Rows where nothing was measured (`status === null`) — an absence of a READING. */
  readonly unprobed: number
  /** Rows present on disk but with no 200 from their family root. */
  readonly presentNotMounted: number
}

/** The `/meta-context/api/bundle` payload. */
export interface BundleResponse {
  readonly ok: true
  /** The directory the census read, relative to the program root; `null` when not found. */
  readonly bundlesDir: string | null
  /** One row per package, family order first, then any undeclared directory. */
  readonly rows: readonly BundleRow[]
  /** The census over `rows`. */
  readonly census: BundleCensus
  /** The census stamp, from the injected clock. */
  readonly censusAt: string
}

/** One probe outcome. `status: null` means nothing was measured. */
export interface ProbeOutcome {
  readonly status: number | null
  readonly reason: string | null
}

/** What the census needs. */
export interface BundleDeps {
  /** The originating request's authority, or `undefined` when it carried none. */
  readonly authority: string | undefined
  /** Override the directory that holds the clones (the harness uses this). */
  readonly root?: string | null
  /** The clock, injected so a harness can pin the stamp. */
  readonly now: () => Date
  /** Override the probe (the harness uses this to prove a mutation changes the answer). */
  readonly probe?: (url: string) => Promise<ProbeOutcome>
}

/**
 * Locate the `plugins-src` directory by walking up from this module's own path.
 * @param start - the directory to start from.
 * @returns the bundles root, or `null` when no ancestor is named `plugins-src`.
 */
export function findBundlesRoot(start: string): string | null {
  let dir = start
  for (let step = 0; step < 6; step += 1) {
    if (basename(dir) === BUNDLES_DIR) return dir
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/** The bundles root, resolved from this module's own location. */
export function bundlesRootFromModule(): string | null {
  try {
    return findBundlesRoot(dirname(fileURLToPath(import.meta.url)))
  } catch {
    return null
  }
}

/** The default probe: one bounded loopback GET that reports the status it saw. */
async function defaultProbe(url: string): Promise<ProbeOutcome> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      // A family root that redirects has not answered the question; report the
      // 3xx rather than following it onto a path nothing here vetted.
      redirect: 'manual',
    })
    const body = await response.text()
    void body
    return {
      status: response.status,
      reason: response.ok ? null : `the family root answered ${response.status}`,
    }
  } catch (error) {
    return {
      status: null,
      reason: `the probe threw: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`,
    }
  }
}

/** Read the directories under the bundles root, sorted, or `null` when unreadable. */
function listDirectories(root: string): string[] | null {
  try {
    return readdirSync(root)
      .filter(entry => entry.startsWith('dsh-meta-'))
      .filter(entry => {
        try {
          return statSync(join(root, entry)).isDirectory()
        } catch {
          return false
        }
      })
      .sort()
  } catch {
    return null
  }
}

/** Read one package's manifest identity, or a reason it could not be read. */
function readManifest(directory: string): { name: string | null; version: string | null; entry: BundleEntry | null; reason: string | null } {
  try {
    const raw = readFileSync(join(directory, 'package.json'), 'utf8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const name = typeof parsed['name'] === 'string' ? parsed['name'] : null
    const version = typeof parsed['version'] === 'string' ? parsed['version'] : null
    return {
      name,
      version,
      entry: {
        dsh: parsed['dsh'] ?? null,
        cordis: parsed['cordis'] ?? null,
        main: typeof parsed['main'] === 'string' ? parsed['main'] : null,
      },
      reason: null,
    }
  } catch (error) {
    return {
      name: null,
      version: null,
      entry: null,
      reason: `package.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
    }
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
async function probeFamily(
  authority: string,
  root: string,
  probe: (url: string) => Promise<ProbeOutcome>,
): Promise<{ mounted: boolean; status: number | null; probePaths: string[]; reason: string | null }> {
  const probePaths = [root, `${root}/api`]
  const outcomes = await Promise.all(probePaths.map(path => probe(`http://${authority}${path}`)))
  const hit = outcomes.findIndex(outcome => outcome.status === 200)
  if (hit >= 0) {
    return { mounted: true, status: 200, probePaths, reason: null }
  }
  const measured = outcomes.find(outcome => outcome.status !== null)
  if (measured === undefined) {
    const first = outcomes[0]?.reason ?? 'no reason recorded'
    return { mounted: false, status: null, probePaths, reason: `nothing was measured: ${first}` }
  }
  const summary = probePaths.map((path, index) => `${path} ${outcomes[index]?.status ?? 'no response'}`).join(', ')
  return {
    mounted: false,
    status: measured.status,
    probePaths,
    reason: `no 200 from the family: ${summary}`,
  }
}

/**
 * Build the bundle census.
 * @param deps - the authority, the clock, and optional root/probe overrides.
 * @returns the census payload.
 */
export async function bundleOf(deps: BundleDeps): Promise<BundleResponse> {
  const censusAt = deps.now().toISOString()
  const root = deps.root === undefined ? bundlesRootFromModule() : deps.root
  const probe = deps.probe ?? defaultProbe
  const empty = { total: 0, directories: 0, present: 0, mounted: 0, absent: 0, unprobed: 0, presentNotMounted: 0 }
  if (root === null) {
    return { ok: true, bundlesDir: null, rows: [], census: empty, censusAt }
  }
  const directories = listDirectories(root)
  if (directories === null) {
    return { ok: true, bundlesDir: BUNDLES_DIR, rows: [], census: empty, censusAt }
  }

  const byLowerName = new Map(directories.map(name => [name.toLowerCase(), name]))
  const declared = new Set(ROUTE_FAMILIES.map(family => family.package.toLowerCase()))
  const rows: BundleRow[] = []

  for (const family of ROUTE_FAMILIES) {
    const found = byLowerName.get(family.package.toLowerCase()) ?? null
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
        reason: `no ${BUNDLES_DIR}/${family.package} directory: the package is declared by the bundle route-family table but is not on disk, so its manifest could not be read and its family root could not be probed; a null status here is an absence of a reading, not a 0`,
      })
      continue
    }
    const manifest = readManifest(join(root, found))
    if (deps.authority === undefined) {
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
        reason: 'the originating request carried no usable Host header, so there was no authority to probe this family against; a null status here is an absence of a reading, not a 0',
      })
      continue
    }
    const probed = await probeFamily(deps.authority, family.root, probe)
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
      reason: probed.reason ?? manifest.reason,
    })
  }

  for (const found of directories) {
    if (declared.has(found.toLowerCase())) continue
    const manifest = readManifest(join(root, found))
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
      reason: 'this directory is in the bundles root but the bundle route-family table declares no root for it, so no route was probed; a null status here is an absence of a probe, never a 0',
    })
  }

  const present = rows.filter(row => row.present).length
  const mounted = rows.filter(row => row.mounted).length
  const unprobed = rows.filter(row => row.status === null).length
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
      presentNotMounted: present - mounted,
    },
    censusAt,
  }
}
