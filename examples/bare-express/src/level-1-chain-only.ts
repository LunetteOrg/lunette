import expressApp, { type Express } from 'express'
import { app } from './bootstrap.ts'

// LEVEL ONE — @lntt/wire and nothing else. No scopes, no packs.
//
// The handlers are ordinary Express handlers; what the chain gives them is the
// composition: `app` is the PUBLIC surface (`notes`), assembled once at import,
// with `find` kept private and the store's lifecycle owned by the layer. If all
// you want is dependency injection, this is a complete answer and you can stop
// reading here.
//
// What you do NOT get, and what level two adds: input validation, the guard
// chain, a domain error that is a RETURNED value rather than a thrown one, and
// a response shape that is not hand-rolled per route.
export function makeApp(): Express {
  const server = expressApp()

  server.get('/notes', (_req, res) => {
    res.json({ notes: app.notes.list() })
  })

  server.get('/notes/:noteId', (req, res) => {
    const note = app.notes.byId(req.params.noteId ?? '')
    // the 404 is this handler's own business, decided and rendered right here
    if (!note) {
      res.status(404).end()
      return
    }
    res.json({ note })
  })

  return server
}
