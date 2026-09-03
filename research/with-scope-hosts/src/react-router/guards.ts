import { data } from 'react-router'
import type { Next } from '@lntt/scope'

// Auth throws — React Router's own door, same one the no-scope spike
// already reached for (`src/react-router/routes/publish.ts` there throws a
// `data()` envelope too): there is no res-like object here to write a
// response onto and stop, only a return (which renders normally) or a
// throw (which a real navigation routes to the nearest ErrorBoundary).
export const requireActor = async (
  _app: {},
  { request }: { readonly request: Request },
  next: Next<{ actor: string }>,
) => {
  const actor = request.headers.get('x-actor-id')
  if (!actor) throw data({ error: 'unauthorized' }, { status: 401 })
  return next({ actor })
}
