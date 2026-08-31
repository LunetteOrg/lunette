// Trimmed for the measurement: the kernels use only `Invalid`, and the real
// `Issue` comes from @standard-schema/spec, which this prototype does not
// install. Identical in both kernels, so it cannot skew the comparison.
export interface Issue {
  readonly message: string
}

export interface Invalid {
  readonly issues: readonly Issue[]
}
