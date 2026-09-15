#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Publishes both builds to the gh-pages branch, in one push.
 *
 * GitHub Pages can either run a workflow or serve a branch. This does the second, which
 * is all the default `gh` token is allowed to do — see deploy/pages.yml for the first,
 * which is better once the token has the `workflow` scope.
 *
 * Two things live on that branch:
 *
 *   /            the demo — the ordinary app, role chooser and all
 *   /trial/      the judge-testing build, which boots straight into the trial console
 *
 * Both are built here rather than whenever someone last happened to run a build, and the
 * branch is assembled from scratch each time. The alternative — pushing one and hoping
 * the other is still up there — force-pushes over a branch whose contents nobody checked,
 * and the way that fails is by silently deleting the half you were not thinking about.
 *
 * Asset paths are relative (`base: './'` in vite.config), so the same output works at the
 * root and in a subfolder with no separate configuration.
 *
 *   node deploy/publish.mjs            both
 *   node deploy/publish.mjs --demo     demo only, trial left exactly as it was
 *   node deploy/publish.mjs --trial    trial only, demo left exactly as it was
 */

const root = process.cwd()
const dist = join(root, 'dist')
const stage = join(root, '.deploy')
const git = (args, cwd = root) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' })

const only = process.argv.includes('--demo') ? 'demo' : process.argv.includes('--trial') ? 'trial' : 'both'

const remote = git(['remote', 'get-url', 'origin'])
const subject = git(['log', '-1', '--pretty=%s'])
const [, owner, repo] = remote.replace(/\.git$/, '').match(/github\.com[/:]([^/]+)\/(.+)$/) ?? []
const site = `https://${owner?.toLowerCase()}.github.io/${repo}`

rmSync(stage, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

/**
 * Start from what is already published.
 *
 * A partial deploy has to leave the other half alone, and the only reliable account of
 * the other half is the branch itself — not this working copy, which may never have built
 * it. When the branch does not exist yet there is nothing to preserve and a full build is
 * the only correct thing anyway.
 */
if (only !== 'both') {
  try {
    // A shallow clone of the branch, rather than reading this repository's own objects.
    // `git archive` piped through tar was the obvious route and does not survive Windows:
    // tar reads an extraction path beginning `C:` as a remote host spec and refuses it.
    // A clone needs no second tool and leaves this repository's index alone.
    const tmp = join(root, '.deploy-existing')
    rmSync(tmp, { recursive: true, force: true })
    git(['clone', '--depth', '1', '--branch', 'gh-pages', remote, tmp], root)
    rmSync(join(tmp, '.git'), { recursive: true, force: true })
    cpSync(tmp, stage, { recursive: true })
    rmSync(tmp, { recursive: true, force: true })
    console.log('Kept what is already on gh-pages, replacing only the requested half.')
  } catch (error) {
    // Say why. A silent catch here is what turns "the branch could not be read" into a
    // deploy that looks fine until the guard below stops it for reasons nobody can see.
    const why = error instanceof Error ? error.message : String(error)
    console.log(`Could not read the existing gh-pages branch: ${why.split('\n')[0]}`)
  }
}

/**
 * Refuse to push a partial deploy that would delete the other half.
 *
 * The push below is a force-push over the whole branch, so a partial deploy is only safe
 * if the half it is not building was successfully recovered first. If the fetch above
 * failed quietly — no branch, no network, a renamed remote — going ahead would publish a
 * site consisting of one directory and silently remove the other.
 */
function insist(path, what) {
  if (existsSync(join(stage, path))) return
  console.error(`\nRefusing to publish: ${what} is not in the staging directory.`)
  console.error('A partial deploy force-pushes the whole branch, so this would delete it.')
  console.error('Run `npm run deploy` to rebuild and publish both instead.')
  rmSync(stage, { recursive: true, force: true })
  process.exit(1)
}

function build(mode, into) {
  console.log(`\nBuilding ${mode ?? 'demo'}…`)
  run('npx', mode ? ['vite', 'build', '--mode', mode] : ['vite', 'build'])
  if (!existsSync(dist)) {
    console.error('Build produced no dist/.')
    process.exit(1)
  }
  rmSync(into, { recursive: true, force: true })
  mkdirSync(into, { recursive: true })
  cpSync(dist, into, { recursive: true })
}

if (only === 'both' || only === 'demo') build(null, stage)
if (only === 'both' || only === 'trial') build('trial', join(stage, 'trial'))

if (only === 'trial') insist('index.html', 'the demo')
if (only === 'demo') insist('trial/index.html', 'the judge-testing build')

// Pages runs Jekyll over a branch unless told not to, and Jekyll drops _-prefixed paths.
writeFileSync(join(stage, '.nojekyll'), '')

rmSync(join(stage, '.git'), { recursive: true, force: true })
git(['init', '-b', 'gh-pages'], stage)
git(['add', '-A'], stage)
git(
  ['-c', 'user.name=probe-deploy', '-c', 'user.email=deploy@local', 'commit', '-m', `Publish: ${subject}`],
  stage,
)
git(['push', '--force', remote, 'gh-pages'], stage)
rmSync(stage, { recursive: true, force: true })

console.log('')
if (only !== 'trial') console.log(`Demo           ${site}/`)
if (only !== 'demo') console.log(`Judge testing  ${site}/trial/`)
