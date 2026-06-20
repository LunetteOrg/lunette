import type { Env } from '../../config/env.ts'
import type { Surface } from '../../domain/render.ts'
import { RenderFailed } from '../errors.ts'

export type RenderFormat = 'html' | 'text'

// Infra port: render a piece of content for a target surface; detect its source
// format. Infrastructure failures THROW RenderFailed.
export type Renderer = {
  render(input: { text: string; surface: Surface; format: RenderFormat }): Promise<string>
  detect(text: string): Promise<string>
}

// Feature flag — presence of the project id selects the real provider;
// otherwise the deterministic fake (no network), good for demos and tests.
export const renderer = ({ env }: { env: Env }): Renderer =>
  env.RENDERER_PROJECT_ID ? realRenderer(env.RENDERER_PROJECT_ID) : fakeRenderer()

const realRenderer = (projectId: string): Renderer => ({
  async render({ text, surface, format }) {
    try {
      const res = await fetch(`https://render.example/${projectId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, surface, format }),
      })
      if (!res.ok) throw new Error(`render provider returned ${res.status}`)
      return (await res.json()) as string
    } catch (cause) {
      throw new RenderFailed({ cause })
    }
  },
  async detect(text) {
    return text.includes('#') || text.includes('*') ? 'markdown' : 'text'
  },
})

const fakeRenderer = (): Renderer => ({
  async render({ text, surface, format }) {
    return `[${surface}/${format}] ${text}`
  },
  async detect(text) {
    return text.includes('#') || text.includes('*') ? 'markdown' : 'text'
  },
})
