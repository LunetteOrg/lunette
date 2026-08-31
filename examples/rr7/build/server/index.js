import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, data, redirect as redirect$1, Link, UNSAFE_withErrorBoundaryProps, useRouteError, isRouteErrorResponse, Form, useActionData } from "react-router";
import { timingSafeEqual, createHmac, randomInt, createHash, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import { pgTable, timestamp, text, integer, primaryKey } from "drizzle-orm/pg-core";
import { sql, eq, inArray, asc, desc, or, and } from "drizzle-orm";
import { z } from "zod";
const ABORT_DELAY = 5e3;
function handleRequest(request2, responseStatusCode, responseHeaders2, routerContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request2.headers.get("user-agent");
    const readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    const { pipe, abort: abort2 } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: routerContext, url: request2.url }),
      {
        [readyOption]() {
          shellRendered = true;
          const body2 = new PassThrough();
          const stream = createReadableStreamFromReadable(body2);
          responseHeaders2.set("Content-Type", "text/html");
          resolve(new Response(stream, { headers: responseHeaders2, status: responseStatusCode }));
          pipe(body2);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) console.error(error);
        }
      }
    );
    setTimeout(abort2, ABORT_DELAY);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function Root() {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const unit = {
  "~standard": {
    version: 1,
    vendor: "lntt",
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    validate: (value) => ({ value: value ?? {} })
  }
};
function buildHandler(state, leaf) {
  return {
    schema: state.schema,
    guards: state.guards,
    leaf,
    // spread (not `key: undefined`) to respect exactOptionalPropertyTypes
    ...state.prepare.length > 0 && { prepare: state.prepare },
    ...state.sinks.length > 0 && { sinks: state.sinks }
  };
}
function make(state, exts) {
  const rebuild = (s) => make(s, exts);
  const base = {
    schema: state.schema,
    guard(g) {
      return make({ ...state, guards: [...state.guards, g] }, exts);
    },
    handle(leaf) {
      return buildHandler(state, leaf);
    },
    extend(ext) {
      const next = ext.sink ? { ...state, sinks: [...state.sinks, ext.sink] } : state;
      return make(next, [...exts, ext]);
    }
  };
  return Object.assign(base, ...exts.map((e) => e.methods(state, rebuild)));
}
function scope() {
  return make({ schema: unit, guards: [], prepare: [], sinks: [] }, []);
}
const ABORT = /* @__PURE__ */ Symbol("scope.abort");
const OK = /* @__PURE__ */ Symbol("scope.ok");
const isAbort = (x) => typeof x === "object" && x !== null && ABORT in x;
const isOk = (x) => typeof x === "object" && x !== null && OK in x;
async function validateInput(schema2, raw) {
  const parsed = await schema2["~standard"].validate(raw);
  if (parsed.issues) {
    return { ok: false, issues: parsed.issues };
  }
  return { ok: true, params: parsed.value };
}
const isInvalid = (x) => typeof x === "object" && x !== null && "issues" in x && !isAbort(x) && !isOk(x);
async function runFold(handler, app, carrier, params) {
  const sinks = (handler.sinks ?? []).map((make2) => make2());
  const sinkCtx = {};
  for (const sink of sinks) sinkCtx[sink.key] = sink.ctx;
  const effects = () => {
    const out = {};
    for (const sink of sinks) out[sink.key] = sink.collect();
    return out;
  };
  const prep = {};
  for (const step of handler.prepare ?? []) {
    const out = await step(carrier);
    if (isAbort(out)) return { ok: false, abort: out, effects: effects() };
    if (isInvalid(out)) return { ok: false, invalid: out, effects: effects() };
    Object.assign(prep, out);
  }
  const ctx = { ...carrier, ...sinkCtx, params, ...prep };
  let enrich = {};
  for (const g of handler.guards) {
    const out = await g(app, { ...ctx, ...enrich });
    if (isAbort(out)) return { ok: false, abort: out, effects: effects() };
    enrich = { ...enrich, ...out };
  }
  const result = await handler.leaf(app, { ...ctx, ...enrich });
  if (isAbort(result)) return { ok: false, abort: result, effects: effects() };
  if (isOk(result)) {
    const ok = result;
    return { ok: true, value: ok.value, intent: ok.intent, effects: effects() };
  }
  return { ok: true, value: result, intent: void 0, effects: effects() };
}
async function runScope(handler, app, carrier, raw) {
  const v = await validateInput(handler.schema, raw);
  if (!v.ok) return { ok: false, invalid: { issues: v.issues }, effects: {} };
  return runFold(handler, app, carrier, v.params);
}
const setHeaders = (values) => (_deps, ctx) => {
  const sink = ctx.headers;
  if (!sink) {
    throw new Error("@lntt/scope: no headers sink on ctx — was `.extend(headers)` injected?");
  }
  for (const [name, value] of Object.entries(values)) {
    sink.set(name, value);
  }
  return {};
};
const headersRuntime = {
  methods(state, rebuild) {
    return {
      headers(values) {
        return rebuild({ ...state, guards: [...state.guards, setHeaders(values)] });
      }
    };
  },
  sink: () => {
    const collected = new Headers();
    return {
      key: "headers",
      ctx: {
        set: (name, value) => collected.set(name, value),
        append: (name, value) => collected.append(name, value)
      },
      collect: () => collected
    };
  }
};
const headers$1 = headersRuntime;
const readHeaders = (outcome) => outcome.effects.headers ?? new Headers();
const doneToken = {};
const keyedToLayer = (key, l) => (ctx, next) => l(ctx, ((value) => next({ [key]: value })));
const merge$1 = (ctx, patch) => Object.assign(Object.create(Object.getPrototypeOf(ctx)), ctx, patch);
const pick = (source, keys) => {
  const out = {};
  for (const key of keys) out[key] = source[key];
  return out;
};
class Lunette {
  constructor(entries) {
    this.entries = entries;
  }
  entries;
  static create() {
    return new Lunette([]);
  }
  use(arg, extra) {
    if (arg instanceof Lunette) {
      return this.mount(arg.entries, extra, false);
    }
    if (typeof arg === "function") {
      return this.push({ kind: "layer", layer: arg, mode: "extend", public: false, key: void 0 });
    }
    return this.push({
      kind: "layer",
      layer: keyedToLayer(arg, extra),
      mode: "extend",
      public: false,
      key: arg
    });
  }
  provide(arg, extra, destroy) {
    return this.sugar(false, arg, extra, destroy);
  }
  expose(arg, extra, destroy) {
    if (arg instanceof Lunette) {
      return this.mount(arg.entries, extra, true);
    }
    return this.sugar(true, arg, extra, destroy);
  }
  // Appends one entry to the chain, wrapping the grown list in a fresh
  // Lunette. The single place that spreads `this.entries`.
  push(entry2) {
    return new Lunette([...this.entries, entry2]);
  }
  // Shared body of `use`/`expose`'s mount overloads: appends a mount entry
  // carrying the fragment's entries, the optional seed mapper, and the
  // visibility the host verb chose (use = private, expose = public).
  mount(entries, seedFn, isPublic) {
    return this.push({ kind: "mount", entries, seedFn, public: isPublic, at: void 0 });
  }
  // Shared body of `provide`/`expose`'s non-mount overloads: same wiring,
  // differing only in whether `next` also publishes (the second argument)
  // and the entry's `public` flag.
  sugar(isPublic, arg, extra, destroy) {
    const keyed = typeof arg !== "function";
    const key = keyed ? arg : void 0;
    const fn = keyed ? extra : arg;
    const teardown = keyed ? destroy : extra;
    const wrapped = async (ctx, next) => {
      const value = await fn(ctx);
      const patch = keyed ? { [key]: value } : value;
      try {
        return isPublic ? await next({}, patch) : await next(patch);
      } finally {
        if (teardown) await teardown(value);
      }
    };
    return this.push({ kind: "layer", layer: wrapped, mode: "extend", public: isPublic, key });
  }
  // Namespacing sugar for mounting: `host.use(frag.as('hb'))` mounts the
  // fragment with its whole Pub under the chosen key. It is the wrapper
  // `lunette().use(frag).expose(...)` in one word; the Seed propagates.
  as(name) {
    return new Lunette([
      { kind: "mount", entries: this.entries, seedFn: void 0, public: true, at: name }
    ]);
  }
  override(fn) {
    const wrapped = async (ctx, next) => next(await fn(ctx));
    return this.push({
      kind: "layer",
      layer: wrapped,
      mode: "override",
      public: false,
      key: void 0
    });
  }
  // The ecosystem hook: hands the chain to a "dialect" (http, cli,
  // flow...) which from there on owns the signature and behaviour of its
  // own verbs. Zero type tax on the core: pipe returns whatever the
  // dialect returns.
  pipe(fn) {
    return fn(this);
  }
  async run(...args) {
    const argv = args;
    const seed = argv.length === 2 ? argv[0] : {};
    const scope2 = argv.length === 2 ? argv[1] : argv[0];
    return this.execute({ ...seed }, /* @__PURE__ */ new Set(), scope2);
  }
  // Execution path for tests (see `test()` in @lntt/wire/testing): the
  // `subst` keys are already in the root bag with their fake values; when
  // a layer provides one of those keys, its patch for that key is DROPPED
  // at birth — downstream layers wire against the fake. Top level only:
  // fragment privates stay encapsulated (test the fragment to test those).
  async execute(rootBag, subst, scope2) {
    const assertNoClash = (ctx, patch, message) => {
      const clashes = Reflect.ownKeys(patch).filter(
        (key) => Object.hasOwn(ctx, key)
      );
      if (clashes.length > 0) throw new Error(message(clashes));
    };
    const walk = async (entries, bag, publicKeys, level, done) => {
      const dropSubstituted = (patch) => {
        if (level.size === 0) return patch;
        return pick(
          patch,
          Reflect.ownKeys(patch).filter((key) => !level.has(key))
        );
      };
      const step = async (i, ctx) => {
        const entry2 = entries[i];
        if (entry2 === void 0) return done(ctx, publicKeys);
        if (entry2.kind === "mount") {
          const base = entry2.seedFn ? { ...entry2.seedFn(ctx) } : Object.create(ctx);
          return walk(entry2.entries, base, /* @__PURE__ */ new Set(), /* @__PURE__ */ new Set(), async (childBag, childPub) => {
            const pub = pick(childBag, childPub);
            const full = entry2.at !== void 0 ? { [entry2.at]: pub } : pub;
            const patch = dropSubstituted(full);
            assertNoClash(
              ctx,
              patch,
              (clashes) => `The fragment's public surface collides with host context keys: ${clashes.map(String).join(", ")}.`
            );
            if (entry2.public)
              for (const key of Reflect.ownKeys(full)) publicKeys.add(key);
            return step(i + 1, merge$1(ctx, patch));
          });
        }
        if (entry2.key !== void 0 && level.has(entry2.key)) {
          if (entry2.public) publicKeys.add(entry2.key);
          return step(i + 1, ctx);
        }
        const next = (async (priv, pub) => {
          const full = pub === void 0 ? priv : { ...priv, ...pub };
          const patch = dropSubstituted(full);
          if (entry2.mode === "extend") {
            assertNoClash(
              ctx,
              patch,
              (clashes) => `Keys already present in the context: ${clashes.map(String).join(", ")}. Merging is shallow: use one top-level key per area, or override to replace intentionally.`
            );
            if (pub !== void 0)
              for (const key of Reflect.ownKeys(pub)) publicKeys.add(key);
          } else {
            const keys = Reflect.ownKeys(full);
            const unknowns = keys.filter((key) => !(key in ctx));
            if (unknowns.length > 0) {
              throw new Error(
                `Cannot override keys missing from the context: ${unknowns.map(String).join(", ")}.`
              );
            }
          }
          return step(i + 1, merge$1(ctx, patch));
        });
        return entry2.layer(ctx, next);
      };
      return step(0, bag);
    };
    let result;
    await walk(this.entries, rootBag, /* @__PURE__ */ new Set(), subst, async (ctx, publicKeys) => {
      const app = pick(ctx, publicKeys);
      result = await scope2(app);
      return doneToken;
    });
    return result;
  }
  // Internal access for `test()`: a static of the same class may touch
  // private members of its instances.
  static testRun(chain2, input, scope2) {
    const bag = { ...input };
    return chain2.execute(bag, new Set(Reflect.ownKeys(bag)), scope2);
  }
  async build(...args) {
    const seed = args[0] ?? {};
    let app;
    let ready;
    let release;
    const readiness = new Promise((resolve) => {
      ready = resolve;
    });
    const lifetime = new Promise((resolve) => {
      release = resolve;
    });
    const runUnchecked = this.run.bind(this);
    const finished = runUnchecked(seed, async (pub) => {
      app = pub;
      ready();
      await lifetime;
    });
    await Promise.race([readiness, finished]);
    return {
      app,
      dispose: async () => {
        release();
        await finished;
      }
    };
  }
}
const lunette = () => Lunette.create();
const layer = (l) => l;
const window = (open, toDeps) => (use) => open((raw) => use(toDeps(raw)));
const disposedHandle = () => new Error("buildOnce: this handle was disposed — build a new one for a new app");
function buildOnce(chain2) {
  let built;
  let delivered;
  let disposed = false;
  let teardown;
  const build = chain2.build.bind(chain2);
  return {
    // The PROMISE is memoized, not the resolved app: callers racing the first
    // ensure share the one build instead of each starting a chain of their own.
    //
    // A REJECTED promise is dropped, so the next `ensure` builds again. What is
    // memoized is one SUCCESSFUL build, not one attempt: a rejected promise is
    // not nullish, so keeping it would make a single transient failure — a pool
    // that could not connect, a secret that did not resolve — permanent for the
    // life of the process or isolate, and on a lazy build that first attempt is
    // a REQUEST, not startup. Callers already sharing the failing build still
    // share its failure; only a caller arriving after it settles starts a new
    // one. Safe because a failed build unwinds: each layer's `finally` runs on
    // the way out, so nothing it opened is left orphaned (§36).
    ensure: (seed) => {
      if (disposed) throw disposedHandle();
      if (!delivered) {
        built = build(seed()).catch((error) => {
          built = void 0;
          delivered = void 0;
          throw error;
        });
        delivered = built.then((handle) => {
          if (disposed) throw disposedHandle();
          return handle;
        });
        delivered.catch(() => {
        });
      }
      return delivered;
    },
    // Teardown must work in the state that calls for it, so a build that failed
    // is not allowed to take `dispose` down with it: awaiting a rejected handle
    // would rethrow, leaving no way to close what did succeed.
    dispose: () => teardown ??= (async () => {
      disposed = true;
      const pending = built;
      if (!pending) return;
      const handle = await pending.catch(() => void 0);
      await handle?.dispose();
    })()
  };
}
const bind = (record) => {
  const entries = Object.entries(record);
  const mapEntries = (project) => Object.fromEntries(entries.map(([name, uc]) => [name, project(uc)]));
  const bridge = (uc, args) => async (deps) => uc(deps, ...args);
  const binder = ((deps) => mapEntries(
    (uc) => (...args) => uc(deps, ...args)
  ));
  binder.with = (w) => mapEntries(
    (uc) => (...args) => w(bridge(uc, args))
  );
  binder.by = ((toWindow) => mapEntries(
    (uc) => (key, ...args) => toWindow(key)(bridge(uc, args))
  ));
  return binder;
};
const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  locale: text("locale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
const otps = pgTable("otps", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  nonce: text("nonce").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});
const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
});
const posts = pgTable("posts", {
  id: text("id").primaryKey(),
  authorId: text("author_id").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  origFormat: text("orig_format").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
const comments = pgTable("comments", {
  id: text("id").primaryKey(),
  postId: text("post_id").notNull(),
  authorId: text("author_id").notNull(),
  parentId: text("parent_id"),
  body: text("body").notNull(),
  origFormat: text("orig_format").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
const renderCache = pgTable(
  "render_cache",
  {
    contentType: text("content_type").notNull(),
    contentId: text("content_id").notNull(),
    surface: text("surface").notNull(),
    output: text("output").notNull(),
    source: text("source").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [primaryKey({ columns: [t.contentType, t.contentId, t.surface] })]
);
const schema = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  comments,
  otps,
  posts,
  renderCache,
  sessions,
  users
}, Symbol.toStringTag, { value: "Module" }));
const connect = (url) => {
  const client = new PGlite(url === "memory://" ? void 0 : url);
  const db = drizzle(client, { schema });
  return { db, close: async () => {
    await client.close();
  } };
};
const statements = [
  sql`CREATE TABLE IF NOT EXISTS users (
    id text PRIMARY KEY,
    email text NOT NULL UNIQUE,
    display_name text,
    locale text,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS otps (
    email text PRIMARY KEY,
    code_hash text NOT NULL,
    nonce text NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    expires_at timestamptz NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS sessions (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    expires_at timestamptz NOT NULL
  )`,
  sql`CREATE TABLE IF NOT EXISTS posts (
    id text PRIMARY KEY,
    author_id text NOT NULL,
    title text NOT NULL,
    body text NOT NULL,
    orig_format text NOT NULL,
    status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS comments (
    id text PRIMARY KEY,
    post_id text NOT NULL,
    author_id text NOT NULL,
    parent_id text,
    body text NOT NULL,
    orig_format text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  sql`CREATE TABLE IF NOT EXISTS render_cache (
    content_type text NOT NULL,
    content_id text NOT NULL,
    surface text NOT NULL,
    output text NOT NULL,
    source text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (content_type, content_id, surface)
  )`
];
const migrate = async (db) => {
  for (const statement of statements) await db.execute(statement);
};
const withDb = layer(async ({ env }, next) => {
  const { db, close } = connect(env.DATABASE_URL);
  await migrate(db);
  try {
    return await next({ db });
  } finally {
    await close();
  }
});
class TaggedError extends Error {
}
class InfrastructureError extends TaggedError {
  _tag = "InfrastructureError";
}
const isError = (value) => value instanceof TaggedError;
class DbOperationFailed extends InfrastructureError {
  constructor(meta) {
    super(`db operation failed: ${meta.op}`, { cause: meta.cause });
    this.meta = meta;
  }
  meta;
  _tag = "DbOperationFailed";
}
class MailSendFailed extends InfrastructureError {
  constructor(meta) {
    super("mail send failed", { cause: meta.cause });
    this.meta = meta;
  }
  meta;
  _tag = "MailSendFailed";
}
class RenderFailed extends InfrastructureError {
  constructor(meta) {
    super("render failed", { cause: meta.cause });
    this.meta = meta;
  }
  meta;
  _tag = "RenderFailed";
}
class BlobOperationFailed extends InfrastructureError {
  constructor(meta) {
    super(`blob operation failed: ${meta.op}`, { cause: meta.cause });
    this.meta = meta;
  }
  meta;
  _tag = "BlobOperationFailed";
}
class UserCreateNoRows extends InfrastructureError {
  _tag = "UserCreateNoRows";
  constructor() {
    super("user insert returned no rows");
  }
}
class OtpInvalid extends TaggedError {
  _tag = "OtpInvalid";
  constructor() {
    super("otp invalid");
  }
}
class OtpExpired extends TaggedError {
  _tag = "OtpExpired";
  constructor() {
    super("otp expired");
  }
}
class OtpMaxAttemptsExceeded extends TaggedError {
  _tag = "OtpMaxAttemptsExceeded";
  constructor() {
    super("otp max attempts exceeded");
  }
}
class RegistrationRequired extends TaggedError {
  _tag = "RegistrationRequired";
  constructor() {
    super("registration required");
  }
}
class PostTitleRequired extends TaggedError {
  _tag = "PostTitleRequired";
  constructor() {
    super("post title required");
  }
}
class PostBodyRequired extends TaggedError {
  _tag = "PostBodyRequired";
  constructor() {
    super("post body required");
  }
}
class CommentBodyRequired extends TaggedError {
  _tag = "CommentBodyRequired";
  constructor() {
    super("comment body required");
  }
}
class PostNotFound extends TaggedError {
  _tag = "PostNotFound";
  constructor() {
    super("post not found");
  }
}
class ParentCommentNotFound extends TaggedError {
  _tag = "ParentCommentNotFound";
  constructor() {
    super("parent comment not found");
  }
}
class BodyImageRejected extends TaggedError {
  _tag = "BodyImageRejected";
  constructor() {
    super("body image rejected");
  }
}
const commentRepo = ({ db }) => ({
  async create(comment) {
    try {
      await db.insert(comments).values(comment);
      return comment;
    } catch (cause) {
      throw new DbOperationFailed({ op: "comment.create", cause });
    }
  },
  async findById(id) {
    try {
      const [row] = await db.select().from(comments).where(eq(comments.id, id)).limit(1);
      return row ?? null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "comment.findById", cause });
    }
  },
  async listByPost(postId) {
    try {
      return await db.select().from(comments).where(eq(comments.postId, postId)).orderBy(asc(comments.createdAt));
    } catch (cause) {
      throw new DbOperationFailed({ op: "comment.listByPost", cause });
    }
  },
  async countByPosts(postIds) {
    if (postIds.length === 0) return /* @__PURE__ */ new Map();
    try {
      const rows = await db.select({ postId: comments.postId, count: sql`count(*)::int` }).from(comments).where(inArray(comments.postId, [...postIds])).groupBy(comments.postId);
      return new Map(rows.map((r) => [r.postId, r.count]));
    } catch (cause) {
      throw new DbOperationFailed({ op: "comment.countByPosts", cause });
    }
  },
  async update(id, patch) {
    try {
      const [row] = await db.update(comments).set(patch).where(eq(comments.id, id)).returning();
      if (!row) throw new DbOperationFailed({ op: "comment.update", cause: "no row" });
      return row;
    } catch (cause) {
      if (cause instanceof DbOperationFailed) throw cause;
      throw new DbOperationFailed({ op: "comment.update", cause });
    }
  },
  async remove(id) {
    try {
      await db.delete(comments).where(eq(comments.id, id));
    } catch (cause) {
      throw new DbOperationFailed({ op: "comment.remove", cause });
    }
  }
});
const otpRepo = ({ db }) => ({
  async upsert(record) {
    try {
      await db.insert(otps).values({ ...record, attempts: 0 }).onConflictDoUpdate({
        target: otps.email,
        set: { codeHash: record.codeHash, nonce: record.nonce, expiresAt: record.expiresAt, attempts: 0 }
      });
    } catch (cause) {
      throw new DbOperationFailed({ op: "otp.upsert", cause });
    }
  },
  async findForUpdate(email) {
    try {
      const [row] = await db.select().from(otps).where(eq(otps.email, email)).for("update").limit(1);
      return row ?? null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "otp.findForUpdate", cause });
    }
  },
  async incrementAttempts(email) {
    try {
      await db.update(otps).set({ attempts: sql`${otps.attempts} + 1` }).where(eq(otps.email, email));
    } catch (cause) {
      throw new DbOperationFailed({ op: "otp.incrementAttempts", cause });
    }
  },
  async consume(email) {
    try {
      await db.delete(otps).where(eq(otps.email, email));
    } catch (cause) {
      throw new DbOperationFailed({ op: "otp.consume", cause });
    }
  }
});
const toPost = (row) => ({
  ...row,
  status: row.status
});
const postRepo = ({ db }) => ({
  async create(post2) {
    try {
      await db.insert(posts).values(post2);
      return post2;
    } catch (cause) {
      throw new DbOperationFailed({ op: "post.create", cause });
    }
  },
  async findById(id) {
    try {
      const [row] = await db.select().from(posts).where(eq(posts.id, id)).limit(1);
      return row ? toPost(row) : null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "post.findById", cause });
    }
  },
  async listPublished() {
    try {
      const rows = await db.select().from(posts).where(eq(posts.status, "published")).orderBy(desc(posts.createdAt));
      return rows.map(toPost);
    } catch (cause) {
      throw new DbOperationFailed({ op: "post.listPublished", cause });
    }
  },
  async update(id, patch) {
    try {
      const [row] = await db.update(posts).set(patch).where(eq(posts.id, id)).returning();
      if (!row) throw new DbOperationFailed({ op: "post.update", cause: "no row" });
      return toPost(row);
    } catch (cause) {
      if (cause instanceof DbOperationFailed) throw cause;
      throw new DbOperationFailed({ op: "post.update", cause });
    }
  },
  async remove(id) {
    try {
      await db.delete(posts).where(eq(posts.id, id));
    } catch (cause) {
      throw new DbOperationFailed({ op: "post.remove", cause });
    }
  }
});
const SURFACES = ["web", "feed", "email"];
const cacheKeyOf = (key) => `${key.contentType}:${key.contentId}:${key.surface}`;
const matches = (key) => and(
  eq(renderCache.contentType, key.contentType),
  eq(renderCache.contentId, key.contentId),
  eq(renderCache.surface, key.surface)
);
const noopRenderCache = () => ({
  async get() {
    return null;
  },
  async getMany() {
    return /* @__PURE__ */ new Map();
  },
  async upsert() {
  }
});
const renderCacheRepo = ({ db }) => ({
  async get(key) {
    try {
      const [row] = await db.select().from(renderCache).where(matches(key)).limit(1);
      return row?.output ?? null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "renderCache.get", cause });
    }
  },
  async getMany(keys) {
    if (keys.length === 0) return /* @__PURE__ */ new Map();
    try {
      const rows = await db.select().from(renderCache).where(or(...keys.map(matches)));
      return new Map(
        rows.map((r) => [
          cacheKeyOf({ contentType: r.contentType, contentId: r.contentId, surface: r.surface }),
          r.output
        ])
      );
    } catch (cause) {
      throw new DbOperationFailed({ op: "renderCache.getMany", cause });
    }
  },
  async upsert(entry2) {
    try {
      await db.insert(renderCache).values({ ...entry2, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
        target: [renderCache.contentType, renderCache.contentId, renderCache.surface],
        set: { output: entry2.output, source: entry2.source, updatedAt: /* @__PURE__ */ new Date() }
      });
    } catch (cause) {
      throw new DbOperationFailed({ op: "renderCache.upsert", cause });
    }
  }
});
const sessionRepo = ({ db }) => ({
  async create(session) {
    try {
      await db.insert(sessions).values(session);
      return session;
    } catch (cause) {
      throw new DbOperationFailed({ op: "session.create", cause });
    }
  },
  async findById(id) {
    try {
      const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
      return row ?? null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "session.findById", cause });
    }
  },
  async delete(id) {
    try {
      await db.delete(sessions).where(eq(sessions.id, id));
    } catch (cause) {
      throw new DbOperationFailed({ op: "session.delete", cause });
    }
  }
});
const userRepo = ({ db }) => ({
  async findByEmail(email) {
    try {
      const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
      return row ?? null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "user.findByEmail", cause });
    }
  },
  async findById(id) {
    try {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ?? null;
    } catch (cause) {
      throw new DbOperationFailed({ op: "user.findById", cause });
    }
  },
  async findByIds(ids) {
    if (ids.length === 0) return [];
    try {
      return await db.select().from(users).where(inArray(users.id, [...ids]));
    } catch (cause) {
      throw new DbOperationFailed({ op: "user.findByIds", cause });
    }
  },
  async create(registration) {
    try {
      const [row] = await db.insert(users).values({
        id: registration.id,
        email: registration.email,
        displayName: registration.displayName ?? null,
        locale: registration.locale ?? null
      }).returning();
      if (!row) throw new UserCreateNoRows();
      return row;
    } catch (cause) {
      if (cause instanceof InfrastructureError) throw cause;
      throw new DbOperationFailed({ op: "user.create", cause });
    }
  },
  async update(id, patch) {
    try {
      const [row] = await db.update(users).set(patch).where(eq(users.id, id)).returning();
      if (!row) throw new UserCreateNoRows();
      return row;
    } catch (cause) {
      if (cause instanceof InfrastructureError) throw cause;
      throw new DbOperationFailed({ op: "user.update", cause });
    }
  }
});
const blobs = ({ env }) => {
  const real = env.BLOB_ENDPOINT && env.BLOB_REGION && env.BLOB_BUCKET && env.BLOB_ACCESS_KEY && env.BLOB_SECRET_KEY;
  return real ? realBlobs({ endpoint: env.BLOB_ENDPOINT, bucket: env.BLOB_BUCKET }) : fakeBlobs();
};
const realBlobs = (cfg) => ({
  url(key) {
    return `${cfg.endpoint}/${cfg.bucket}/${key}`;
  },
  async put(key, bytes, contentType) {
    try {
      const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, {
        method: "PUT",
        headers: { "content-type": contentType },
        // A copy, handed over as a plain `ArrayBuffer`: a `Uint8Array` is a
        // valid body for undici but the DOM lib types it over `ArrayBuffer`
        // rather than `ArrayBufferLike`, and this module is also compiled by
        // hosts that pull DOM in (a React Router app). An ArrayBuffer is a
        // `BodyInit` under both.
        body: bytes.slice().buffer
      });
      if (!res.ok) throw new Error(`blob store returned ${res.status}`);
    } catch (cause) {
      throw new BlobOperationFailed({ op: "put", cause });
    }
  },
  async remove(key) {
    try {
      const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${key}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`blob store returned ${res.status}`);
    } catch (cause) {
      throw new BlobOperationFailed({ op: "remove", cause });
    }
  }
});
const fakeBlobs = () => {
  const store = /* @__PURE__ */ new Map();
  return {
    url(key) {
      return `memory://${key}`;
    },
    async put(key, bytes) {
      store.set(key, bytes);
    },
    async remove(key) {
      store.delete(key);
    }
  };
};
const sign = (payload, secret) => createHmac("sha256", secret).update(payload).digest("base64url");
const makeCookie = (opts) => {
  const encode = (value) => {
    const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
    return `${payload}.${sign(payload, opts.secret)}`;
  };
  const decode = (raw) => {
    const [payload, signature] = raw.split(".");
    if (!payload || !signature) return null;
    const expected = sign(payload, opts.secret);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      return JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      return null;
    }
  };
  const serialize = (raw, maxAge) => `${opts.name}=${raw}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${opts.secure ? "; Secure" : ""}`;
  return {
    async read(request2) {
      const header = request2.headers.get("cookie");
      if (!header) return null;
      const found = header.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${opts.name}=`));
      return found ? decode(found.slice(opts.name.length + 1)) : null;
    },
    write(value) {
      return serialize(encode(value), opts.maxAge);
    },
    apply(sink, value) {
      sink.set(opts.name, encode(value), { path: "/", httpOnly: true, maxAge: opts.maxAge });
    },
    drop(sink) {
      sink.set(opts.name, "", { path: "/", httpOnly: true, maxAge: 0 });
    },
    clear() {
      return serialize("", 0);
    }
  };
};
const sessionCookie = ({ env }) => makeCookie({
  name: "session",
  secret: env.SESSION_SECRET,
  maxAge: 60 * 60 * 24 * 7,
  secure: env.NODE_ENV === "production"
});
const pendingCookie = ({ env }) => makeCookie({
  name: "pending-auth",
  secret: env.SESSION_SECRET,
  maxAge: 60 * 15,
  secure: env.NODE_ENV === "production"
});
const httpTransport = (apiKey) => async (mail) => {
  try {
    const res = await fetch("https://mail.example/send", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(mail)
    });
    if (!res.ok) throw new Error(`mail provider returned ${res.status}`);
  } catch (cause) {
    throw new MailSendFailed({ cause });
  }
};
const sendMail = async (deps, mail) => deps.transport(mail);
const loggingTransport = () => async (mail) => {
  console.log(`[mail] to=${mail.to} subject=${mail.subject}`);
};
const outbox = [];
const outboxTransport = () => async (mail) => {
  outbox.push(mail);
  console.log(`[mail:outbox] to=${mail.to} subject=${mail.subject}`);
};
const renderer = ({ env }) => env.RENDERER_PROJECT_ID ? realRenderer(env.RENDERER_PROJECT_ID) : fakeRenderer();
const realRenderer = (projectId) => ({
  async render({ text: text2, surface, format }) {
    try {
      const res = await fetch(`https://render.example/${projectId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: text2, surface, format })
      });
      if (!res.ok) throw new Error(`render provider returned ${res.status}`);
      return await res.json();
    } catch (cause) {
      throw new RenderFailed({ cause });
    }
  },
  async detect(text2) {
    return text2.includes("#") || text2.includes("*") ? "markdown" : "text";
  }
});
const fakeRenderer = () => ({
  async render({ text: text2, surface, format }) {
    return `[${surface}/${format}] ${text2}`;
  },
  async detect(text2) {
    return text2.includes("#") || text2.includes("*") ? "markdown" : "text";
  }
});
const validateEmail = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
const findUserByEmail = async (deps, email) => deps.userRepo.findByEmail(email);
const getUserById = async (deps, userId) => deps.userRepo.findById(userId);
const MAX_OTP_ATTEMPTS = 3;
const OTP_TTL_MS = 10 * 60 * 1e3;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1e3;
const generateCode = () => String(randomInt(0, 1e6)).padStart(6, "0");
const hashCode = (code) => createHash("sha256").update(code).digest("hex");
const verifyHash = (code, hash) => hashCode(code) === hash;
const requestCode = async ({ otpRepo: otpRepo2, sendMail: sendMail2 }, email, nonce, _locale) => {
  const code = generateCode();
  await otpRepo2.upsert({
    email,
    codeHash: hashCode(code),
    nonce: nonce ?? "",
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });
  await sendMail2({
    to: email,
    subject: "Your sign-in code",
    body: `Your code is ${code}`
  });
};
const verifyCode = async (deps, email, code, nonce, registration) => {
  const record = await deps.otpRepo.findForUpdate(email);
  if (!record) return new OtpInvalid();
  if (nonce && record.nonce !== nonce) return new OtpInvalid();
  if (record.attempts >= MAX_OTP_ATTEMPTS) return new OtpMaxAttemptsExceeded();
  if (record.expiresAt.getTime() < Date.now()) return new OtpExpired();
  const existing = await deps.userRepo.findByEmail(email);
  if (!existing && !registration?.termsAccepted) return new RegistrationRequired();
  if (!verifyHash(code, record.codeHash)) {
    await deps.otpRepo.incrementAttempts(email);
    return new OtpInvalid();
  }
  const user = existing ?? await deps.userRepo.create({
    id: deps.generateId(),
    email,
    ...registration,
    termsAccepted: true
  });
  const session = await deps.sessionRepo.create({
    id: deps.generateId(),
    userId: user.id,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  });
  await deps.otpRepo.consume(email);
  return { sessionId: session.id, userId: user.id, isNewUser: !existing, locale: user.locale };
};
const accessModule = lunette().provide(
  "verifyTx",
  (ctx) => window(
    ctx.db.transaction.bind(ctx.db),
    (tx) => ({
      otpRepo: otpRepo({ db: tx }),
      userRepo: userRepo({ db: tx }),
      sessionRepo: sessionRepo({ db: tx }),
      generateId: ctx.generateId
    })
  )
).expose((ctx) => bind({ requestCode })({ otpRepo: ctx.otpRepo, sendMail: ctx.sendMail })).expose((ctx) => bind({ findUserByEmail, getUserById })({ userRepo: ctx.userRepo })).expose((ctx) => bind({ verifyCode }).with(ctx.verifyTx)).as("access");
const displayName = (user) => user.displayName ?? user.email.split("@")[0] ?? user.email;
const colorFromId = (id) => {
  let hash = 0;
  for (const ch of id) hash = hash * 31 + ch.charCodeAt(0) | 0;
  return `hsl(${Math.abs(hash) % 360}, 70%, 50%)`;
};
const getIdentity = async (deps, userId) => {
  const user = await deps.userRepo.findById(userId);
  if (!user) return null;
  return { name: displayName(user), color: colorFromId(user.id), surfaceOptions: SURFACES };
};
const resolveSurface = (_deps, raw, fallback) => SURFACES.includes(raw ?? "") ? raw : fallback;
const setPreference = async (deps, userId, surface) => deps.userRepo.update(userId, { locale: surface });
const profileModule = lunette().expose(
  "profile",
  (ctx) => ({
    ...bind({ getIdentity, setPreference })({ userRepo: ctx.userRepo }),
    // The empty-deps case: a pure leaf bound with no dependencies.
    ...bind({ resolveSurface })({})
  })
);
const sanitizeRich = (html) => html.replace(/<script[\s\S]*?<\/script>/gi, "");
const identity = (text2) => text2;
const detectFormat = async (deps, text2, fallback, override) => {
  if (override) return override;
  try {
    return await deps.renderer.detect(text2);
  } catch {
    return fallback;
  }
};
const pLimit = async (limit, tasks) => {
  const results = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
};
const CONCURRENCY = 6;
const renderUpfront = async (deps, contentType, contentId, text2) => {
  await pLimit(
    CONCURRENCY,
    SURFACES.map((surface) => async () => {
      const output = deps.sanitize(await deps.renderer.render({ text: text2, surface, format: deps.format }));
      await deps.renderCache.upsert({ contentType, contentId, surface, output, source: "upfront" });
    })
  );
};
const getRendered = async (deps, contentType, contentId, text2, surface) => {
  const hit = await deps.renderCache.get({ contentType, contentId, surface });
  if (hit !== null) return hit;
  let output;
  try {
    output = deps.sanitize(await deps.renderer.render({ text: text2, surface, format: deps.format }));
  } catch (error) {
    if (error instanceof RenderFailed) return deps.sanitize(text2);
    throw error;
  }
  try {
    await deps.renderCache.upsert({ contentType, contentId, surface, output, source: "lazy" });
  } catch (error) {
    if (!(error instanceof DbOperationFailed)) throw error;
  }
  return output;
};
const getRenderedMany = async (deps, contentType, items, surface) => {
  const cached = await deps.renderCache.getMany(
    items.map((item) => ({ contentType, contentId: item.id, surface }))
  );
  const out = /* @__PURE__ */ new Map();
  const misses = [];
  for (const item of items) {
    const hit = cached.get(cacheKeyOf({ contentType, contentId: item.id, surface }));
    if (hit !== void 0) out.set(item.id, hit);
    else misses.push(item);
  }
  const rendered = await pLimit(
    CONCURRENCY,
    misses.map((item) => async () => {
      try {
        return [item.id, deps.sanitize(await deps.renderer.render({ text: item.text, surface, format: deps.format }))];
      } catch (error) {
        if (error instanceof RenderFailed) return [item.id, deps.sanitize(item.text)];
        throw error;
      }
    })
  );
  for (const [id, output] of rendered) out.set(id, output);
  return out;
};
const renderModule = lunette().expose(
  (ctx) => bind({ renderUpfront, getRendered, getRenderedMany })({
    renderer: ctx.renderer,
    renderCache: ctx.renderCache,
    format: "html",
    sanitize: sanitizeRich
  })
).expose(
  (ctx) => bind({
    renderUpfrontTitle: renderUpfront,
    getRenderedTitle: getRendered,
    getRenderedManyTitle: getRenderedMany
  })({
    renderer: ctx.renderer,
    renderCache: ctx.renderCache,
    format: "text",
    sanitize: identity
  })
).expose((ctx) => bind({ detectFormat })({ renderer: ctx.renderer }));
const getAuthor = async (deps, id) => {
  const user = await deps.userRepo.findById(id);
  return user ? { name: displayName(user), color: colorFromId(user.id) } : null;
};
const getAuthors = async (deps, ids) => {
  const users2 = await deps.userRepo.findByIds([...new Set(ids)]);
  return new Map(
    users2.map((user) => [user.id, { name: displayName(user), color: colorFromId(user.id) }])
  );
};
const DATA_URL = /<img[^>]+src="(data:([^;]+);base64,([^"]+))"/g;
const uploadInlineImages = async (input) => {
  const matches2 = [...input.html.matchAll(DATA_URL)];
  let html = input.html;
  const uploadedKeys = [];
  const compensate = async () => {
    await Promise.allSettled(uploadedKeys.map((key) => input.blobs.remove(key)));
  };
  try {
    for (const match of matches2) {
      const [, dataUrl, contentType, base64] = match;
      if (!dataUrl || !contentType || !base64) {
        await compensate();
        return new BodyImageRejected();
      }
      const ext = contentType.split("/")[1] ?? "bin";
      const key = `${input.entityType}/${input.entityId}/${input.generateId()}.${ext}`;
      await input.blobs.put(key, Buffer.from(base64, "base64"), contentType);
      uploadedKeys.push(key);
      html = html.replace(dataUrl, input.blobs.url(key));
    }
  } catch (error) {
    await compensate();
    throw error;
  }
  return { html, uploadedKeys };
};
const composeComment = async (deps, input) => {
  if (!input.body.trim()) return new CommentBodyRequired();
  if (!await deps.getPost(input.postId)) return new PostNotFound();
  if (input.parentId && !await deps.getComment(input.parentId))
    return new ParentCommentNotFound();
  const id = input.idempotencyKey ?? deps.generateId();
  const uploaded = await uploadInlineImages({
    blobs: deps.blobs,
    html: input.body,
    entityType: "comment",
    entityId: id,
    generateId: deps.generateId
  });
  if (isError(uploaded)) return uploaded;
  const origFormat = await deps.detectFormat(uploaded.html, "text", input.origFormat);
  const comment = await deps.createComment({
    id,
    postId: input.postId,
    authorId: input.authorId,
    parentId: input.parentId ?? null,
    body: uploaded.html,
    origFormat,
    createdAt: /* @__PURE__ */ new Date()
  });
  try {
    await deps.renderUpfront("comment-body", id, uploaded.html);
  } catch (error) {
    if (!(error instanceof RenderFailed) && !(error instanceof DbOperationFailed)) throw error;
  }
  return comment;
};
const getPostForReading = async (deps, id, surface, viewerId) => {
  const post2 = await deps.getPost(id);
  if (!post2) return new PostNotFound();
  if (post2.status !== "published" && post2.authorId !== viewerId) return new PostNotFound();
  const [body2, title, author] = await Promise.all([
    deps.getRendered("post-body", post2.id, post2.body, surface),
    deps.getRenderedTitle("post-title", post2.id, post2.title, surface),
    deps.getAuthor(post2.authorId)
  ]);
  if (!author) return new PostNotFound();
  return { id: post2.id, title, body: body2, authorName: author.name, authorColor: author.color, surface };
};
const listCommentsForReading = async (deps, postId, surface) => {
  const comments2 = await deps.listComments(postId);
  const [bodies, authors] = await Promise.all([
    deps.getRenderedMany("comment-body", comments2.map((c) => ({ id: c.id, text: c.body })), surface),
    deps.getAuthors(comments2.map((c) => c.authorId))
  ]);
  return comments2.flatMap((comment) => {
    const author = authors.get(comment.authorId);
    if (!author) return [];
    return [
      {
        id: comment.id,
        body: bodies.get(comment.id) ?? comment.body,
        authorName: author.name,
        authorColor: author.color
      }
    ];
  });
};
const listFeed = async (deps, surface) => {
  const posts2 = await deps.postRepo.listPublished();
  const [bodies, titles, authors, counts] = await Promise.all([
    deps.getRenderedMany("post-body", posts2.map((p) => ({ id: p.id, text: p.body })), surface),
    deps.getRenderedManyTitle("post-title", posts2.map((p) => ({ id: p.id, text: p.title })), surface),
    deps.getAuthors(posts2.map((p) => p.authorId)),
    deps.getCommentCounts(posts2.map((p) => p.id))
  ]);
  return posts2.flatMap((post2) => {
    const author = authors.get(post2.authorId);
    if (!author) return [];
    return [
      {
        id: post2.id,
        title: titles.get(post2.id) ?? post2.title,
        excerpt: (bodies.get(post2.id) ?? post2.body).slice(0, 140),
        authorName: author.name,
        authorColor: author.color,
        commentCount: counts.get(post2.id) ?? 0
      }
    ];
  });
};
const publishPost = async (deps, input) => {
  if (!input.title.trim()) return new PostTitleRequired();
  if (!input.body.trim()) return new PostBodyRequired();
  const id = input.idempotencyKey ?? deps.generateId();
  const uploaded = await uploadInlineImages({
    blobs: deps.blobs,
    html: input.body,
    entityType: "post",
    entityId: id,
    generateId: deps.generateId
  });
  if (isError(uploaded)) return uploaded;
  const origFormat = await deps.detectFormat(uploaded.html, "text", input.origFormat);
  const post2 = await deps.createPost({
    id,
    authorId: input.authorId,
    title: input.title,
    body: uploaded.html,
    origFormat,
    status: input.status,
    createdAt: /* @__PURE__ */ new Date()
  });
  if (input.status === "published") {
    try {
      await Promise.all([
        deps.renderUpfront("post-body", id, uploaded.html),
        deps.renderUpfrontTitle("post-title", id, input.title)
      ]);
    } catch (error) {
      if (!(error instanceof RenderFailed) && !(error instanceof DbOperationFailed)) throw error;
    }
  }
  return post2;
};
const threadsModule = lunette().provide((ctx) => ({
  getPost: ctx.postRepo.findById,
  createPost: ctx.postRepo.create,
  getComment: ctx.commentRepo.findById,
  createComment: ctx.commentRepo.create,
  getCommentCounts: ctx.commentRepo.countByPosts,
  listComments: ctx.commentRepo.listByPost
})).expose(bind({ getAuthor, getAuthors })).expose(bind({ publishPost })).expose(bind({ composeComment })).expose(bind({ getPostForReading })).expose(bind({ listFeed })).expose(bind({ listCommentsForReading })).as("threads");
const sessionReader = (cookie, sessions2) => async (request2) => {
  const id = await cookie.read(request2);
  if (!id) return null;
  return sessions2.findById(id);
};
const chain = lunette().use(withDb).expose("generateId", () => () => randomUUID()).provide("otpRepo", otpRepo).provide("userRepo", userRepo).provide("sessionRepo", sessionRepo).provide(
  "renderCache",
  ({ env, db }) => env.RENDER_CACHE === "on" ? renderCacheRepo({ db }) : noopRenderCache()
).provide("postRepo", postRepo).provide("commentRepo", commentRepo).provide(
  "transport",
  ({ env }) => env.MAILER_API_KEY ? httpTransport(env.MAILER_API_KEY) : env.DEV_MAIL_OUTBOX ? outboxTransport() : loggingTransport()
).provide(bind({ sendMail })).provide("renderer", renderer).provide("blobs", blobs).expose("sessionCookie", sessionCookie).expose("pendingCookie", pendingCookie).use(renderModule).expose(accessModule).expose(profileModule).expose(threadsModule).expose("getSession", (ctx) => sessionReader(ctx.sessionCookie, ctx.sessionRepo)).expose("validateEmail", () => validateEmail);
const optional = (schema2) => z.preprocess((v) => v === "" ? void 0 : v, schema2.optional());
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // PGlite: a filesystem path, or 'memory://' for an ephemeral in-process db.
  DATABASE_URL: z.string().default("memory://"),
  SESSION_SECRET: z.string().min(32).default("insecure-dev-session-secret-change-me!!"),
  // Feature flag — mailer: the real transactional sender when the key is
  // present; otherwise a logging sink (the demo path).
  MAILER_API_KEY: optional(z.string()),
  DEV_MAIL_OUTBOX: optional(z.string()),
  // Feature flag — renderer: the real rendering provider when its project id
  // is present; otherwise the deterministic fake.
  RENDERER_PROJECT_ID: optional(z.string()),
  // Feature flag — render cache: 'on' (DB-backed) by default; 'off' selects a
  // no-op cache (every read a miss → rendered fresh, every write dropped).
  // The conditional-birth resource whose DB layer is SKIPPED when off, exactly
  // like the mailer transport is skipped when its key is absent.
  RENDER_CACHE: z.enum(["on", "off"]).default("on"),
  // Feature flag — blobs: the real object store ONLY when ALL FIVE are
  // present (logical AND); otherwise the in-memory fake.
  BLOB_ENDPOINT: optional(z.string()),
  BLOB_REGION: optional(z.string()),
  BLOB_BUCKET: optional(z.string()),
  BLOB_ACCESS_KEY: optional(z.string()),
  BLOB_SECRET_KEY: optional(z.string())
}).superRefine((env, ctx) => {
  if (env.NODE_ENV !== "production") return;
  const require2 = (key, present, message) => {
    if (!present)
      ctx.addIssue({ code: "custom", path: [key], message });
  };
  require2("MAILER_API_KEY", env.MAILER_API_KEY, "required in production (no logger fallback: codes would leak to logs)");
  require2("RENDERER_PROJECT_ID", env.RENDERER_PROJECT_ID, "required in production (the fake serves placeholder output)");
  if (env.DEV_MAIL_OUTBOX)
    ctx.addIssue({ code: "custom", path: ["DEV_MAIL_OUTBOX"], message: "forbidden in production" });
  const blobs2 = [
    env.BLOB_ENDPOINT,
    env.BLOB_REGION,
    env.BLOB_BUCKET,
    env.BLOB_ACCESS_KEY,
    env.BLOB_SECRET_KEY
  ];
  if (!blobs2.every(Boolean))
    ctx.addIssue({ code: "custom", path: ["BLOB_ENDPOINT"], message: "all BLOB_* are required in production (the fake serves unusable memory:// urls)" });
});
const parseEnv = (raw) => {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:
${issues}`);
  }
  return result.data;
};
const channel = (key, parse) => (schema2) => async (carrier) => {
  const req = carrier.request;
  const raw = req === void 0 ? void 0 : await parse(await req.arrayBuffer(), req.headers).catch(() => void 0);
  const v = await validateInput(schema2, raw);
  return v.ok ? { [key]: v.params } : { issues: v.issues };
};
const bodyStep = channel(
  "body",
  async (bytes) => JSON.parse(new TextDecoder().decode(bytes))
);
const formStep = channel(
  "form",
  async (bytes, headers2) => Object.fromEntries(await new Response(bytes, { headers: headers2 }).formData())
);
const bodyRuntime = {
  methods(state, rebuild) {
    return {
      body(schema2) {
        return rebuild({ ...state, prepare: [...state.prepare, bodyStep(schema2)] });
      },
      form(schema2) {
        return rebuild({ ...state, prepare: [...state.prepare, formStep(schema2)] });
      }
    };
  }
};
const body = bodyRuntime;
const cookiesRuntime = {
  methods() {
    return {};
  },
  sink: () => {
    const pending = [];
    return {
      key: "cookies",
      ctx: {
        set: (name, value, options = {}) => pending.push({ name, value, options })
      },
      collect: () => pending
    };
  }
};
const cookies = cookiesRuntime;
const readCookies = (outcome) => outcome.effects.cookies ?? [];
const abort$1 = (intent) => ({ [ABORT]: true, intent });
const httpError = (status, body2) => abort$1(body2 === void 0 ? { kind: "status", status } : { kind: "status", status, body: body2 });
const notFound$1 = (body2) => httpError(404, body2);
const unauthorized$1 = (body2) => httpError(401, body2);
const redirect = (location, status = 302) => abort$1({ kind: "redirect", location, status });
const httpStatusSink = (status) => () => ({ key: "httpStatus", ctx: void 0, collect: () => status });
const runtime$1 = {
  methods(state, rebuild) {
    return {
      params(schema2) {
        return rebuild({ ...state, schema: schema2 });
      },
      status(n) {
        return rebuild({ ...state, sinks: [...state.sinks, httpStatusSink(n)] });
      }
    };
  }
};
const http = runtime$1;
const abort = (code, message) => ({
  [ABORT]: true,
  intent: { kind: "code", code, ...message === void 0 ? {} : { message } }
});
const notFound = (message) => abort("NOT_FOUND", message);
const unauthorized = (message) => abort("UNAUTHORIZED", message);
const forbidden = (message) => abort("FORBIDDEN", message);
const conflict = (message) => abort("CONFLICT", message);
const tooManyRequests = (message) => abort("TOO_MANY_REQUESTS", message);
const unprocessableContent = (message) => abort("UNPROCESSABLE_CONTENT", message);
const runtime = {
  methods(state, rebuild) {
    return {
      input(schema2) {
        return rebuild({ ...state, schema: schema2 });
      }
    };
  }
};
const rpc = runtime;
const sessionGuard = (deps, ctx) => deps.getSession(ctx.request).then((session) => ({ session }));
const authGuard = (_deps, ctx) => ctx.session ? { session: ctx.session } : unauthorized$1();
const authGuardRpc = (_deps, ctx) => ctx.session ? { session: ctx.session } : unauthorized();
const pendingGuard = (deps, ctx) => deps.pendingCookie.read(ctx.request).then((pending) => pending ? { pending } : unauthorized$1());
const STATUS_BY_TAG = {
  PostTitleRequired: 422,
  PostBodyRequired: 422,
  CommentBodyRequired: 422,
  BodyImageRejected: 422,
  PostNotFound: 404,
  ParentCommentNotFound: 404,
  OtpInvalid: 401,
  OtpExpired: 401,
  OtpMaxAttemptsExceeded: 429,
  RegistrationRequired: 422
};
const httpAbortFor = (error) => httpError(STATUS_BY_TAG[error._tag] ?? 422, { error: error._tag });
const CODE_BY_TAG = {
  PostTitleRequired: "UNPROCESSABLE_CONTENT",
  PostBodyRequired: "UNPROCESSABLE_CONTENT",
  CommentBodyRequired: "UNPROCESSABLE_CONTENT",
  BodyImageRejected: "UNPROCESSABLE_CONTENT",
  PostNotFound: "NOT_FOUND",
  ParentCommentNotFound: "NOT_FOUND",
  OtpInvalid: "UNAUTHORIZED",
  OtpExpired: "UNAUTHORIZED",
  OtpMaxAttemptsExceeded: "TOO_MANY_REQUESTS",
  RegistrationRequired: "UNPROCESSABLE_CONTENT"
};
const rpcAbortFor = (error) => ({
  NOT_FOUND: notFound,
  UNAUTHORIZED: unauthorized,
  FORBIDDEN: forbidden,
  CONFLICT: conflict,
  TOO_MANY_REQUESTS: tooManyRequests,
  UNPROCESSABLE_CONTENT: unprocessableContent
})[CODE_BY_TAG[error._tag] ?? "UNPROCESSABLE_CONTENT"](error._tag);
const feedGuard = (deps) => deps.threads.listFeed("feed").then((feed) => ({ feed }));
const feedHandler = (_deps, ctx) => ({
  feed: ctx.feed
});
const postGuard = (deps, ctx) => deps.threads.getPostForReading(ctx.params.postId, "web", ctx.session?.userId).then((post2) => isError(post2) ? notFound$1() : { post: post2 });
const postGuardRpc = (deps, ctx) => deps.threads.getPostForReading(ctx.params.postId, "web", ctx.session?.userId).then((post2) => isError(post2) ? notFound() : { post: post2 });
const postHandler = (_deps, ctx) => ({ post: ctx.post });
const publishBody = z.object({
  title: z.string().optional(),
  body: z.string().optional(),
  status: z.enum(["draft", "published"]).optional()
});
const publishHandler = (deps, authorId, fields) => deps.threads.publishPost({
  authorId,
  title: fields.title ?? "",
  body: fields.body ?? "",
  status: fields.status ?? "published"
}).then((result) => isError(result) ? httpAbortFor(result) : { post: result });
const publishHandlerRpc = (deps, authorId, fields) => deps.threads.publishPost({
  authorId,
  title: fields.title ?? "",
  body: fields.body ?? "",
  status: fields.status ?? "published"
}).then((result) => isError(result) ? rpcAbortFor(result) : { post: result });
const commentBody = z.object({ body: z.string().optional(), parentId: z.string().optional() });
const commentHandler = (deps, postId, authorId, fields) => deps.threads.composeComment({
  postId,
  authorId,
  body: fields.body ?? "",
  ...fields.parentId !== void 0 && { parentId: fields.parentId }
}).then((result) => isError(result) ? httpAbortFor(result) : { comment: result });
const commentHandlerRpc = (deps, postId, authorId, fields) => deps.threads.composeComment({
  postId,
  authorId,
  body: fields.body ?? "",
  ...fields.parentId !== void 0 && { parentId: fields.parentId }
}).then((result) => isError(result) ? rpcAbortFor(result) : { comment: result });
const commentsHandler = async (deps, ctx) => {
  const surface = deps.profile.resolveSurface(void 0, "web");
  const comments2 = await deps.threads.listCommentsForReading(ctx.params.postId, surface);
  return { comments: comments2 };
};
const identityHandler = async (deps, ctx) => {
  const identity2 = await deps.profile.getIdentity(ctx.session.userId);
  return identity2 ? { identity: identity2 } : notFound$1();
};
const identityHandlerRpc = async (deps, ctx) => {
  const identity2 = await deps.profile.getIdentity(ctx.session.userId);
  return identity2 ? { identity: identity2 } : notFound();
};
const preferenceHandler = (deps, userId, rawSurface) => {
  const surface = deps.profile.resolveSurface(rawSurface, "web");
  return deps.profile.setPreference(userId, surface).then((user) => ({ locale: user.locale }));
};
const loginGuard = async (deps, ctx) => {
  const email = ctx.form.email;
  if (!deps.validateEmail(email)) return httpError(422, { error: "invalid-email" });
  const nonce = deps.generateId();
  await deps.access.requestCode(email, nonce);
  deps.pendingCookie.apply(ctx.cookies, { email, nonce });
  return {};
};
const loginForm = z.object({ email: z.string() });
const verifyHandler = async (deps, ctx) => {
  const registration = ctx.pending.registration ?? (ctx.body.termsAccepted ? {
    termsAccepted: true,
    ...ctx.body.displayName !== void 0 && { displayName: ctx.body.displayName }
  } : void 0);
  const result = await deps.access.verifyCode(
    ctx.pending.email,
    ctx.body.code ?? "",
    ctx.pending.nonce,
    registration
  );
  if (isError(result)) return httpAbortFor(result);
  deps.sessionCookie.apply(ctx.cookies, result.sessionId);
  deps.pendingCookie.drop(ctx.cookies);
  return redirect(ctx.pending.returnTo ?? "/");
};
const verifyBody = z.object({
  code: z.string().optional(),
  displayName: z.string().optional(),
  termsAccepted: z.boolean().optional()
});
const verifyForm = z.object({
  code: z.string().optional(),
  displayName: z.string().optional(),
  termsAccepted: z.union([z.literal("on"), z.literal("true")]).optional().transform((v) => v !== void 0)
});
const logoutHandler = (deps, ctx) => {
  deps.sessionCookie.drop(ctx.cookies);
  return redirect("/");
};
const gated = () => scope().extend(http).guard(sessionGuard).guard(authGuard);
const gatedWith = (schema2) => scope().extend(http).params(schema2).guard(sessionGuard).guard(authGuard);
const gatedRpc = () => scope().extend(rpc).guard(sessionGuard).guard(authGuardRpc);
const gatedWithRpc = (schema2) => scope().extend(rpc).input(schema2).guard(sessionGuard).guard(authGuardRpc);
const feedScope = scope().guard(feedGuard).handle(feedHandler);
const postScope = scope().extend(http).params(z.object({ postId: z.string() })).guard(sessionGuard).guard(postGuard).handle((_deps, ctx) => postHandler(_deps, ctx));
scope().extend(rpc).input(z.object({ postId: z.string() })).guard(sessionGuard).guard(postGuardRpc).handle((_deps, ctx) => postHandler(_deps, ctx));
gated().extend(body).body(publishBody).handle((deps, ctx) => publishHandler(deps, ctx.session.userId, ctx.body));
const publishPostFormScope = gated().extend(body).form(publishBody).handle((deps, ctx) => publishHandler(deps, ctx.session.userId, ctx.form));
gatedWithRpc(
  z.object({
    title: z.string(),
    body: z.string(),
    status: z.enum(["draft", "published"]).optional()
  })
).handle((deps, ctx) => publishHandlerRpc(deps, ctx.session.userId, ctx.params));
gatedWith(z.object({ postId: z.string() })).extend(body).body(commentBody).handle(
  (deps, ctx) => commentHandler(deps, ctx.params.postId, ctx.session.userId, ctx.body)
);
gatedWithRpc(
  z.object({
    postId: z.string(),
    body: z.string(),
    parentId: z.string().optional()
  })
).handle(
  (deps, ctx) => commentHandlerRpc(deps, ctx.params.postId, ctx.session.userId, ctx.params)
);
scope().extend(http).params(z.object({ postId: z.string() })).handle(commentsHandler);
scope().extend(rpc).input(z.object({ postId: z.string() })).handle(commentsHandler);
const identityScope = gated().handle(identityHandler);
gatedRpc().handle(identityHandlerRpc);
const setPreferenceScope = gated().extend(body).body(z.object({ surface: z.string().optional() })).handle(
  (deps, ctx) => preferenceHandler(deps, ctx.session.userId, ctx.body.surface)
);
gatedWithRpc(z.object({ surface: z.string() })).handle(
  (deps, ctx) => preferenceHandler(deps, ctx.session.userId, ctx.params.surface)
);
const loginScope = scope().extend(http).extend(body).extend(cookies).form(loginForm).guard(loginGuard).handle(() => ({ ok: true }));
scope().extend(http).extend(body).extend(cookies).body(verifyBody).guard(pendingGuard).handle(verifyHandler);
const verifyFormScope = scope().extend(http).extend(body).extend(cookies).form(verifyForm).guard(pendingGuard).handle(
  (deps, ctx) => verifyHandler(deps, { pending: ctx.pending, body: ctx.form, cookies: ctx.cookies })
);
const logoutScope = scope().extend(http).extend(cookies).handle(logoutHandler);
const requestRuntime = {
  methods() {
    return {};
  }
};
const request = requestRuntime;
function serializeCookie({ name, value, options }) {
  const parts = [`${name}=${value}`];
  if (options.path !== void 0) parts.push(`Path=${options.path}`);
  if (options.maxAge !== void 0) parts.push(`Max-Age=${options.maxAge}`);
  if (options.sameSite !== void 0) {
    parts.push(`SameSite=${options.sameSite[0].toUpperCase()}${options.sameSite.slice(1)}`);
  }
  if (options.secure === true) parts.push("Secure");
  if (options.httpOnly === true) parts.push("HttpOnly");
  return parts.join("; ");
}
const responseHeaders = (outcome) => {
  const written = readHeaders(outcome);
  const cookies2 = readCookies(outcome);
  if (cookies2.length === 0 && [...written.keys()].length === 0) return void 0;
  const headers2 = new Headers(written);
  for (const cookie of cookies2) headers2.append("Set-Cookie", serializeCookie(cookie));
  return headers2;
};
const merge = (into, extra) => {
  const merged = new Headers(into);
  if (extra) for (const [name, value] of extra) merged.append(name, value);
  return merged;
};
const isData = (value) => typeof value === "object" && value !== null && "data" in value && "init" in value;
function render(outcome) {
  const headers2 = responseHeaders(outcome);
  if (outcome.ok) {
    const value = outcome.value;
    if (value instanceof Response) {
      if (!headers2) return value;
      return new Response(value.body, {
        status: value.status,
        statusText: value.statusText,
        headers: merge(value.headers, headers2)
      });
    }
    if (isData(value)) {
      const init = value.init ?? {};
      return data(value.data, { ...init, headers: merge(init.headers, headers2) });
    }
    return headers2 ? data(value, { headers: headers2 }) : value;
  }
  if ("invalid" in outcome) {
    throw data(
      { issues: outcome.invalid.issues },
      headers2 ? { status: 422, headers: headers2 } : { status: 422 }
    );
  }
  const intent = outcome.abort.intent;
  if (intent.kind === "redirect") {
    return redirect$1(intent.location, headers2 ? { status: intent.status, headers: headers2 } : intent.status);
  }
  throw data(
    intent.kind === "status" ? intent.body ?? null : null,
    headers2 ? { status: intent.status, headers: headers2 } : { status: intent.status }
  );
}
function reactRouter(chain2, seedFrom, options = {}) {
  const { ensure, dispose } = buildOnce(chain2);
  const key = options.contextKey ?? "__wireApp";
  const base = scope().extend(request);
  const mount = async (hostEnv2) => ({ [key]: (await ensure(() => seedFrom(hostEnv2))).app });
  const toLoader2 = (handler) => async (args) => render(
    await runScope(
      handler,
      (await ensure(() => seedFrom(args.context))).app,
      { request: args.request },
      args.params
    )
  );
  const toAction2 = toLoader2;
  return { guard: base.guard, handle: base.handle, toLoader: toLoader2, toAction: toAction2, mount, dispose };
}
const hostEnv = () => parseEnv(process.env);
const pack = reactRouter(chain, () => ({ env: hostEnv() }));
const { toLoader, toAction } = pack;
const settings = {
  ui: { title: "@lntt/example-app on React Router 7" }
};
const loader$5 = toLoader(scope().extend(headers$1).headers({
  "cache-control": "public, max-age=30"
}).guard(feedGuard).handle(feedHandler));
function headers({
  loaderHeaders
}) {
  return loaderHeaders;
}
const home = UNSAFE_withComponentProps(function Home({
  loaderData
}) {
  const {
    feed
  } = loaderData;
  return /* @__PURE__ */ jsxs("main", {
    children: [/* @__PURE__ */ jsx("h1", {
      children: settings.ui.title
    }), feed.length === 0 ? /* @__PURE__ */ jsx("p", {
      children: "No posts yet."
    }) : /* @__PURE__ */ jsx("ul", {
      children: feed.map((post2) => /* @__PURE__ */ jsx("li", {
        children: /* @__PURE__ */ jsx(Link, {
          to: `/posts/${post2.id}`,
          children: post2.title
        })
      }, post2.id))
    }), /* @__PURE__ */ jsxs("nav", {
      children: [/* @__PURE__ */ jsx(Link, {
        to: "/login",
        children: "Sign in"
      }), " · ", /* @__PURE__ */ jsx(Link, {
        to: "/posts/new",
        children: "New post"
      }), " ·", " ", /* @__PURE__ */ jsx(Link, {
        to: "/me",
        children: "Profile"
      })]
    })]
  });
});
const ErrorBoundary$2 = UNSAFE_withErrorBoundaryProps(function ErrorBoundary() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return /* @__PURE__ */ jsxs("main", {
      children: [/* @__PURE__ */ jsx("h1", {
        children: error.status
      }), /* @__PURE__ */ jsx("p", {
        children: "Nothing to show."
      })]
    });
  }
  throw error;
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary: ErrorBoundary$2,
  default: home,
  headers,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = toLoader(postScope);
const post = UNSAFE_withComponentProps(function Post({
  loaderData
}) {
  const {
    post: post2
  } = loaderData;
  return /* @__PURE__ */ jsxs("main", {
    children: [/* @__PURE__ */ jsxs("article", {
      children: [/* @__PURE__ */ jsx("h1", {
        children: post2.title
      }), /* @__PURE__ */ jsx("p", {
        children: post2.body
      })]
    }), /* @__PURE__ */ jsx(Link, {
      to: "/",
      children: "Back to the feed"
    })]
  });
});
const ErrorBoundary$1 = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  const error = useRouteError();
  if (isRouteErrorResponse(error)) {
    return /* @__PURE__ */ jsxs("main", {
      children: [/* @__PURE__ */ jsx("h1", {
        children: error.status === 404 ? "Post not found" : error.status
      }), /* @__PURE__ */ jsx(Link, {
        to: "/",
        children: "Back to the feed"
      })]
    });
  }
  throw error;
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary: ErrorBoundary$1,
  default: post,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const scopeLoader = toLoader(feedScope);
const csv = (rows) => ["id,title", ...rows.map((r) => `${r.id},${JSON.stringify(r.title)}`)].join("\n");
const unwrap = (out) => {
  if (out instanceof Response) throw out;
  if (out && typeof out === "object" && "data" in out && "init" in out) {
    return out.data;
  }
  return out;
};
async function loader$3(args) {
  const {
    feed
  } = unwrap(await scopeLoader(args));
  return new Response(csv(feed), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="feed.csv"'
    }
  });
}
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const action$4 = toAction(publishPostFormScope);
const publish = UNSAFE_withComponentProps(function Publish() {
  return /* @__PURE__ */ jsxs("main", {
    children: [/* @__PURE__ */ jsx("h1", {
      children: "New post"
    }), /* @__PURE__ */ jsxs(Form, {
      method: "post",
      children: [/* @__PURE__ */ jsxs("label", {
        children: ["Title ", /* @__PURE__ */ jsx("input", {
          name: "title",
          required: true
        })]
      }), /* @__PURE__ */ jsxs("label", {
        children: ["Body ", /* @__PURE__ */ jsx("textarea", {
          name: "body",
          required: true
        })]
      }), /* @__PURE__ */ jsx("button", {
        type: "submit",
        children: "Publish"
      })]
    })]
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4,
  default: publish
}, Symbol.toStringTag, { value: "Module" }));
const loader$2 = toLoader(identityScope);
const action$3 = toAction(setPreferenceScope);
const me = UNSAFE_withComponentProps(function Me({
  loaderData
}) {
  const profile = loaderData;
  return /* @__PURE__ */ jsxs("main", {
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Your profile"
    }), /* @__PURE__ */ jsx("pre", {
      children: JSON.stringify(profile, null, 2)
    }), /* @__PURE__ */ jsxs(Form, {
      method: "post",
      children: [/* @__PURE__ */ jsxs("label", {
        children: ["Preferred surface ", /* @__PURE__ */ jsx("input", {
          name: "surface"
        })]
      }), /* @__PURE__ */ jsx("button", {
        type: "submit",
        children: "Save"
      })]
    })]
  });
});
const ErrorBoundary3 = UNSAFE_withErrorBoundaryProps(function ErrorBoundary4() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 401) {
    return /* @__PURE__ */ jsx("main", {
      children: /* @__PURE__ */ jsx("h1", {
        children: "Please sign in"
      })
    });
  }
  throw error;
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary: ErrorBoundary3,
  action: action$3,
  default: me,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = toLoader(scope().extend(request).extend(cookies).guard(feedGuard).handle((_deps, ctx) => {
  const url = new URL(ctx.request.url);
  if (url.searchParams.get("go") === "away") throw redirect$1("/");
  if (url.searchParams.has("accepted")) {
    ctx.cookies.set("seen", "1", {
      path: "/"
    });
    return data({
      queued: true,
      posts: ctx.feed.length
    }, {
      status: 202
    });
  }
  if (url.searchParams.has("text")) {
    return new Response(ctx.feed.map((post2) => post2.title).join("\n"), {
      status: 200,
      headers: {
        "content-type": "text/plain; charset=utf-8"
      }
    });
  }
  return {
    via: "the ordinary path",
    posts: ctx.feed.length
  };
}));
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const action$2 = toAction(loginScope);
const login = UNSAFE_withComponentProps(function Login() {
  const result = useActionData();
  return /* @__PURE__ */ jsxs("main", {
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Sign in"
    }), result?.ok ? /* @__PURE__ */ jsx("p", {
      children: "Check your inbox for the code."
    }) : /* @__PURE__ */ jsxs(Form, {
      method: "post",
      children: [/* @__PURE__ */ jsxs("label", {
        children: ["Email ", /* @__PURE__ */ jsx("input", {
          type: "email",
          name: "email",
          required: true
        })]
      }), /* @__PURE__ */ jsx("button", {
        type: "submit",
        children: "Send me a code"
      })]
    })]
  });
});
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  default: login
}, Symbol.toStringTag, { value: "Module" }));
const action$1 = toAction(verifyFormScope);
const verify = UNSAFE_withComponentProps(function Verify() {
  return /* @__PURE__ */ jsxs("main", {
    children: [/* @__PURE__ */ jsx("h1", {
      children: "Enter your code"
    }), /* @__PURE__ */ jsxs(Form, {
      method: "post",
      children: [/* @__PURE__ */ jsxs("label", {
        children: ["Code ", /* @__PURE__ */ jsx("input", {
          name: "code",
          inputMode: "numeric",
          required: true
        })]
      }), /* @__PURE__ */ jsxs("label", {
        children: ["Display name ", /* @__PURE__ */ jsx("input", {
          name: "displayName",
          required: true
        })]
      }), /* @__PURE__ */ jsxs("label", {
        children: [/* @__PURE__ */ jsx("input", {
          type: "checkbox",
          name: "termsAccepted",
          value: "on",
          required: true
        }), " I accept the terms"]
      }), /* @__PURE__ */ jsx("button", {
        type: "submit",
        children: "Verify"
      })]
    })]
  });
});
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: verify
}, Symbol.toStringTag, { value: "Module" }));
const action = toAction(logoutScope);
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action
}, Symbol.toStringTag, { value: "Module" }));
function loader() {
  if (process.env["DEV_MAIL_OUTBOX"] !== "1") return new Response(null, {
    status: 404
  });
  return Response.json(outbox.at(-1) ?? null);
}
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-1dRhBR-P.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-5ENdDFt3.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/home": { "id": "routes/home", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/home-1Yl6eR5j.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/post": { "id": "routes/post", "parentId": "root", "path": "posts/:postId", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/post-Cx0Q1VTy.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/feed-csv": { "id": "routes/feed-csv", "parentId": "root", "path": "feed.csv", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/feed-csv-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/publish": { "id": "routes/publish", "parentId": "root", "path": "posts/new", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/publish-B24l9hhS.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/me": { "id": "routes/me", "parentId": "root", "path": "me", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/me-mnwnwr9M.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/native": { "id": "routes/native", "parentId": "root", "path": "native", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/native-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/login": { "id": "routes/login", "parentId": "root", "path": "login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/login-BwwIP09F.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/verify": { "id": "routes/verify", "parentId": "root", "path": "verify", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/verify-DkcEyhv2.js", "imports": ["/assets/jsx-runtime-BLUUWDF9.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/logout": { "id": "routes/logout", "parentId": "root", "path": "logout", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/logout-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/dev.outbox": { "id": "routes/dev.outbox", "parentId": "root", "path": "dev/outbox", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/dev.outbox-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-1a46251a.js", "version": "1a46251a", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "v8_passThroughRequests": false, "v8_trailingSlashAwareDataRequests": false, "unstable_previewServerPrerendering": false, "v8_middleware": true, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/home": {
    id: "routes/home",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route1
  },
  "routes/post": {
    id: "routes/post",
    parentId: "root",
    path: "posts/:postId",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/feed-csv": {
    id: "routes/feed-csv",
    parentId: "root",
    path: "feed.csv",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/publish": {
    id: "routes/publish",
    parentId: "root",
    path: "posts/new",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/me": {
    id: "routes/me",
    parentId: "root",
    path: "me",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/native": {
    id: "routes/native",
    parentId: "root",
    path: "native",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/login": {
    id: "routes/login",
    parentId: "root",
    path: "login",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/verify": {
    id: "routes/verify",
    parentId: "root",
    path: "verify",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/logout": {
    id: "routes/logout",
    parentId: "root",
    path: "logout",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/dev.outbox": {
    id: "routes/dev.outbox",
    parentId: "root",
    path: "dev/outbox",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
