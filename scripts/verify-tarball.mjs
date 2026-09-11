// What a consumer actually receives, checked on the tarball rather than on the
// working tree: pack, unpack beside a scratch consumer, and put the published
// package through the things a `dist` sitting in the repo can fake.
//
//   1. every target `exports` names EXISTS in the tarball — a `files` list that
//      drifted publishes a package whose entry points resolve to nothing, and
//      `pnpm pack` reports that as a success;
//   2. every subpath RESOLVES AND IMPORTS by its specifier, from a process whose
//      cwd is the consumer — which is the only way the `exports` map itself is
//      exercised: importing the file path behind it passes with a map Node
//      refuses (a target missing its `./` prefix, say);
//   3. no suite rode along, compiled or otherwise;
//   4. the LICENSE is in the tarball and is the one this repo grants;
//   5. the DECLARATIONS typecheck in a consumer's program, with `skipLibCheck`
//      OFF — the gates here run with it on, which hides everything that is
//      wrong INSIDE a `.d.ts`: a member that vanished from an emitted file, or
//      an ambient name the package uses and does not declare. Three consumers,
//      because two things have to be found somewhere: the web globals the read
//      steps stand on (the default `lib` carries them, `@types/node` is the
//      other way), and nothing of Node's beyond them.
//
// What is NOT checked here, and why: the manifest's dependency ranges. `pnpm
// pack` rewrites `workspace:` and `catalog:` before packing and aborts when it
// cannot, so a published manifest carrying either is not reachable from this
// path. The scratch consumer also installs nothing, so a package that grows a
// real runtime `dependencies` will fail here until this script installs it.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The compiler this repo pins, reached through the package that has it: the
// scratch consumer installs nothing of its own.
const tsc = join(
  dirname(
    execFileSync(
      process.execPath,
      ['-e', "const {createRequire}=require('node:module');process.stdout.write(createRequire(process.cwd()+'/').resolve('typescript'))"],
      { cwd: join(root, 'packages', 'wire') },
    ).toString(),
  ),
  'tsc.js',
)
const license = readFileSync(join(root, 'LICENSE'), 'utf8')
const work = mkdtempSync(join(tmpdir(), 'lntt-tarball-'))

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`)
  if (!ok) failures++
}

// Where a published package's subpath actually points, per condition. Only the
// object form is a shape this repo publishes; anything else is a manifest to
// look at rather than to check.
const targetsOf = (exports_, name) => {
  if (!exports_ || typeof exports_ !== 'object') {
    throw new Error(`${name}: "exports" is missing or is not a map of subpaths`)
  }
  return Object.entries(exports_).map(([sub, conditions]) => {
    if (typeof conditions !== 'object' || conditions === null) {
      throw new Error(`${name}: subpath "${sub}" is not a condition map`)
    }
    return { sub, conditions }
  })
}

try {
  const consumer = join(work, 'consumer')
  mkdirSync(consumer, { recursive: true })
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ type: 'module', dependencies: {} }))

  const packages = readdirSync(join(root, 'packages')).filter((name) => {
    const manifest = join(root, 'packages', name, 'package.json')
    return existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).private !== true
  })
  check(packages.length > 0, `there are publishable packages to check (${packages.join(', ') || 'none'})`)

  for (const name of packages) {
    console.log(`\n@lntt/${name}`)
    const into = mkdtempSync(join(work, `pack-${name}-`))

    // The tarball is read off the directory rather than off stdout: pnpm writes
    // diagnostics there too, and the last line is not reliably the path.
    execFileSync('pnpm', ['pack', '--pack-destination', into], { cwd: join(root, 'packages', name) })
    const tarballs = readdirSync(into).filter((f) => f.endsWith('.tgz'))
    check(tarballs.length === 1, `pack produced one tarball (${tarballs.length})`)
    const tarball = join(into, tarballs[0])

    const out = join(work, `unpacked-${name}`)
    mkdirSync(out, { recursive: true })
    execFileSync('tar', ['xzf', tarball, '-C', out, '--strip-components', '1'])

    const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'))
    const listed = execFileSync('tar', ['tzf', tarball]).toString().split('\n')

    for (const { sub, conditions } of targetsOf(manifest.exports, manifest.name)) {
      for (const target of Object.values(conditions)) {
        check(existsSync(join(out, target)), `${sub} → ${target} is in the tarball`)
      }
    }

    check(
      listed.some((f) => /(^|\/)LICENSE$/.test(f)) && readFileSync(join(out, 'LICENSE'), 'utf8') === license,
      'the LICENSE in the tarball is this repository\'s',
    )

    const suites = listed.filter((f) => /\.(test|test-d|bench)\.(ts|js|d\.ts)$/.test(f))
    check(suites.length === 0, `no suites in the tarball${suites.length ? ` (${suites[0]}…)` : ''}`)

    // `exclude` in the build config keeps a file from being a ROOT, not from
    // being emitted: a source that imports the test carrier drags it into
    // `dist`, where `files` does not reach it.
    const fixtures = listed.filter((f) => /(^|\/)fixture\//.test(f))
    check(fixtures.length === 0, `no test fixture in the tarball${fixtures.length ? ` (${fixtures[0]})` : ''}`)

    // Every source a declaration map points at, present. This is what "go to
    // definition lands on the commented source" rests on, and `files` reaches
    // the entry points by name while the maps reach everything behind them.
    const dangling = listed
      .filter((f) => f.endsWith('.d.ts.map'))
      .flatMap((f) => {
        const map = JSON.parse(readFileSync(join(out, f.replace(/^package\//, '')), 'utf8'))
        return map.sources.map((src) => resolve(dirname(join(out, f.replace(/^package\//, ''))), src))
      })
      .filter((src) => !existsSync(src))
    check(dangling.length === 0, `every declaration map reaches its source${dangling.length ? ` (${dangling[0]} is missing)` : ''}`)

    // The consumer reaches the package the way `node_modules` does, and imports
    // it BY SPECIFIER so that Node resolves the `exports` map.
    mkdirSync(join(consumer, 'node_modules', '@lntt'), { recursive: true })
    execFileSync('cp', ['-R', out, join(consumer, 'node_modules', '@lntt', name)])

    for (const { sub } of targetsOf(manifest.exports, manifest.name)) {
      const specifier = sub === '.' ? manifest.name : `${manifest.name}/${sub.slice(2)}`
      try {
        const exported = execFileSync(
          process.execPath,
          ['--input-type=module', '-e', `import * as m from ${JSON.stringify(specifier)}; console.log(Object.keys(m).length)`],
          { cwd: consumer, stdio: ['ignore', 'pipe', 'pipe'] },
        ).toString().trim()
        check(Number(exported) > 0, `${specifier} resolves and imports, and exports something`)
      } catch (err) {
        const why = String(err.stderr ?? err.message).split('\n').find((l) => l.includes('Error')) ?? 'failed'
        check(false, `${specifier} resolves and imports — ${why.trim()}`)
      }
    }
  }

  // The declarations, compiled the way a consumer compiles them. The optional
  // peers come from the workspace: a consumer importing the express subpath has
  // express, and the declarations say so — asking them to typecheck without it
  // would be testing a program nobody writes.
  const NL = '\n'
  for (const peer of ['express', 'hono', '@trpc/server', 'react-router', '@types/express', '@types/express-serve-static-core', '@types/node']) {
    const from = join(root, 'packages', 'scope', 'node_modules', peer)
    if (!existsSync(from)) continue
    const to = join(consumer, 'node_modules', peer)
    mkdirSync(dirname(to), { recursive: true })
    if (!existsSync(to)) symlinkSync(realpathSync(from), to)
  }
  const importsOf = (keep) =>
    packages
      .flatMap((name) => {
        const manifest = JSON.parse(readFileSync(join(consumer, 'node_modules', '@lntt', name, 'package.json'), 'utf8'))
        return targetsOf(manifest.exports, manifest.name)
          .map(({ sub }) => (sub === '.' ? manifest.name : `${manifest.name}/${sub.slice(2)}`))
          .filter(keep)
      })
      .map((specifier, i) => `import * as m${i} from ${JSON.stringify(specifier)}${NL}export const use${i} = m${i}`)
      .join(NL)

  // A subpath that mounts a framework brings that framework's declarations in
  // with it, and those answer to their own author's config. Two exclusions, for
  // two different programs: without DOM, only the entry points that mount
  // nothing compile, because react-router's own types want it; without
  // @types/node, everything compiles except the tRPC subpath, whose peer
  // references Node itself. Measured, both.
  const mountsNothing = (s) => !/\/(express|hono|trpc|react-router)$/.test(s)
  const needsNoNodeTypes = (s) => !s.endsWith('/trpc')

  const base = { target: 'ES2023', module: 'nodenext', moduleResolution: 'nodenext', strict: true, noEmit: true, skipLibCheck: false }
  const programs = [
    ['the default lib', () => true, base],
    ['lib ES2023 + @types/node, no DOM', mountsNothing, { ...base, lib: ['ES2023'], types: ['node'] }],
    // The one that can see a Node type leaking into a declaration: `types: []`
    // keeps @types/node out of the program, so a `Buffer` or `NodeJS.*` in an
    // emitted `.d.ts` has nowhere to come from. It carries the host subpaths
    // too, which is where the web globals the read steps stand on — `Request`,
    // `File`, `URLSearchParams` — have to be found in `lib` or not at all.
    ['the platform alone, no @types/node', needsNoNodeTypes, { ...base, types: [] }],
  ]
  for (const [what, keep, compilerOptions] of programs) {
    writeFileSync(join(consumer, 'uses.ts'), importsOf(keep))
    writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions, include: ['uses.ts'] }))
    try {
      execFileSync(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json'], { cwd: consumer, stdio: ['ignore', 'pipe', 'pipe'] })
      check(true, `the declarations typecheck on ${what}, with skipLibCheck off`)
    } catch (err) {
      const lines = String(err.stdout ?? '').split('\n').filter(Boolean)
      check(false, `the declarations typecheck on ${what} — ${lines.length} errors, first: ${lines[0] ?? 'unknown'}`)
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}

console.log(failures === 0 ? '\nthe tarballs are what they claim to be' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
