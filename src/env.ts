import type { EnvConfig } from "./types"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { resolve } from "node:path"

const expandHome = (value: string): string => {
  if (!value.startsWith("~")) return value
  return value.replace(/^~(?=\/|$)/, homedir())
}

const parseBool = (value: string | undefined, fallback = false): boolean => {
  if (value == null) return fallback
  return ["1", "true", "yes", "on"].includes(value.toLowerCase())
}

const parseDotEnv = (content: string): Record<string, string> => {
  const env: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const equals = trimmed.indexOf("=")
    if (equals === -1) continue
    const key = trimmed.slice(0, equals).trim()
    if (!key) continue
    let value = trimmed.slice(equals + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    env[key] = value
  }
  return env
}

const loadDotEnv = async (): Promise<void> => {
  const path = resolve(process.cwd(), ".env")
  try {
    const content = await readFile(path, "utf8")
    const parsed = parseDotEnv(content)
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] == null) process.env[key] = value
    }
  } catch {
    // Optional local config file.
  }
}

export const loadEnv = async (): Promise<EnvConfig> => {
  await loadDotEnv()
  const url = process.env.PTERODACTYL_URL?.trim()
  const clientKey = process.env.PTERODACTYL_CLIENT_KEY?.trim()

  if (!url) throw new Error("Missing PTERODACTYL_URL")
  if (!clientKey) throw new Error("Missing PTERODACTYL_CLIENT_KEY")

  const sftpKey = process.env.PTERODACTYL_SFTP_KEY?.trim()
  const tenant = process.env.PTERODACTYL_TENANT?.trim()

  return {
    url,
    clientKey,
    sftp: parseBool(process.env.PTERODACTYL_SFTP, false),
    ...(sftpKey ? { sftpKey: expandHome(sftpKey) } : {}),
    ...(tenant ? { tenant } : {}),
  }
}
