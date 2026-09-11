/**
 * The gateway request door, as every caller sees it.
 *
 * This is the shape of `useGatewayRequest().requestGateway` written down once,
 * instead of three times in three layers:
 *
 *  - `app/contrib/types.ts` derived it with `ReturnType<typeof useGatewayRequest>`,
 *    which forced a type-only file to import the whole hook (and, through it,
 *    the app's page surface) just to name a signature;
 *  - `lib/yolo-session.ts` and `app/shell/hooks/use-status-snapshot.ts` each
 *    declared their own narrower copy — and both dropped `timeoutMs`/`signal`,
 *    so a caller holding one of those views could not pass a deadline through.
 *
 * A signature is a shape, so it belongs in a shape module: nothing here imports
 * a store, a component or a hook, which is what lets the store and `lib/` name
 * it without depending upward.
 */
export type GatewayRequester = <T>(
  method: string,
  params?: Record<string, unknown>,
  timeoutMs?: number,
  signal?: AbortSignal
) => Promise<T>
