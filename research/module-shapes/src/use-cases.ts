import type { Author, Post, PostRepository, RenderOne, UserRepository } from './domain.ts'

// Bare leaves in the CTX-ALIGNED style: every dep is named as the chain key
// that provides it (repos narrowed with Pick), so records bind point-free —
// width subtyping lets the whole ctx satisfy each leaf's slice.

export const getAuthor = async (
  deps: { userRepo: Pick<UserRepository, 'findById'> },
  id: string,
): Promise<Author | null> => deps.userRepo.findById(id)

export const publishPost = async (
  deps: { postRepo: Pick<PostRepository, 'create'>; generateId: () => string },
  input: { authorId: string; title: string; body: string },
): Promise<Post> => deps.postRepo.create({ id: deps.generateId(), ...input })

// The composition edge: a read leaf depending on another LEAF (a bound
// getAuthor), the wiring shape every feature module ends up having.
export const getPostForReading = async (
  deps: {
    postRepo: Pick<PostRepository, 'findById'>
    render: RenderOne
    getAuthor: (id: string) => Promise<Author | null>
  },
  id: string,
): Promise<{ post: Post; body: string; authorName: string } | null> => {
  const post = await deps.postRepo.findById(id)
  if (!post) return null
  const author = await deps.getAuthor(post.authorId)
  return { post, body: deps.render(post.body), authorName: author?.name ?? 'unknown' }
}

export const listFeed = async (deps: {
  postRepo: Pick<PostRepository, 'list'>
  render: RenderOne
}): Promise<Array<{ id: string; excerpt: string }>> => {
  const posts = await deps.postRepo.list()
  return posts.map((p) => ({ id: p.id, excerpt: deps.render(p.body) }))
}
