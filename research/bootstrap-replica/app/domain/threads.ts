// Ports for the threads area (posts + comments).

export type PostStatus = 'draft' | 'published'

export type Post = {
  id: string
  authorId: string
  title: string
  body: string
  origFormat: string
  status: PostStatus
  createdAt: Date
}

export type Comment = {
  id: string
  postId: string
  authorId: string
  parentId: string | null
  body: string
  origFormat: string
  createdAt: Date
}

export type PostRepository = {
  create(post: Post): Promise<Post>
  findById(id: string): Promise<Post | null>
  listPublished(): Promise<Post[]>
  update(
    id: string,
    patch: Partial<Pick<Post, 'title' | 'body' | 'status' | 'origFormat'>>,
  ): Promise<Post>
  remove(id: string): Promise<void>
}

// View models the read leaves project for the routes (the public shapes).
export type PostForReading = {
  id: string
  title: string
  body: string
  authorName: string
  authorColor: string
  surface: string
}

export type FeedPost = {
  id: string
  title: string
  excerpt: string
  authorName: string
  authorColor: string
  commentCount: number
}

export type CommentForReading = {
  id: string
  body: string
  authorName: string
  authorColor: string
}

export type CommentRepository = {
  create(comment: Comment): Promise<Comment>
  findById(id: string): Promise<Comment | null>
  listByPost(postId: string): Promise<Comment[]>
  countByPosts(postIds: readonly string[]): Promise<Map<string, number>>
  update(
    id: string,
    patch: Partial<Pick<Comment, 'body' | 'origFormat'>>,
  ): Promise<Comment>
  remove(id: string): Promise<void>
}
