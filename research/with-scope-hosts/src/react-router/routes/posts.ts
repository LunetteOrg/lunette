import { z } from 'zod'
import { scope } from '@lntt/scope'
import type { Deps } from '../../domain/deps.ts'
import { jsonBody, validated } from '../validation.ts'
import { reactRouter, reactRouterCarrier } from '../carrier.ts'
import { deps } from '../bootstrap/index.ts'

const { action: mount } = reactRouter(deps)

const CreatePostSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
})

export const action = mount(
  scope(reactRouterCarrier)
    .step(jsonBody)
    .step(validated(CreatePostSchema))
    .step(
      async ({ posts }: Deps, { body }: { readonly body: z.infer<typeof CreatePostSchema> }) =>
        posts.createPost(body),
    ),
)
