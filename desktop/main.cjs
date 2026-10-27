// 9Drive Secure — desktop shell (macOS + Windows).
// Runs the real 9Drive backend locally (SQLite, bound to localhost only) and
// shows the real frontend in a window. No server, MySQL or Docker needed.
const { app, BrowserWindow, dialog, shell } = require('electron')
const { spawn } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

const PORT = Number(process.env.NINEDRIVE_PORT || 47821)
const ORIGIN = `http://localhost:${PORT}`
const GOOGLE_CALLBACK = `${ORIGIN}/api/connected-accounts/google/callback`

// Same layout in dev (repo checkout) and packaged (resources folder).
const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..')
const backendDir = path.join(base, 'backend')
const frontendDir = app.isPackaged ? path.join(base, 'frontend') : path.join(base, 'frontend', 'dist-desktop')
const sqliteSchema = path.join(backendDir, 'prisma', 'sqlite', 'schema.prisma')
const prismaCli = path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js')

let backend = null
let mainWindow = null
let quitting = false

if (!app.requestSingleInstanceLock()) app.quit()

// Google refuses sign-in from user agents that look like an embedded browser.
app.userAgentFallback = app.userAgentFallback
  .replace(/\sElectron\/\S+/i, '')
  .replace(new RegExp(`\\s${app.getName()}\\/\\S+`, 'i'), '')

function dataPaths() {
  const dir = app.getPath('userData')
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true })
  return { dir, db: path.join(dir, '9drive.db'), config: path.join(dir, 'config.json'), log: path.join(dir, 'logs', 'backend.log') }
}

/** Per-install secrets, generated on first launch and kept in the user's profile. */
function loadSecrets(configPath) {
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    if (cfg.jwtSecret && cfg.encryptionKey) return cfg
  } catch { /* first run */ }
  const cfg = { jwtSecret: crypto.randomBytes(48).toString('hex'), encryptionKey: crypto.randomBytes(32).toString('hex') }
  fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 })
  return cfg
}

function backendEnv(paths, secrets) {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1', // use Electron's bundled Node.js; nothing to install
    NODE_ENV: 'production',
    DESKTOP_MODE: 'true',
    DATABASE_URL: `file:${paths.db}`,
    APP_HOST: 'localhost',
    APP_PORT: String(PORT),
    FRONTEND_URL: ORIGIN,
    FRONTEND_DIST: frontendDir,
    GOOGLE_REDIRECT_URI: GOOGLE_CALLBACK,
    JWT_ACCESS_SECRET: secrets.jwtSecret,
    TOKEN_ENCRYPTION_KEY: secrets.encryptionKey,
    ALLOW_PUBLIC_REGISTRATION: 'false',
  }
}

function runNode(args, env, logStream) {
  const child = spawn(process.execPath, args, { cwd: backendDir, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
  child.stdout.pipe(logStream, { end: false })
  child.stderr.pipe(logStream, { end: false })
  return child
}

/** Creates or upgrades the local SQLite database. Refuses changes that would lose data. */
function migrateDatabase(env, logStream) {
  return new Promise((resolve, reject) => {
    const child = runNode([prismaCli, 'db', 'push', '--skip-generate', '--schema', sqliteSchema], env, logStream)
    child.on('error', reject)
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Database migration failed (exit ${code}).`))))
  })
}

function waitForHealth(timeoutMs = 30000) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${ORIGIN}/api/health`, (res) => {
        res.resume()
        if (res.statusCode === 200) return resolve()
        retry()
      })
      req.on('error', retry)
      req.setTimeout(2000, () => req.destroy())
    }
    const retry = () => (Date.now() - started > timeoutMs ? reject(new Error('Backend did not start in time.')) : setTimeout(tick, 300))
    tick()
  })
}

async function startBackend() {
  const paths = dataPaths()
  const env = backendEnv(paths, loadSecrets(paths.config))
  const logStream = fs.createWriteStream(paths.log, { flags: 'a' })
  logStream.write(`\n=== ${new Date().toISOString()} 9Drive ${app.getVersion()} ===\n`)

  await migrateDatabase(env, logStream)

  backend = runNode([path.join(backendDir, 'dist', 'server.js')], env, logStream)
  backend.on('exit', (code) => {
    backend = null
    if (!quitting) {
      dialog.showErrorBox('9Drive', `The local 9Drive service stopped (code ${code}).\nLog: ${paths.log}`)
      app.quit()
    }
  })
  await waitForHealth()
}

const isAppUrl = (url) => url === 'about:blank' || url === '' || url.startsWith(`${ORIGIN}/`) || url === ORIGIN
// Only Google's sign-in/consent pages stay inside the app; Drive links etc. open in the browser.
const GOOGLE_AUTH_HOSTS = new Set(['accounts.google.com', 'accounts.youtube.com'])
const isGoogleAuthUrl = (url) => {
  try { const u = new URL(url); return u.protocol === 'https:' && GOOGLE_AUTH_HOSTS.has(u.hostname) } catch { return false }
}

function openExternalSafely(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url)
}

function hardenWebContents(contents) {
  // Popups: the app's own OAuth popup is allowed (it needs window.opener); everything else opens in the system browser.
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url) || isGoogleAuthUrl(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 540, height: 720, autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true } } }
    }
    openExternalSafely(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    if (isAppUrl(url) || isGoogleAuthUrl(url)) return
    event.preventDefault()
    openExternalSafely(url)
  })
}

app.on('web-contents-created', (_e, contents) => hardenWebContents(contents))

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: '9Drive',
    show: false,
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.loadURL(`${ORIGIN}/`)
}

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.focus() }
})

app.whenReady().then(async () => {
  try {
    await startBackend()
    createWindow()
  } catch (err) {
    const { log } = dataPaths()
    const hint = /EADDRINUSE/.test(fs.existsSync(log) ? fs.readFileSync(log, 'utf8').slice(-4000) : '')
      ? `\nPort ${PORT} is already in use. Close the other program or set NINEDRIVE_PORT.`
      : ''
    dialog.showErrorBox('9Drive could not start', `${err.message}${hint}\n\nLog: ${log}`)
    app.quit()
  }
})

app.on('activate', () => { if (!mainWindow && backend) createWindow() })
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => {
  quitting = true
  if (backend) backend.kill()
})
