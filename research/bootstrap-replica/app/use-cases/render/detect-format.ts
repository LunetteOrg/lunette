import type { Renderer } from '../../lib/renderer/index.ts'

// Never errors, never throws: an author override wins, otherwise the provider
// detects, and any failure collapses to the fallback. The total-function leaf.
export const detectFormat = async (
  deps: { renderer: Renderer },
  text: string,
  fallback: string,
  override?: string,
): Promise<string> => {
  if (override) return override
  try {
    return await deps.renderer.detect(text)
  } catch {
    return fallback
  }
}
