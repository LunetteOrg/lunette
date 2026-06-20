import { SURFACES, type Surface } from '../../domain/render.ts'

// The degenerate leaf: NO deps, synchronous, never errors. Normalises a raw
// input to a supported surface, falling back when it doesn't match. Stresses
// wire's empty-deps case (bind({}, { resolveSurface })).
export const resolveSurface = (
  _deps: Record<string, never>,
  raw: string | null | undefined,
  fallback: Surface,
): Surface =>
  (SURFACES as readonly string[]).includes(raw ?? '') ? (raw as Surface) : fallback
