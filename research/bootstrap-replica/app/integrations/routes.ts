import { isError } from '../lib/errors.ts'
import type { LoadContext } from './react-router.ts'

// Representative route modules. The point: every loader/action consumes ONLY
// the public surface (context.app.access / profile / threads / getSession /
// validateEmail) — never a repo, a service, the db or a render leaf. The Pub /
// Ctx split is enforced by the type: those keys are not on `app` at all.

type LoaderArgs = { request: Request; context: LoadContext }
type ActionArgs = LoaderArgs

export const feedLoader = async ({ request, context }: LoaderArgs) => {
  const session = await context.app.getSession(request)
  const feed = await context.app.threads.listFeed('feed')
  return { signedIn: session !== null, feed }
}

export const postLoader = async ({ request, context }: LoaderArgs, postId: string) => {
  const session = await context.app.getSession(request)
  const post = await context.app.threads.getPostForReading(postId, 'web', session?.userId)
  if (isError(post)) throw new Response(null, { status: 404 })
  return { post }
}

export const loginAction = async ({ request, context }: ActionArgs) => {
  const form = await request.formData()
  const email = String(form.get('email') ?? '')
  if (!context.app.validateEmail(email)) return { error: 'invalid-email' as const }
  await context.app.access.requestCode(email)
  return { ok: true as const }
}
