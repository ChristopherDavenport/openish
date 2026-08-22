/**
 * What the dev server actually did, from the server's own side.
 *
 * The browser suite fails about one run in five, and every account of it is the browser's: a module
 * that would not import, or an element that was never defined. Neither says which request, or what
 * the server answered - and the whole reason that mattered is that the first explanation anyone
 * reached for was a network one, twice, and both times it was wrong. See "The browser suite fails
 * about one run in five" in `PLAN.md` for what has already been ruled out with this.
 *
 * Off unless `DIAGNOSE_LOG` names a file, so a normal run pays nothing for it: `configureServer`
 * never runs, no middleware is installed, and `vitest.config.ts` gets a falsy plugin that Vite drops
 * on the floor. Turned on, it appends one JSON object per line:
 *
 *   DIAGNOSE_LOG=/tmp/openish.ndjson npx vitest run --project elements
 *
 *   { kind: 'httpError' }   any status at or above 400
 *   { kind: 'aborted' }     a response the server began and never finished
 *   { kind: 'watched' }     the frame and its entry module, at every status, to prove they arrived
 *   { kind: 'socketError' } a connection torn down under a request
 *   { kind: 'clientError' } a request the server could not parse
 *   { kind: 'viteLog' }     Vite's own messages, which vitest does not forward
 *   { kind: 'summary' }     how many requests the run cost, written when the server closes
 *
 * `watched` is the one that is not an error. A failure that reports "this URL did not load" while
 * the server logs it answered in under a millisecond is a different bug from one that never reaches
 * the server at all, and only recording the successes tells them apart.
 */
import { appendFileSync } from 'node:fs'

const LOG = process.env.DIAGNOSE_LOG

const write = (event) => {
  try {
    appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`)
  } catch {
    /* A diagnostic that fails a run it was only meant to describe is worse than no diagnostic. */
  }
}

/**
 * The plugin, or nothing at all.
 *
 * Vite ignores a falsy entry in `plugins`, which is what keeps the wiring in `vitest.config.ts` to
 * one line and keeps this off by default.
 */
export const diagnoseServer = () =>
  !LOG
    ? undefined
    : {
        name: 'openish:diagnose-server',

        /*
         * Vite's own account of what it did.
         *
         * A dependency discovered after the first page load is re-bundled and the clients are told
         * to reload, which is one of the few things that can abort a module script the server has
         * already served in full. Vitest does not forward these messages, so they are captured here
         * rather than believed absent - and the absence is itself a finding.
         */
        configResolved(config) {
          for (const level of ['info', 'warn', 'error']) {
            const original = config.logger[level].bind(config.logger)
            config.logger[level] = (message, options) => {
              write({ kind: 'viteLog', level, message: String(message).slice(0, 500) })
              return original(message, options)
            }
          }
        },

        configureServer(server) {
          /*
           * How many requests a run costs, which is the number the reliability question turns on.
           * A failure rate per *run* says nothing about how fragile any single request is - a suite
           * that asks for something a hundred thousand times fails one run in five on a per-request
           * rate of about one in a million.
           */
          let requests = 0
          server.httpServer?.on('close', () => write({ kind: 'summary', requests }))

          if (server.httpServer) {
            server.httpServer.on('clientError', (error, socket) => {
              write({ kind: 'clientError', code: error.code, message: error.message, reused: socket.bytesWritten > 0 })
            })
            server.httpServer.on('connection', (socket) => {
              socket.on('error', (error) => write({ kind: 'socketError', code: error.code, message: error.message }))
            })
          }

          /* Ahead of Vite's own middleware, so the status it finally wrote is the one recorded. */
          server.middlewares.use((req, res, next) => {
            requests += 1
            const started = process.hrtime.bigint()
            const since = () => Number(process.hrtime.bigint() - started) / 1e6
            const watched = req.url && (req.url.includes('src/index.ts') || req.url.includes('frame.html'))

            res.on('finish', () => {
              if (watched) {
                write({ kind: 'watched', status: res.statusCode, url: req.url, ms: since() })
              }
              if (res.statusCode >= 400) {
                write({ kind: 'httpError', status: res.statusCode, url: req.url, ms: since() })
              }
            })
            res.on('close', () => {
              if (!res.writableFinished) {
                write({ kind: 'aborted', url: req.url, ms: since() })
              }
            })

            next()
          })
        },
      }
