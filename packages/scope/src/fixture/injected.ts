import inject from 'light-my-request'

// An Express app driven WITHOUT a socket: the request is injected into the
// handler, which is where a mount either works or does not.
//
// The other hosts hand a suite a `fetch` handler and never open a port. Express
// is the one whose API is a Node server, and a client that dials it takes an
// ephemeral port per request: under several suites at once, a port returned to
// the OS between the moment an address is read and the moment the connection
// lands is answered by whatever holds it next — another app's 404, or a reset
// with no response at all. Measured at two failures in thirty-two concurrent
// runs of one file.
//
// What is NOT given up: this is the real app, the real middleware chain and the
// real `req`/`res` objects, so a promise dropped, a `next` never called and a
// write after the answer all still show. Only the wire is gone — which is why
// a test whose SUBJECT is the wire (a chunked body, a missing `content-length`)
// takes a listening server instead.
type Body = Record<string, unknown>

type Answer = {
  statusCode: number
  headers: Record<string, unknown>
  payload: string
}

// `body` is the parsed document when the answer says JSON and an empty object
// when it says anything else, which is the shape these suites assert on.
const answered = (res: Answer) => ({
  status: res.statusCode,
  body: String(res.headers['content-type'] ?? '').includes('json')
    ? (JSON.parse(res.payload || '{}') as Body)
    : ({} as Body),
})

type Options = { headers?: Record<string, string> }

// GET alone, because that is what this suite sends: a client here grows a verb
// when a test needs one, not before.
export const injected = (app: unknown) => ({
  get: async (url: string, { headers = {} }: Options = {}) =>
    answered(
      (await inject(app as Parameters<typeof inject>[0], {
        method: 'GET',
        url,
        headers,
      })) as unknown as Answer,
    ),
})
