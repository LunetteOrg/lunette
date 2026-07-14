import type { RequestHead } from '../src/scope.ts'

// The domain the scope-runtime prototype exercises: an ownership + prefetch
// guard. Sessions come from a bearer token, admins from the session's user,
// courses carry an owner — the case the design was sparked by.

export interface Session {
  readonly userId: string
}

export interface Admin {
  readonly id: string
  readonly role: 'admin'
}

export interface Course {
  readonly id: string
  readonly ownerId: string
  readonly title: string
}

export interface SessionRepo {
  // Reads only the headers — typed on the headless `RequestHead` the fragment
  // exposes (body access is the `.body`/`.form` channels' job, not a guard's).
  get(request: RequestHead): Session | null
}

export interface AdminRepo {
  byId(userId: string): Admin | null
}

export interface CourseRepo {
  byId(id: string): Course | null
  list(): readonly Course[]
}

// A use-case service — the kind of thing a LEAF calls (distinct from the repos
// the guards read for auth/prefetch). The leaf declares it and delegates the
// domain work; guards never touch it.
export interface CourseView {
  detail(course: Course): { id: string; title: string }
}

export interface Repos {
  readonly sessionRepo: SessionRepo
  readonly adminRepo: AdminRepo
  readonly courseRepo: CourseRepo
  readonly courseView: CourseView
}

// In-memory repos with fixed seed data. `Authorization: Bearer <userId>`
// stands in for a real session cookie; `u-admin` is the only admin, and
// owns course `c1` (course `c2` is owned by someone else).
export function makeRepos(): Repos {
  const admins = new Map<string, Admin>([['u-admin', { id: 'u-admin', role: 'admin' }]])
  const courses = new Map<string, Course>([
    ['c1', { id: 'c1', ownerId: 'u-admin', title: 'Owned by admin' }],
    ['c2', { id: 'c2', ownerId: 'u-other', title: 'Owned by someone else' }],
  ])

  return {
    sessionRepo: {
      get(request) {
        const auth = request.headers.get('authorization')
        const userId = auth?.startsWith('Bearer ') ? auth.slice(7) : null
        return userId ? { userId } : null
      },
    },
    adminRepo: {
      byId: (userId) => admins.get(userId) ?? null,
    },
    courseRepo: {
      byId: (id) => courses.get(id) ?? null,
      list: () => [...courses.values()],
    },
    courseView: {
      detail: (course) => ({ id: course.id, title: course.title }),
    },
  }
}
