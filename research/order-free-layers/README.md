# research: order-free layers

**This is a research prototype, not a product.** It is kept alive (its
tests run with the workspace) as **prior art for parallel boot**
(`TODO.md`, story 3).

What it demonstrates: layers that declare their requirements as **runtime
keys** (`requires: ['env']`) in addition to types, letting `build(...)`
resolve them **topologically** — argument order becomes irrelevant, and a
scheduler could run independent layers concurrently. This is exactly the
"what does a layer READ" knowledge that `@lntt/wire`'s sequential chain
does not have today.

Its documented trade-off (and the reason wire did not adopt it):
requirements are declared **twice** — the runtime key list and the type
annotation — and TypeScript cannot enforce consistency between the two.
Any reads-declaration design for parallel boot should start from this
experiment and its limits.
