// Ports for the render area — the anonymized analogue of a translation cache:
// authored content is rendered into per-surface variants, cached by
// (contentType, contentId, surface). Two axes: fan-out across SURFACES, and a
// format split (rich body vs plain title) handled by the leaves' deps.

export const SURFACES = ['web', 'feed', 'email'] as const
export type Surface = (typeof SURFACES)[number]

export type RenderCacheKey = {
  contentType: string
  contentId: string
  surface: Surface
}

export type RenderCacheEntry = RenderCacheKey & {
  output: string
  source: 'upfront' | 'lazy'
}

export const cacheKeyOf = (key: RenderCacheKey): string =>
  `${key.contentType}:${key.contentId}:${key.surface}`

export type RenderCacheRepository = {
  get(key: RenderCacheKey): Promise<string | null>
  // Returns a map keyed by cacheKeyOf(key) → output, for the keys that hit.
  getMany(keys: readonly RenderCacheKey[]): Promise<Map<string, string>>
  upsert(entry: RenderCacheEntry): Promise<void>
}

// A batchable content item for the *Many render leaves.
export type RenderItem = { id: string; text: string }

// The shapes of the render leaves once bound — these are the deps threads
// injects (the render fragment's Pub feeding the threads fragment's Seed).
export type RenderOne = (
  contentType: string,
  contentId: string,
  text: string,
  surface: Surface,
) => Promise<string>

export type RenderMany = (
  contentType: string,
  items: readonly RenderItem[],
  surface: Surface,
) => Promise<Map<string, string>>

export type RenderUpfront = (
  contentType: string,
  contentId: string,
  text: string,
) => Promise<void>

export type DetectFormat = (
  text: string,
  fallback: string,
  override?: string,
) => Promise<string>
