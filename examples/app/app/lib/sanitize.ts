// The body path sanitizes rendered rich output; the title path is plain text
// and passes through untouched (identity). This pair is what the render
// fragment's double-bind selects between.
export const sanitizeRich = (html: string): string =>
  html.replace(/<script[\s\S]*?<\/script>/gi, '')

export const identity = (text: string): string => text
