// Ports for the access area. Leaves declare these in their deps and never
// touch the db directly; the repos in app/db/repos implement them.

export type User = {
  id: string
  email: string
  displayName: string | null
  locale: string | null
  createdAt: Date
}

export type UserRegistration = {
  email: string
  displayName?: string
  locale?: string
  termsAccepted: boolean
}

export type Session = {
  id: string
  userId: string
  expiresAt: Date
}

export type OtpRecord = {
  email: string
  codeHash: string
  nonce: string
  attempts: number
  expiresAt: Date
}

export type OtpRepository = {
  upsert(record: Omit<OtpRecord, 'attempts'>): Promise<void>
  findForUpdate(email: string): Promise<OtpRecord | null>
  incrementAttempts(email: string): Promise<void>
  consume(email: string): Promise<void>
}

export type UserRepository = {
  findByEmail(email: string): Promise<User | null>
  findById(id: string): Promise<User | null>
  findByIds(ids: readonly string[]): Promise<User[]>
  create(registration: UserRegistration & { id: string }): Promise<User>
  update(
    id: string,
    patch: Partial<Pick<User, 'displayName' | 'locale'>>,
  ): Promise<User>
}

export type SessionRepository = {
  create(session: Session): Promise<Session>
  findById(id: string): Promise<Session | null>
  delete(id: string): Promise<void>
}
