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

// The render mini-app: a fragment that REQUIRES its infrastructure (renderCache
// + renderer) via its Seed and wires the cache leaves. The host mounts it
// privately (use), so its leaves live in Ctx as wiring for threads but stay off
// the public surface. The DOUBLE-BIND is here: one factory, bound twice — once
// for the rich body path, once for the plain title path — proving alias = a
// provide. Its Pub then feeds the threads fragment's Seed.
export const renderModule = lunette<{
  renderCache: RenderCacheRepository
  renderer: Renderer
}>().expose((ctx) => {
  const body: RenderDeps = {
    renderer: ctx.renderer,
    renderCache: ctx.renderCache,
    format: 'html',
    sanitize: sanitizeRich,
  }
  const title: RenderDeps = {
    renderer: ctx.renderer,
    renderCache: ctx.renderCache,
    format: 'text',
    sanitize: identity,
  }
  return {
    ...bind(body, { renderUpfront, getRendered, getRenderedMany }),
    ...bind(title, {
      renderUpfrontTitle: renderUpfront,
      getRenderedTitle: getRendered,
      getRenderedManyTitle: getRenderedMany,
    }),
    ...bind({ renderer: ctx.renderer }, { detectFormat }),
  }
})
