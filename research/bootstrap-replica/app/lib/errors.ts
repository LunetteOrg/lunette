// The error convention (decision 14) is the pivot of the whole design:
// DOMAIN errors are RETURNED as values — they pass through windows (commit, no
// retry, ack); INFRASTRUCTURE errors are THROWN — windows react (rollback,
// retry, nack, 5xx). The two families share one class hierarchy: a single
// `isError` recognizes any returned tagged value, and `instanceof
// InfrastructureError` (or simply: it was thrown) recognizes the rest.

export abstract class TaggedError extends Error {
  abstract readonly _tag: string
}

// The marker base for everything that must be THROWN, never returned.
export class InfrastructureError extends TaggedError {
  readonly _tag: string = 'InfrastructureError'
}

export const isError = (value: unknown): value is TaggedError =>
  value instanceof TaggedError

export const isInfrastructure = (value: unknown): value is InfrastructureError =>
  value instanceof InfrastructureError

// — Infrastructure (THROWN) —

export class DbOperationFailed extends InfrastructureError {
  override readonly _tag = 'DbOperationFailed'
  constructor(readonly meta: { op: string; cause: unknown }) {
    super(`db operation failed: ${meta.op}`, { cause: meta.cause })
  }
}

export class MailSendFailed extends InfrastructureError {
  override readonly _tag = 'MailSendFailed'
  constructor(readonly meta: { cause: unknown }) {
    super('mail send failed', { cause: meta.cause })
  }
}

export class RenderFailed extends InfrastructureError {
  override readonly _tag = 'RenderFailed'
  constructor(readonly meta: { cause: unknown }) {
    super('render failed', { cause: meta.cause })
  }
}

export class BlobOperationFailed extends InfrastructureError {
  override readonly _tag = 'BlobOperationFailed'
  constructor(readonly meta: { op: string; cause: unknown }) {
    super(`blob operation failed: ${meta.op}`, { cause: meta.cause })
  }
}

// An insert that affected zero rows: not a domain outcome, an anomaly. Inside
// the verifyCode window this THROWS, forcing the transaction to roll back.
export class UserCreateNoRows extends InfrastructureError {
  override readonly _tag = 'UserCreateNoRows'
  constructor() {
    super('user insert returned no rows')
  }
}

// — Domain (RETURNED) — the auth area (the verifyCode showcase) —

export class OtpInvalid extends TaggedError {
  readonly _tag = 'OtpInvalid'
  constructor() {
    super('otp invalid')
  }
}

export class OtpExpired extends TaggedError {
  readonly _tag = 'OtpExpired'
  constructor() {
    super('otp expired')
  }
}

export class OtpMaxAttemptsExceeded extends TaggedError {
  readonly _tag = 'OtpMaxAttemptsExceeded'
  constructor() {
    super('otp max attempts exceeded')
  }
}

export class RegistrationRequired extends TaggedError {
  readonly _tag = 'RegistrationRequired'
  constructor() {
    super('registration required')
  }
}

// — Domain (RETURNED) — the threads area —

export class PostTitleRequired extends TaggedError {
  readonly _tag = 'PostTitleRequired'
  constructor() {
    super('post title required')
  }
}

export class PostBodyRequired extends TaggedError {
  readonly _tag = 'PostBodyRequired'
  constructor() {
    super('post body required')
  }
}

export class CommentBodyRequired extends TaggedError {
  readonly _tag = 'CommentBodyRequired'
  constructor() {
    super('comment body required')
  }
}

export class PostNotFound extends TaggedError {
  readonly _tag = 'PostNotFound'
  constructor() {
    super('post not found')
  }
}

export class ParentCommentNotFound extends TaggedError {
  readonly _tag = 'ParentCommentNotFound'
  constructor() {
    super('parent comment not found')
  }
}

export class BodyImageRejected extends TaggedError {
  readonly _tag = 'BodyImageRejected'
  constructor() {
    super('body image rejected')
  }
}
