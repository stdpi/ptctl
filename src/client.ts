import { ApiError } from "./errors"
import type { Account, Backup, FileEntry, RedactedRequest, ServerSummary, SshKey } from "./types"

type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
  textBody?: string
  accept?: string
}

const normalizeBaseUrl = (value: string): string => {
  const url = new URL(value)
  const path = url.pathname.replace(/\/$/, "")
  if (path.endsWith("/api/client")) url.pathname = "/"
  return url.toString().replace(/\/$/, "")
}

const redactHeaders = (headers: Headers): Record<string, string> => ({
  Authorization: headers.get("Authorization") ? "Bearer [redacted]" : "",
  Accept: headers.get("Accept") ?? "",
  "Content-Type": headers.get("Content-Type") ?? "",
})

const withQuery = (path: string, query?: RequestOptions["query"]): string => {
  if (!query) return path
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null) continue
    search.set(key, String(value))
  }
  const suffix = search.toString()
  return suffix ? `${path}?${suffix}` : path
}

export class PterodactylClient {
  constructor(
    private readonly config: {
      url: string
      clientKey: string
    },
  ) {}

  private request = async <T>(method: string, path: string, options: RequestOptions = {}): Promise<T> => {
    const url = new URL(path, normalizeBaseUrl(this.config.url)).toString()
    const finalUrl = withQuery(url, options.query)
    const headers = new Headers()
    headers.set("Authorization", `Bearer ${this.config.clientKey}`)
    headers.set("Accept", options.accept ?? "Application/vnd.pterodactyl.v1+json")

    const init: RequestInit = { method, headers }
    if (options.textBody != null) {
      headers.set("Content-Type", "text/plain")
      init.body = options.textBody
    } else if (options.body != null) {
      headers.set("Content-Type", "application/json")
      init.body = JSON.stringify(options.body)
    }

    const request: RedactedRequest = { method, url: finalUrl, headers: redactHeaders(headers) }
    const response = await fetch(finalUrl, init)
    const contentType = response.headers.get("content-type") ?? ""
    const raw = contentType.includes("application/json") ? await response.json() : await response.text()

    if (!response.ok) {
      const message = typeof raw === "object" && raw && "errors" in raw ? "API request failed" : `HTTP ${response.status}`
      throw new ApiError(message, response.status, raw, request)
    }

    return raw as T
  }

  account = () => this.request<{ attributes: Account }>("GET", "/api/client/account")

  servers = {
    list: (query?: RequestOptions["query"]) => this.request<{ data: Array<{ attributes: ServerSummary }> }>("GET", "/api/client", { query }),
    get: (server: string) => this.request<{ attributes: ServerSummary }>("GET", `/api/client/servers/${server}`),
    resources: (server: string) => this.request<{ attributes: Record<string, unknown> }>("GET", `/api/client/servers/${server}/resources`),
    websocket: (server: string) => this.request<{ data: { token: string; socket: string } }>("GET", `/api/client/servers/${server}/websocket`),
    command: (server: string, command: string) => this.request<null>("POST", `/api/client/servers/${server}/command`, { body: { command } }),
    power: (server: string, signal: "start" | "stop" | "restart" | "kill") => this.request<null>("POST", `/api/client/servers/${server}/power`, { body: { signal } }),
    databases: (server: string) => this.request<{ data: Array<{ attributes: Record<string, unknown> }> }>("GET", `/api/client/servers/${server}/databases`),
    backups: (server: string) => this.request<{ data: Array<{ attributes: Backup }> }>("GET", `/api/client/servers/${server}/backups`),
    createBackup: (server: string, body: { name?: string; is_locked?: boolean; ignored?: string[] }) =>
      this.request<{ attributes: Backup }>("POST", `/api/client/servers/${server}/backups`, { body }),
    backupUrl: (server: string, backup: string) =>
      this.request<{ attributes: { url: string } }>("GET", `/api/client/servers/${server}/backups/${backup}/download`),
    files: {
      list: (server: string, directory?: string) =>
        this.request<{ data: Array<{ attributes: FileEntry }> }>("GET", `/api/client/servers/${server}/files/list`, { query: { directory } }),
      read: (server: string, file: string) =>
        this.request<string>("GET", `/api/client/servers/${server}/files/contents`, { query: { file }, accept: "text/plain" }),
      downloadUrl: (server: string, file: string) =>
        this.request<{ attributes: { url: string } }>("GET", `/api/client/servers/${server}/files/download`, { query: { file } }),
      uploadUrl: (server: string) => this.request<{ attributes: { url: string } }>("GET", `/api/client/servers/${server}/files/upload`),
      write: (server: string, file: string, content: string) =>
        this.request<null>("POST", `/api/client/servers/${server}/files/write`, { query: { file }, textBody: content, accept: "text/plain" }),
      remove: (server: string, body: { root?: string; files: string[] }) =>
        this.request<null>("POST", `/api/client/servers/${server}/files/delete`, { body }),
      rename: (server: string, body: { root: string; files: Array<{ from: string; to: string }> }) =>
        this.request<null>("PUT", `/api/client/servers/${server}/files/rename`, { body }),
      copy: (server: string, location: string) => this.request<null>("POST", `/api/client/servers/${server}/files/copy`, { body: { location } }),
      createFolder: (server: string, body: { root?: string; name: string }) =>
        this.request<null>("POST", `/api/client/servers/${server}/files/create-folder`, { body }),
    },
    sftp: () => undefined,
  }

  sshKeys = {
    list: () => this.request<{ data: Array<{ attributes: SshKey }> }>("GET", "/api/client/account/ssh-keys"),
    create: (name: string, public_key: string) => this.request<{ attributes: SshKey }>("POST", "/api/client/account/ssh-keys", { body: { name, public_key } }),
    remove: (fingerprint: string) => this.request<null>("POST", "/api/client/account/ssh-keys/remove", { body: { fingerprint } }),
  }
}
