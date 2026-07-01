import type { Result } from "./types"
import { presentDetail, presentFilesList, presentServersList } from "./presenter"

const stableStringify = (value: unknown): string => JSON.stringify(value, null, 2)

const renderHumanValue = (value: unknown, depth = 0): string => {
  if (value == null) return ""
  if (typeof value !== "object") return String(value)
  if (Array.isArray(value)) return value.map((item) => `${"  ".repeat(depth)}- ${renderHumanValue(item, depth + 1)}`).join("\n")
  return presentDetail(value as Record<string, unknown>)
}

export const renderResult = (result: Result<unknown>, options: { json: boolean; verbose: boolean; compact: boolean }): string => {
  if (options.json) return stableStringify(result)
  if (!result.ok) {
    const parts = [`error: ${result.message}`]
    if (result.status) parts.push(`status: ${result.status}`)
    if (result.request && options.verbose) parts.push(`request: ${stableStringify(result.request)}`)
    if (result.body != null && options.verbose) parts.push(`body: ${stableStringify(result.body)}`)
    if (result.stack && options.verbose) parts.push(`stack: ${result.stack}`)
    return parts.join("\n")
  }

  if (typeof result.data === "string") return result.data

  if (result.kind === "servers.list" && Array.isArray(result.data)) return presentServersList(result.data as Array<Record<string, unknown>>)
  if (result.kind === "files.list" && Array.isArray(result.data)) return presentFilesList(result.data as Array<Record<string, unknown>>)

  if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
    return renderHumanValue(result.data)
  }

  return renderHumanValue(result)
}
