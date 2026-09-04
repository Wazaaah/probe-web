#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Publishes dist/ to the gh-pages branch.
 *
 * GitHub Pages can either run a workflow or serve a branch. This does the second, which
 * is all the default `gh` token is allowed to do — see deploy/pages.yml for the first,
 * which is better once the token has the `workflow` scope.
 *
 * Nothing is committed to the source branch: dist/ gets its own throwaway repository,
 * which is force-pushed over gh-pages.
 */

const root = process.cwd()
const dist = join(root, 'dist')
const git = (args, cwd = root) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()

if (!existsSync(dist)) {
  console.error('No dist/ — run `npm run build` first.')
  process.exit(1)
}

const remote = git(['remote', 'get-url', 'origin'])
const subject = git(['log', '-1', '--pretty=%s'])

// Pages runs Jekyll over a branch unless told not to, and Jekyll drops _-prefixed paths.
writeFileSync(join(dist, '.nojekyll'), '')

rmSync(join(dist, '.git'), { recursive: true, force: true })
git(['init', '-b', 'gh-pages'], dist)
git(['add', '-A'], dist)
git(['-c', 'user.name=probe-deploy', '-c', 'user.email=deploy@local', 'commit', '-m', `Publish: ${subject}`], dist)
git(['push', '--force', remote, 'gh-pages'], dist)
rmSync(join(dist, '.git'), { recursive: true, force: true })

const [, owner, repo] = remote.replace(/\.git$/, '').match(/github\.com[/:]([^/]+)\/(.+)$/) ?? []
console.log(`Published to https://${owner?.toLowerCase()}.github.io/${repo}/`)
