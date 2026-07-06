import {
  cacheKeyOf,
  type RenderCacheRepository,
  type RenderItem,
  SURFACES,
  type Surface,
} from '../../domain/render.ts'
import { DbOperationFailed, RenderFailed } from '../../lib/errors.ts'
import { pLimit } from '../../lib/concurrency.ts'
import type { RenderFormat, Renderer } from '../../lib/renderer/index.ts'

const CONCURRENCY = 6

// One deps shape backs three leaves; the render fragment binds it TWICE — once
// with {format:'html', sanitize: sanitizeRich} (body), once with
// {format:'text', sanitize: identity} (title) — to yield the body- and
// title-path variants. That double-bind is the headline replica detail.
export type RenderDeps = {
  renderer: Renderer
  renderCache: RenderCacheRepository
  format: RenderFormat
  sanitize: (output: string) => string
}

// Warm the cache for every surface (the fan-out axis), concurrency-capped.
// Infrastructure failures THROW; callers treat the warm-up as best-effort.
export const renderUpfront = async (
  deps: RenderDeps,
  contentType: string,
  contentId: string,
  text: string,
): Promise<void> => {
  await pLimit(
    CONCURRENCY,
    SURFACES.map((surface) => async () => {
      const output = deps.sanitize(await deps.renderer.render({ text, surface, format: deps.format }))
      await deps.renderCache.upsert({ contentType, contentId, surface, output, source: 'upfront' })
    }),
  )
}

// Read-through: cache hit wins; on a miss render and fill lazily. A cache READ
// failure is fatal (throws DbOperationFailed); a render PROVIDER failure is
// non-fatal and degrades to the original text; a cache WRITE failure is
// swallowed (best-effort). The fatal/degrade split is a key window stressor.
export const getRendered = async (
  deps: RenderDeps,
  contentType: string,
  contentId: string,
  text: string,
  surface: Surface,
): Promise<string> => {
  const hit = await deps.renderCache.get({ contentType, contentId, surface })
  if (hit !== null) return hit

  let output: string
  try {
    output = deps.sanitize(await deps.renderer.render({ text, surface, format: deps.format }))
  } catch (error) {
    if (error instanceof RenderFailed) return deps.sanitize(text)
    throw error
  }

  try {
    await deps.renderCache.upsert({ contentType, contentId, surface, output, source: 'lazy' })
  } catch (error) {
    if (!(error instanceof DbOperationFailed)) throw error
  }
  return output
}

// Batch variant: one getMany cache read, misses rendered concurrently, each
// degrading independently on a provider failure.
export const getRenderedMany = async (
  deps: RenderDeps,
  contentType: string,
  items: readonly RenderItem[],
  surface: Surface,
): Promise<Map<string, string>> => {
  const cached = await deps.renderCache.getMany(
    items.map((item) => ({ contentType, contentId: item.id, surface })),
  )
  const out = new Map<string, string>()
  const misses: RenderItem[] = []
  for (const item of items) {
    const hit = cached.get(cacheKeyOf({ contentType, contentId: item.id, surface }))
    if (hit !== undefined) out.set(item.id, hit)
    else misses.push(item)
  }

  const rendered = await pLimit(
    CONCURRENCY,
    misses.map((item) => async (): Promise<readonly [string, string]> => {
      try {
        return [item.id, deps.sanitize(await deps.renderer.render({ text: item.text, surface, format: deps.format }))]
      } catch (error) {
        if (error instanceof RenderFailed) return [item.id, deps.sanitize(item.text)]
        throw error
      }
    }),
  )
  for (const [id, output] of rendered) out.set(id, output)
  return out
}
