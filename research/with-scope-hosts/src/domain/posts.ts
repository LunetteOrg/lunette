export type Post = {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly published: boolean
}

export type NotFound = { readonly notFound: true }

export type PostRepo = { readonly posts: Map<string, Post> }

export const makeRepo = (): PostRepo => ({
  posts: new Map([['1', { id: '1', title: 'Hello', content: 'World', published: false }]]),
})

export const getPost = (deps: PostRepo, id: string): Post | NotFound => deps.posts.get(id) ?? { notFound: true }

export type CreatePostInput = { readonly title: string; readonly content: string }

export const createPost = (deps: PostRepo, input: CreatePostInput): Post => {
  const post: Post = {
    id: String(deps.posts.size + 1),
    title: input.title,
    content: input.content,
    published: false,
  }
  deps.posts.set(post.id, post)
  return post
}

export const publishPost = (deps: PostRepo, id: string): Post | NotFound => {
  const post = deps.posts.get(id)
  if (!post) return { notFound: true }
  const published = { ...post, published: true }
  deps.posts.set(id, published)
  return published
}
