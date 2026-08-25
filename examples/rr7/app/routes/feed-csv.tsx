import { feedScope } from '@lntt/example-app'
import { toLoader } from '../bootstrap/index.ts'
import type { Route } from './+types/feed-csv'

// A RESOURCE route with a non-JSON body — the case `Outcome` cannot express, and
// which needs no new API to solve: the pack's loader hands back the leaf's DATA,
// and this route decides the representation. Composition, not a second codec.
//
// An abort still short-circuits: `scopeLoader` THROWS it, and the throw travels
// past this function to React Router untouched.
const scopeLoader = toLoader(feedScope)

const csv = (rows: readonly { id: string; title: string }[]): string =>
  ['id,title', ...rows.map((r) => `${r.id},${JSON.stringify(r.title)}`)].join('\n')

// The cost of composing ON TOP of `toLoader`: its return type is a union — the
// leaf's value, or `data()` when the sinks wrote something, or a `Response` for
// a redirect. Unwrapping it is five lines, and it is the natural candidate for
// an `unwrap` helper in the pack once a second route needs it.
const unwrap = <T,>(out: unknown): T => {
  if (out instanceof Response) throw out // a redirect intent: hand it back to RR7
  if (out && typeof out === 'object' && 'data' in out && 'init' in out) {
    return (out as { data: T }).data
  }
  return out as T
}

export async function loader(args: Route.LoaderArgs) {
  const { feed } = unwrap<{ feed: readonly { id: string; title: string }[] }>(
    await scopeLoader(args),
  )
  return new Response(csv(feed), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="feed.csv"',
    },
  })
}
