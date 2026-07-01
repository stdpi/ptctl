import type { Result } from "./types"

export const ok = <T>(kind: string, data: T, meta?: Record<string, unknown>, hints?: string[]): Result<T> => ({
  ok: true,
  kind,
  data,
  ...(meta ? { meta } : {}),
  ...(hints?.length ? { hints } : {}),
})

export const fail = (
  message: string,
  options: Omit<Extract<Result<never>, { ok: false }>, "ok" | "kind" | "message"> = {},
): Result<never> => ({
  ok: false,
  kind: "error",
  message,
  ...options,
})
