#!/usr/bin/env node
/**
 * Run the suite until it fails, and say how often it did.
 *
 * The browser suite fails intermittently, and the reason it went unexplained for so long is
 * arithmetic: at about one run in five and eighty seconds a run, confirming that a fix worked meant
 * a dozen runs and still only a guess. Anything said about this failure has to be said in rates, and
 * a rate needs a loop - so the loop lives here rather than in whatever shell someone reaches for.
 *
 *   node scripts/repro-browser-flake.mjs 10                       the ordinary command, ten times
 *   node scripts/repro-browser-flake.mjs 10 --cold                empty the dep cache each time
 *   node scripts/repro-browser-flake.mjs 10 -- --project elements pass the rest to vitest
 *   node scripts/repro-browser-flake.mjs 10 --timeout=240           kill and count a hung run
 *
 * Two things worth knowing before reading anything into a number it prints. The whole suite fails
 * more often than `--project elements` does, so a clean filtered run proves very little. And two
 * rates are not different because one is bigger: telling 15% from 35% at any confidence takes more
 * than fifty runs an arm, which is over an hour. `PLAN.md` records what has already been measured
 * this way, and what turned out to be noise.
 */
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const argv = process.argv.slice(2)
const passThrough = argv.includes('--') ? argv.slice(argv.indexOf('--') + 1) : []
const own = argv.includes('--') ? argv.slice(0, argv.indexOf('--')) : argv
const cold = own.includes('--cold')
const runs = Number(own.find((argument) => /^\d+$/.test(argument)) ?? 10)
/*
 * A run that hangs is not a slow run waiting to finish - one sat for forty-two minutes at 1% CPU
 * with its browser still up. Unattended, that is the whole CI budget spent learning nothing, so a
 * run past this deadline is killed and counted as a hang.
 */
const timeout = Number(own.find((a) => a.startsWith('--timeout='))?.slice('--timeout='.length) ?? 240)

/*
 * Vite's optimised dependencies, which are the one input that changes what a run has to fetch. A
 * cold cache raises the failure rate of the filtered run; whether it does anything to the whole
 * suite is not established.
 */
const DEP_CACHES = [
  'node_modules/.vite',
  'packages/core/node_modules/.vite',
  'packages/client/node_modules/.vite',
  'packages/elements/node_modules/.vite',
  'packages/theme/node_modules/.vite',
  'apps/site/node_modules/.vite',
  'apps/playground/node_modules/.vite',
]

/** The lines worth keeping out of eighty seconds of output. */
const SIGNATURES = [
  /Failed to import test file (\S+)/,
  /Failed to fetch dynamically imported module: (\S+)/,
  /Waited \d+ms for (.+?), and it never happened/,
  /Cannot connect to the iframe/,
  /error:\s+(http\S+)/,
]

const seen = new Map()
let failed = 0
let hung = 0

console.log(`${runs} runs of \`npx vitest run${passThrough.length ? ` ${passThrough.join(' ')}` : ''}\`${cold ? ', each on a cold dependency cache' : ''}\n`)

for (let run = 1; run <= runs; run += 1) {
  if (cold) {
    for (const cache of DEP_CACHES) {
      rmSync(new URL(cache, `file://${ROOT}`), { recursive: true, force: true })
    }
  }

  const started = Date.now()
  const result = spawnSync('npx', ['vitest', 'run', ...passThrough], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeout * 1000,
    killSignal: 'SIGKILL',
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const tally = output.match(/Test Files.*/)?.[0].trim() ?? 'no summary - the run did not finish'

  if (result.status === 0) {
    console.log(`  run ${run}: passed in ${seconds}s`)
    continue
  }

  failed += 1

  /* A hang leaves its browsers behind, and the next run inherits a machine full of them. */
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGKILL') {
    hung += 1
    console.log(`  run ${run}: HUNG - killed after ${timeout}s`)
    spawnSync('pkill', ['-9', '-f', 'chrome-headless'])
    seen.set('the run hung and was killed', (seen.get('the run hung and was killed') ?? 0) + 1)
    continue
  }
  console.log(`  run ${run}: FAILED in ${seconds}s - ${tally}`)

  for (const line of output.split('\n')) {
    for (const signature of SIGNATURES) {
      const found = line.match(signature)
      if (found) {
        const key = (found[1] ?? found[0]).replace(/https?:\/\/localhost:\d+/, '').replace(/\?.*$/, '').trim()
        seen.set(key, (seen.get(key) ?? 0) + 1)
      }
    }
  }
}

console.log(`\n${failed} of ${runs} runs failed${hung ? `, ${hung} of them by hanging` : ''}.`)

if (seen.size) {
  console.log('\nWhat the failures said:')
  for (const [what, count] of [...seen].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}x  ${what}`)
  }
}

if (failed && !process.env.DIAGNOSE_LOG) {
  console.log(
    '\nFor the server\'s side of one of these, run again with DIAGNOSE_LOG set to a file:\n' +
      '  DIAGNOSE_LOG=/tmp/openish.ndjson node scripts/repro-browser-flake.mjs 10 -- --project elements',
  )
}

process.exit(failed ? 1 : 0)
