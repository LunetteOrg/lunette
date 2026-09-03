import { data, type LoaderFunctionArgs } from 'react-router'
import { deps } from '../bootstrap/index.ts'

// SILENT (#76's table, verified): a RETURNED data(null, { status: 404 })
// raises no error and renders the normal component with loaderData: null.
export const loader = ({ params }: LoaderFunctionArgs) => {
  const result = deps.posts.getPost(params.id!)
  if ('notFound' in result) return data(null, { status: 404 })
  return result
}
