import fs from 'fs'
import path from 'path'
import express from 'express'
import { app } from './app.js'
import { env } from './config/env.js'

// Desktop mode (and any single-process deployment): serve the built frontend from
// the same origin and expose the API under /api, exactly like the nginx setup does.
let server: express.Express = app
if (env.FRONTEND_DIST && fs.existsSync(env.FRONTEND_DIST)) {
  const root = express()
  root.disable('x-powered-by')
  root.use('/api', app)
  root.use(express.static(env.FRONTEND_DIST, { index: false }))
  root.get(/.*/, (_req, res) => res.sendFile(path.join(env.FRONTEND_DIST!, 'index.html')))
  server = root
}

const onListen = () => console.log(`Backend running on http://${env.APP_HOST ?? 'localhost'}:${env.APP_PORT}`)
if (env.APP_HOST) server.listen(env.APP_PORT, env.APP_HOST, onListen)
else server.listen(env.APP_PORT, onListen)
