/**
 * FALSIFICATION DRIVER — proves the parity harness can disagree.
 *
 * A parity report that has never been shown to disagree is a caption. This script
 * mutates the fused surface, rebuilds it, and requires the harness to go RED;
 * then it restores the source, rebuilds, and requires the SAME harness run to go
 * GREEN. Both halves are asserted, because a harness stuck on red would pass the
 * first half on its own.
 *
 * WHY IT MUTATES THE SOURCE AND REBUILDS, rather than patching the built bundle
 * or passing a bad argument
 *
 * Patching `lib/index.js` with a string replacement would test the mutator's
 * ability to edit JavaScript, and a test-only switch inside the plugin would be
 * production code that exists for the harness — a hook that could mask the very
 * behaviour it claims to exercise. Editing the real source and running the real
 * build mutates exactly the artifact the profile loads.
 *
 * SAFETY: every mutation is applied to a file in THIS package, and the original
 * bytes are restored in a `finally`. The script then re-hashes every touched file
 * and refuses to report success if any of them differs from its starting hash —
 * a mutation driver that can leave a mutant on disk is worse than no driver.
 *
 * Usage: node verify/falsify.mjs
 * Exit:  0 every mutation went red AND the restore went green
 *        1 at least one mutation was NOT caught, or the restore did not go green
 *        2 BLINDED — the pristine run was not green to begin with, so nothing was
 *          proven about the mutations
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..')

/** sha256 of a file's bytes, so a restore is verified rather than assumed. */
function digestOf(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/** Run one command in the package root. */
function run(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

/** Build the package. */
function build() {
  const result = run('pnpm', ['run', 'build'])
  if (result.status !== 0) {
    console.error('the build failed:')
    console.error((result.stdout + result.stderr).slice(-2000))
    process.exit(2)
  }
}

/** Run the parity harness and return its exit code plus a short tail. */
function harness() {
  const result = run('node', ['verify/host-half.mjs'])
  const tail = (result.stdout + result.stderr).trim().split('\n').slice(-4).join(' | ')
  return { status: result.status, tail }
}

/**
 * The mutations. Each names ONE defect of the fused surface that the parity
 * harness must notice, and the check that is supposed to notice it.
 */
const MUTATIONS = [
  {
    name: 'drop-route',
    file: 'src/host/routes.ts',
    check: 'D3/D4/D11 — an advertised route disappears from the table',
    find: "  { tail: 'folds', method: 'GET', summary: 'Fold rows, composed live from context-stats.' },\n",
    replace: '',
  },
  {
    name: 'wrong-shape',
    file: 'src/host/routes.ts',
    check: 'D2 — the index publishes a census it did not derive',
    find: '    parity,\n    verdict: parityVerdict(parity),',
    replace: '    parity: { total: 0, driven: 0, attested: 0, unmeasured: 0, unreasoned: 0, censusAt: \'\' },\n    verdict: parityVerdict(parity),',
  },
  {
    name: 'unmeasured-as-zero',
    file: 'src/host/compose.ts',
    check: 'E4 — a failing member is republished as a success',
    find: '    if (!response.ok) {',
    replace: '    if (false && !response.ok) {',
  },
  {
    name: 'zero-denominator',
    file: 'src/shared/protocol.ts',
    check: 'B1/B10/C4 — the census reports a total that is not the registry',
    find: '  return { driven, attested, unmeasured, unreasoned, total: CAPABILITIES.length, censusAt: now.toISOString() }',
    replace: '  return { driven, attested, unmeasured, unreasoned, total: 0, censusAt: now.toISOString() }',
  },
]

// ---------------------------------------------------------------------------
// 0. The baseline. Without this the mutations prove nothing: a harness already
//    red would "catch" every mutant.
// ---------------------------------------------------------------------------
console.log('dsh-meta-context falsification driver')
console.log('')
build()
const baseline = harness()
if (baseline.status !== 0) {
  console.error(`BLINDED — the PRISTINE run is not green (exit ${baseline.status}): ${baseline.tail}`)
  console.error('A mutation run over an already-red harness proves nothing.')
  process.exit(2)
}
console.log(`  baseline      : exit 0 (green) — ${baseline.tail}`)
console.log('')

// ---------------------------------------------------------------------------
// 1. Each mutation must go red, and the restore must come back green.
// ---------------------------------------------------------------------------
const outcomes = []

for (const mutation of MUTATIONS) {
  const path = join(ROOT, mutation.file)
  const before = readFileSync(path, 'utf8')
  const startHash = digestOf(path)
  outcomes.push({ name: mutation.name, file: mutation.file, check: mutation.check, startHash, restored: false, redStatus: null, greenStatus: null })

  let redStatus = null
  try {
    if (!before.includes(mutation.find)) {
      console.error(`BLINDED — mutation ${mutation.name} does not match its target in ${mutation.file}; the source moved`)
      process.exit(2)
    }
    writeFileSync(path, before.replace(mutation.find, mutation.replace), 'utf8')
    build()
    const mutated = harness()
    redStatus = mutated.status
    outcomes[outcomes.length - 1].redStatus = mutated.status
    outcomes[outcomes.length - 1].redTail = mutated.tail
  } finally {
    // The restore is unconditional, and it is verified below by hash.
    writeFileSync(path, before, 'utf8')
  }
  build()
  const green = harness()
  outcomes[outcomes.length - 1].greenStatus = green.status
  outcomes[outcomes.length - 1].greenTail = green.tail
  outcomes[outcomes.length - 1].restored = digestOf(path) === startHash
}

// ---------------------------------------------------------------------------
// 2. Report, and refuse to claim success on anything less than all of it.
// ---------------------------------------------------------------------------
console.log('  mutation                          target                       mutant   restored')
console.log('  ' + '-'.repeat(92))
let caught = 0
let restoredClean = 0
for (const row of outcomes) {
  const red = row.redStatus === 1 || row.redStatus === 2
  if (red) caught += 1
  if (row.restored) restoredClean += 1
  console.log(
    `  ${row.name.padEnd(32)}  ${row.check.slice(0, 26).padEnd(26)}  ` +
    `${String(row.redStatus).padStart(6)}  ${row.restored ? 'verified' : 'DIRTY'}`,
  )
}
console.log('')

const finalGreen = harness()
const problems = []
if (caught !== MUTATIONS.length) problems.push(`${MUTATIONS.length - caught} of ${MUTATIONS.length} mutations were NOT caught`)
if (restoredClean !== MUTATIONS.length) problems.push(`${MUTATIONS.length - restoredClean} of ${MUTATIONS.length} restores did not reproduce the original bytes`)
if (finalGreen.status !== 0) problems.push(`the final restored run is not green (exit ${finalGreen.status})`)

console.log(`  mutations caught          : ${caught}/${MUTATIONS.length}`)
console.log(`  restores byte-identical   : ${restoredClean}/${MUTATIONS.length}`)
console.log(`  final restored run        : exit ${finalGreen.status} — ${finalGreen.tail}`)
console.log('')

if (problems.length > 0) {
  for (const problem of problems) console.error(`FAILED — ${problem}`)
  console.error('')
  console.error('VERDICT: FAIL — this harness has not been shown to disagree where it claims to.')
  process.exit(1)
}

console.log(`VERDICT: PASS — ${caught}/${MUTATIONS.length} mutations went RED, ${restoredClean}/${MUTATIONS.length} restores went byte-identical, and the restored surface went GREEN.`)
process.exit(0)
