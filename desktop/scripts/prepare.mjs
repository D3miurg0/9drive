// Builds everything the desktop app bundles. Works on macOS, Windows and Linux.
//   node desktop/scripts/prepare.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const backend = path.join(root, 'backend')
const frontend = path.join(root, 'frontend')

function run(cmd, args, cwd, extraEnv = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}   (${path.relative(root, cwd) || '.'})`)
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...extraEnv } })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('node', [path.join('desktop', 'scripts', 'make-sqlite-schema.mjs')], root)

run('npm', ['ci', '--no-audit', '--no-fund'], backend)
run('npx', ['prisma', 'generate', '--schema', 'prisma/sqlite/schema.prisma'], backend)
run('npm', ['run', 'build'], backend)
run('npm', ['prune', '--omit=dev', '--no-audit', '--no-fund'], backend)

run('npm', ['ci', '--no-audit', '--no-fund'], frontend)
run('npx', ['vite', 'build', '--outDir', 'dist-desktop', '--emptyOutDir'], frontend, { VITE_DESKTOP: 'true' })

console.log('\nDesktop resources ready. Next: cd desktop && npm ci && npm run dist')
