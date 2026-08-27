// The pair the render scope's double-bind selects between: a body path and a
// plain-text title path that passes through untouched (identity).
//
// NOT AN HTML SANITIZER, despite the name. Stripping `<script>` stops nothing an
// attacker would actually use (`<img onerror>`, `<svg onload>`, an unclosed
// tag), and this exists only so the double-bind has two distinguishable
// functions to choose between. Nothing here renders it as raw HTML — React
// escapes it — and anything that did would need a real sanitizer instead.
export const sanitizeRich = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/gi, '')

export const identity = (text: string): string => text
