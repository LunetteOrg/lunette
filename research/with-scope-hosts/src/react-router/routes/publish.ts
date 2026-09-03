import { data, redirect } from 'react-router'
import { scope } from '@lntt/scope'
import type { Deps } from '../../domain/deps.ts'
import { requireActor } from '../guards.ts'
import { reactRouter, reactRouterCarrier } from '../carrier.ts'
import { deps } from '../bootstrap/index.ts'

const { action: mount } = reactRouter(deps)

export const action = mount(
  scope(reactRouterCarrier)
    .step(requireActor)
    .step(async ({ posts }: Deps, { params }: { readonly params: { readonly id?: string } }) => {
      const result = posts.publishPost(params.id!)
      if ('notFound' in result) throw data({ error: 'not found' }, { status: 404 })
      return redirect(`/posts/${result.id}`)
    }),
)
