import { data } from 'react-router'
import { scope } from '@lntt/scope'
import type { Deps } from '../../domain/deps.ts'
import { reactRouter, reactRouterCarrier } from '../carrier.ts'
import { deps } from '../bootstrap/index.ts'

const { loader: mount } = reactRouter(deps)

// THROWN, not returned: #76's own table already found a RETURNED
// `data(null, { status: 404 })` renders normally instead of routing to an
// ErrorBoundary. Composition does not guard against writing `return` here
// by mistake — no vocabulary word does that any more (db0ff65) — the fix
// is still an author writing `throw`.
export const loader = mount(
  scope(reactRouterCarrier).step(async ({ posts }: Deps, { params }) => {
    const result = posts.getPost(params.id!)
    if ('notFound' in result) throw data(null, { status: 404 })
    return result
  }),
)
