// What a consumer actually receives, checked on the tarball rather than on the
// working tree: pack, unpack into a scratch consumer, and put the published
// package through the three things a `dist` in place can fake.
//
//   1. every target `exports` names EXISTS in the tarball — a `files` list that
//      drifted publishes a package whose entry points resolve to nothing, and
//      `npm pack --dry-run` reports that as a success;
//   2. every subpath IMPORTS at run time, which the suites here cannot claim:
//      they reach the package by relative path and would pass with an entry
//      point missing entirely;
//   3. the manifest carries no workspace protocol — `workspace:*` or `catalog:`
//      reaching the registry is a version range npm cannot install.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, mkdirSync, symlinkSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packages = ['wire', 'scope']
const work = mkdtempSync(join(tmpdir(), 'lntt-tarball-'))
const consumer = join(work, 'consumer')
mkdirSync(join(consumer, 'node_modules', '@lntt'), { recursive: true })

let failures = 0
const check = (ok, what) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${what}`)
  if (!ok) failures++
}

for (const name of packages) {
  const dir = join(root, 'packages', name)
  console.log(`\n@lntt/${name}`)

  const tarball = execFileSync('pnpm', ['pack', '--pack-destination', work], { cwd: dir })
    .toString().trim().split('\n').pop()
  const out = join(work, `unpacked-${name}`)
  mkdirSync(out, { recursive: true })
  execFileSync('tar', ['xzf', tarball, '-C', out, '--strip-components', '1'])
  symlinkSync(out, join(consumer, 'node_modules', '@lntt', name))

  const manifest = JSON.parse(readFileSync(join(out, 'package.json'), 'utf8'))

  const targets = Object.values(manifest.exports).flatMap((e) => Object.values(e))
  for (const t of targets) check(existsSync(join(out, t)), `${t} is in the tarball`)

  check(existsSync(join(out, 'LICENSE')), `LICENSE ships with the ${manifest.license} it declares`)

  const listed = execFileSync('tar', ['tzf', tarball]).toString().split('\n')
  check(!listed.some((f) => /\.test(-d)?\.ts$/.test(f)), 'no suites in the tarball')

  const ranges = Object.values({ ...manifest.dependencies, ...manifest.devDependencies, ...manifest.peerDependencies })
  check(!ranges.some((r) => /^(workspace|catalog):/.test(r)), 'no workspace protocol left in the manifest')

  for (const sub of Object.keys(manifest.exports)) {
    const spec = sub === '.' ? manifest.name : `${manifest.name}/${sub.slice(2)}`
    try {
      const mod = await import(pathToFileURL(join(consumer, 'node_modules', '@lntt', name, manifest.exports[sub].import)).href)
      check(Object.keys(mod).length > 0, `${spec} imports, and exports something`)
    } catch (err) {
      check(false, `${spec} imports — ${err.message.split('\n')[0]}`)
    }
  }
}

rmSync(work, { recursive: true, force: true })
console.log(failures === 0 ? '\nthe tarballs are what they claim to be' : `\n${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
