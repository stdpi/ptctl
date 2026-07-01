const sortKeys = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))

const oneLine = (value: unknown): string => {
  if (value == null) return "-"
  if (Array.isArray(value)) return value.map(oneLine).filter((item) => item !== "-").join(", ") || "-"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

export const presentServersList = (servers: Array<Record<string, unknown>>): string =>
  servers
    .map((server) => {
      const identifier = oneLine(server.identifier ?? server.server_identifier ?? server.uuid)
      const name = oneLine(server.name)
      const status = oneLine(server.status ?? (server.is_suspended ? "suspended" : null))
      const limits = server.limits && typeof server.limits === "object" ? (server.limits as Record<string, unknown>) : {}
      const memory = oneLine(limits.memory)
      const cpu = oneLine(limits.cpu)
      const node = oneLine(server.node)
      return [identifier, name, status, `${memory}MiB`, `${cpu}% CPU`, node].join("  ")
    })
    .join("\n")

export const presentFilesList = (files: Array<Record<string, unknown>>): string =>
  files
    .map((file) => {
      const name = oneLine(file.name)
      const size = oneLine(file.size)
      const mode = oneLine(file.mode)
      const type = file.is_file ? "file" : file.is_symlink ? "link" : "dir"
      return [type, name, size === "-" ? "-" : `${size}B`, mode].join("  ")
    })
    .join("\n")

const presentEntry = (key: string, value: unknown, depth: number): string => {
  const pad = "  ".repeat(depth)
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}${key}: []`
    if (value.every((item) => item == null || typeof item !== "object")) return `${pad}${key}: ${value.map(oneLine).join(", ")}`
    return [
      `${pad}${key}:`,
      ...value.map((item) => `${pad}  - ${typeof item === "object" && item != null ? JSON.stringify(item) : oneLine(item)}`),
    ].join("\n")
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(sortKeys(value as Record<string, unknown>))
    return [
      `${pad}${key}:`,
      ...entries.map(([childKey, childValue]) => presentEntry(childKey, childValue, depth + 1)),
    ].join("\n")
  }
  return `${pad}${key}: ${oneLine(value)}`
}

export const presentDetail = (value: Record<string, unknown>): string =>
  Object.entries(sortKeys(value))
    .map(([key, entry]) => presentEntry(key, entry, 0))
    .join("\n")
