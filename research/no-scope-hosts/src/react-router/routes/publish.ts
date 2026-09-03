import { data, redirect, type ActionFunctionArgs } from 'react-router'
import { deps } from '../bootstrap/index.ts'

export const action = ({ params, request }: ActionFunctionArgs) => {
  const actor = request.headers.get('x-actor-id')
  if (!actor) throw data({ error: 'unauthorized' }, { status: 401 })

  const result = deps.posts.publishPost(params.id!)
  if ('notFound' in result) throw data({ error: 'not found' }, { status: 404 })

  return redirect(`/posts/${result.id}`)
}
