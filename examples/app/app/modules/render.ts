import { bind, lunette } from '@lntt/wire'
import type { RenderCacheRepository } from '../domain/render.ts'
import type { Renderer } from '../lib/renderer/index.ts'
import { identity, sanitizeRich } from '../lib/sanitize.ts'
import { detectFormat } from '../use-cases/render/detect-format.ts'
import {
  getRendered,
  getRenderedMany,
  type RenderDeps,
  renderUpfront,
} from '../use-cases/render/render-cache.ts'

// The render mini-app, written as a CHAIN OF EXPOSES (see
// docs/patterns/feature-modules.md): a fragment that REQUIRES its
// infrastructure (renderCache + renderer) via its Seed and wires the cache
// leaves. The host mounts it privately (use), so its leaves live in Ctx as
// wiring for threads but stay off the public surface — flat, no .as(): the
// threads fragment consumes these keys by name. The DOUBLE-BIND is two
// steps: one factory record, bound twice — the rich body path and the plain
// title path — proving alias = a provide.
export const renderModule = lunette<{
  renderCache: RenderCacheRepository
  renderer: Renderer
}>()
  // ── the body path (rich html)
  .expose((ctx) =>
    bind({ renderUpfront, getRendered, getRenderedMany })({
      renderer: ctx.renderer,
      renderCache: ctx.renderCache,
      format: 'html',
      sanitize: sanitizeRich,
    } satisfies RenderDeps),
  )
  // ── the title path (plain text): the SAME factories, aliased
  .expose((ctx) =>
    bind({
      renderUpfrontTitle: renderUpfront,
      getRenderedTitle: getRendered,
      getRenderedManyTitle: getRenderedMany,
    })({
      renderer: ctx.renderer,
      renderCache: ctx.renderCache,
      format: 'text',
      sanitize: identity,
    } satisfies RenderDeps),
  )
  .expose((ctx) => bind({ detectFormat })({ renderer: ctx.renderer }))
