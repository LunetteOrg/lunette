// Configuration that is NOT environment: values that belong to the code, are
// the same in every deployment, and would only be noise as env vars. They ride
// the chain like any other dependency (a `provide`), so a use case receives
// them as a declared dep rather than reading a constant.
export const settings = {
  feed: { pageSize: 20 },
  ui: { title: '@lntt/example-app on React Router 7' },
} as const

export type Settings = typeof settings
