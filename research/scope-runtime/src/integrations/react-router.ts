import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router'
import type { ScopeHandler } from '../scope/kit.ts'
import { outcomeToResponse } from './http-codec.ts'

// React Router 7 adapter. A loader/action is `(args) => Response`; RR7 borrows
// nothing from us but the socket — we translate its calling convention into a
// request scope, run the scope handler, and map the outcome with the HTTP
// codec. RR7's own params are `string | undefined`; the scope wants defined
// keys, so undefined route params are dropped.
const coerceParams = (p: Readonly<Record<string, string | undefined>>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(p).filter((e): e is [string, string] => e[1] !== undefined),
  )

export const toLoader =
  <R>(handler: ScopeHandler<R>) =>
  async (args: LoaderFunctionArgs): Promise<Response> =>
    outcomeToResponse(await handler({ request: args.request, params: coerceParams(args.params) }))

export const toAction =
  <R>(handler: ScopeHandler<R>) =>
  async (args: ActionFunctionArgs): Promise<Response> =>
    outcomeToResponse(await handler({ request: args.request, params: coerceParams(args.params) }))
