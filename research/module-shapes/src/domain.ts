// The shared mini-domain: the smallest surface that still exercises the
// stressors a real feature module has — repositories behind interfaces, an
// injected render function, and one leaf-into-leaf composition edge.

export type Author = { id: string; name: string }
export type Post = { id: string; authorId: string; title: string; body: string }

export type UserRepository = {
  findById: (id: string) => Promise<Author | null>
}

export type PostRepository = {
  create: (post: Post) => Promise<Post>
  findById: (id: string) => Promise<Post | null>
  list: () => Promise<Post[]>
}

export type RenderOne = (body: string) => string

// In-memory infrastructure: enough for behavioural parity tests, no I/O.
export const memInfra = () => {
  const authors: Author[] = [{ id: 'u1', name: 'Writer' }]
  const posts: Post[] = []
  let n = 0
  const userRepo: UserRepository = {
    findById: async (id) => authors.find((a) => a.id === id) ?? null,
  }
  const postRepo: PostRepository = {
    create: async (post) => {
      posts.push(post)
      return post
    },
    findById: async (id) => posts.find((p) => p.id === id) ?? null,
    list: async () => [...posts],
  }
  return {
    userRepo,
    postRepo,
    render: (body: string) => `[html] ${body}`,
    generateId: () => `id-${++n}`,
  }
}
