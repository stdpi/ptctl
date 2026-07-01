#!/usr/bin/env node
import { loadEnv } from "./env.js"
import { ApiError, CliError } from "./errors.js"
import { PterodactylClient } from "./client.js"
import { fail, ok } from "./result.js"
import { renderResult } from "./output.js"
import type { EnvConfig, Result } from "./types.js"
import { readFile, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { text as readStreamText } from "node:stream/consumers"
import { stdin, argv } from "node:process"
import WebSocket from "ws"

const require = createRequire(import.meta.url)
const { version } = require("../package.json") as { version: string }

type Flags = { json: boolean; verbose: boolean; compact: boolean; follow: boolean; link: boolean }

const usage = [
  "pt - Pterodactyl client CLI",
  "",
  "Usage:",
  "  pt <command> [args]",
  "",
  "Core:",
  "  auth check                  verify panel auth",
  "  ls [server[/path]]          list servers or remote files",
  "  server list                 list your servers",
  "  server <id|name>            show one server",
  "  server log <id|name>        stream console logs",
  "  stats <id|name>             show live resource stats",
  "  power <id|name> <action>    send start|stop|restart|kill",
  "  command <id|name> <text>    run a server console command",
  "",
  "Aliases:",
  "  pt ls                       canonical list command",
  "  pt server list              explicit server-list alias",
  "  pt log                      same as pt server log",
  "  pt exec|send|run            aliases for pt command with stdin support",
  "",
  "Files:",
  "  file ls <server[/path]>     list files in a directory",
  "  file cat <server/path>      print file contents",
  "  file put <local> <server/path>",
  "                              upload a local file",
  "  file get <server/path> [local]",
  "                              download a remote file",
  "                              add --link to print a signed transfer URL",
  "  file rm <server/path>       delete a file or directory",
  "",
  "Backups:",
  "  backup ls <id|name>         list backups",
  "  backup create <id|name> [name]",
  "                              create a backup",
  "  backup url <id|name> <backup>",
  "                              fetch a temporary download URL",
  "",
  "SSH / SFTP:",
  "  ssh keys                    list SSH keys",
  "  ssh add <name> <public-key-path>",
  "                              upload a new SSH key",
  "  ssh rm <fingerprint>        delete an SSH key",
  "  sftp init <id|name>         print SFTP connection details",
  "",
  "Flags:",
  "  -V, --version               show version",
  "  -v, --verbose               include request/response details",
  "  -f, --follow                stream logs",
  "  -L, --link                  print signed file transfer link",
  "  --json                      machine-readable output",
].join("\n")

const serverRef = [
  "pt server",
  "",
  "Primary commands:",
  "  pt server list              list your servers",
  "  pt server <id|name>         show one server",
  "  pt server log <id|name>     stream console logs",
  "",
  "Aliases:",
  "  pt ls                       same as pt server list",
  "  pt log                      same as pt server log",
  "",
  "Notes:",
  "  - `pt ls` is the canonical list command",
  "  - `pt ls <server[/path]>` and `pt file ls <server[/path]>` list remote files",
  "  - `pt exec|send|run` are command aliases that also accept stdin",
].join("\n")

const parseFlags = (argv: string[]): { flags: Flags; args: string[] } => {
  const flags: Flags = { json: false, verbose: false, compact: true, follow: false, link: false }
  const args: string[] = []
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!
    if (arg === "--json") flags.json = true
    else if (arg === "--verbose") flags.verbose = true
    else if (arg === "-v") flags.verbose = true
    else if (arg === "--follow" || arg === "-f") flags.follow = true
    else if (arg === "--link" || arg === "-L") flags.link = true
    else if (arg === "--version" || arg === "-V") args.push("--version")
    else if (arg === "--compact") flags.compact = true
    else if (arg === "--help" || arg === "-h") args.push("--help")
    else if (arg === "--") {
      args.push(...argv.slice(i + 1))
      break
    }
    else args.push(arg)
  }
  return { flags, args }
}

const readTextFile = async (path: string): Promise<string> => readFile(path, "utf8")

const readStdinText = async (): Promise<string> => readStreamText(stdin)

const readCommandText = async (argv: string[]): Promise<string> => {
  const text = argv.filter((token) => token !== "--").join(" ").trim()
  if (text) return text
  if (!stdin.isTTY) return (await readStdinText()).trimEnd()
  throw new CliError("Missing command text. Pass a command after `--` or pipe stdin.")
}

const serverIdFrom = (value: string): string => value.trim()

type RemoteTarget = { server: string; path?: string }

const isLocalPath = (value: string): boolean => /^(?:\.\.?[\\/]|[A-Za-z]:[\\/]|\/|~[\\/])/.test(value)

const parseRemoteTarget = (input: string): RemoteTarget | null => {
  const trimmed = input.trim()
  if (!trimmed || isLocalPath(trimmed)) return null
  const cleaned = trimmed.replace(/^\/+/, "")
  const slash = cleaned.indexOf("/")
  if (slash === -1) return { server: cleaned }
  const server = cleaned.slice(0, slash)
  const path = cleaned.slice(slash + 1)
  return { server, path: path || undefined }
}

const normalizeRemotePath = (value: string): string => value.replace(/^\/+/, "")

type ResolvedServer = { identifier: string; name: string }

type LogFrame = { event?: string; args?: unknown[] }

const logEventNames = new Set([
  "console output",
  "install output",
  "transfer logs",
  "daemon message",
  "daemon error",
])

const resolveServer = async (client: PterodactylClient, input: string): Promise<ResolvedServer> => {
  const ref = serverIdFrom(input)
  if (!ref) throw new CliError("Missing server id or name")

  const list = await client.servers.list()
  const target = ref.toLowerCase()
  const matches = list.data.map((item) => item.attributes).filter((server) => {
    const candidates = [server.identifier, (server as { server_identifier?: string }).server_identifier, (server as { uuid?: string }).uuid, server.name]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase())
    return candidates.includes(target)
  })

  if (matches.length === 1) return { identifier: matches[0].identifier, name: matches[0].name }

  const prefixMatches = list.data.map((item) => item.attributes).filter((server) => {
    const candidates = [server.identifier, (server as { server_identifier?: string }).server_identifier, (server as { uuid?: string }).uuid, server.name]
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.toLowerCase())
    return candidates.some((value) => value.startsWith(target))
  })

  if (prefixMatches.length === 1) return { identifier: prefixMatches[0].identifier, name: prefixMatches[0].name }
  if (prefixMatches.length > 1) {
    throw new CliError(`Ambiguous server ref: ${input}`)
  }

  throw new CliError(`Server not found: ${input}`)
}

const streamServerLogs = async (
  client: PterodactylClient,
  serverRef: string,
  flags: Flags,
  origin: string,
): Promise<void> => {
  const resolved = await resolveServer(client, serverRef)
  const { data } = await client.servers.websocket(resolved.identifier)
  const ws = new WebSocket(data.socket, { origin, headers: { Origin: origin } })
  const close = (): void => {
    try {
      ws.terminate()
    } catch {}
  }

  const onSigint = (): void => close()
  process.once("SIGINT", onSigint)

  try {
    await new Promise<void>((resolve, reject) => {
      let cutoffTimer: ReturnType<typeof setTimeout> | null = null
      const armCutoffTimer = (): void => {
        if (flags.follow || cutoffTimer) return
        cutoffTimer = setTimeout(() => close(), 1000)
      }

      ws.on("open", () => {
        ws.send(JSON.stringify({ event: "auth", args: [data.token] }))
      })
      ws.on("error", (error) => reject(error))
      ws.on("close", () => {
        if (cutoffTimer) clearTimeout(cutoffTimer)
        resolve()
      })
      ws.on("message", (chunk) => {
        const text = Buffer.isBuffer(chunk) ? chunk.toString() : String(chunk)
        if (flags.json) {
          console.log(text)
          return
        }
        try {
          const frame = JSON.parse(text) as LogFrame
          if (frame.event === "auth success") {
            ws.send(JSON.stringify({ event: "send logs", args: [] }))
            armCutoffTimer()
            return
          }
          if (!frame.event || !logEventNames.has(frame.event)) return

          const line = frame.args?.[0]
          if (typeof line !== "string") return

          if (frame.event === "daemon message") {
            console.log(`[daemon] ${line.replace(/\r?\n$/, "")}`)
            return
          }

          if (frame.event === "daemon error") {
            console.log(`[daemon error] ${line.replace(/\r?\n$/, "")}`)
            return
          }

          console.log(line.replace(/\r?\n$/, ""))
        } catch {
          console.log(text)
        }
      })
    })
  } finally {
    process.off("SIGINT", onSigint)
  }
}

const main = async (): Promise<number> => {
  const { flags, args } = parseFlags(argv.slice(2))
  if (args.includes("--version")) {
    console.log(`pt ${version}`)
    return 0
  }
  if (args.length === 0 || args[0] === "--help") {
    console.log(usage)
    return 0
  }
  if (args[0] === "server" && args.length === 1) {
    console.log(serverRef)
    return 0
  }

  let env: EnvConfig
  try {
    env = await loadEnv()
  } catch (error) {
    const result = fail(error instanceof Error ? error.message : "Invalid env")
    console.log(renderResult(result, flags))
    return 1
  }

  const client = new PterodactylClient({ url: env.url, clientKey: env.clientKey })
  let streamed = false

  const run = async (): Promise<Result<unknown>> => {
    const [group, sub, ...rest] = args

    try {
      if (group === "auth" && sub === "check") {
        const account = await client.account()
        return ok("auth.check", account.attributes, { count: 1 })
      }

      if (group === "servers" || (group === "server" && sub === "list")) {
        const servers = await client.servers.list()
        return ok("servers.list", servers.data.map((item) => item.attributes), { count: servers.data.length })
      }

      if (group === "server") {
        if (sub === "log") {
          const target = rest[0]
          if (!target) throw new CliError("Missing server id or name")
          streamed = true
          await streamServerLogs(client, target, flags, env.url)
          return ok("server.log", { server: target, follow: flags.follow })
        }
        const server = serverIdFrom(sub ?? rest[0] ?? "")
        if (!server) {
          return ok("server.ref", serverRef)
        }
        const resolved = await resolveServer(client, server)
        const data = await client.servers.get(resolved.identifier)
        return ok("server.get", data.attributes)
      }

      if (group === "log") {
        const target = sub ?? rest[0]
        if (!target) throw new CliError("Missing server id or name")
        streamed = true
        await streamServerLogs(client, target, flags, env.url)
        return ok("server.log", { server: target, follow: flags.follow })
      }

      if (group === "stats") {
        const server = serverIdFrom(sub ?? rest[0] ?? "")
        const resolved = await resolveServer(client, server)
        const data = await client.servers.resources(resolved.identifier)
        return ok("server.stats", data.attributes)
      }

      if (group === "power") {
        const server = serverIdFrom(sub ?? rest[0] ?? "")
        const signal = (rest[0] ?? rest[1]) as "start" | "stop" | "restart" | "kill"
        const resolved = await resolveServer(client, server)
        await client.servers.power(resolved.identifier, signal)
        return ok("server.power", { server: resolved.identifier, name: resolved.name, signal })
      }

      if (group === "command" || group === "exec" || group === "send" || group === "run") {
        const server = serverIdFrom(sub ?? rest[0] ?? "")
        const payload = sub ? rest : rest
        const command = await readCommandText(payload)
        if (!command) throw new CliError("Missing command text")
        const resolved = await resolveServer(client, server)
        await client.servers.command(resolved.identifier, command)
        return ok("server.command", { server: resolved.identifier, name: resolved.name, command, mode: payload.some((token) => token !== "--") ? "argv" : "stdin" })
      }

      if (group === "ls") {
        const target = [sub, ...rest].filter((value): value is string => Boolean(value)).join(" ").trim()
        if (!target) {
          const servers = await client.servers.list()
          return ok("servers.list", servers.data.map((item) => item.attributes), { count: servers.data.length })
        }
        const remote = parseRemoteTarget(target)
        if (!remote) throw new CliError("`ls` expects a remote target like `smp-a` or `smp-a/logs`")
        const resolved = await resolveServer(client, remote.server)
        const res = await client.servers.files.list(resolved.identifier, remote.path ? normalizeRemotePath(remote.path) : undefined)
        return ok("files.list", res.data.map((item) => item.attributes), { count: res.data.length })
      }

      if (group === "file") {
        const action = sub
        const primary = rest[0]
        const secondary = rest[1]

        if (action === "ls") {
          const target = primary ?? secondary
          if (!target) {
            const servers = await client.servers.list()
            return ok("servers.list", servers.data.map((item) => item.attributes), { count: servers.data.length })
          }
          const remote = parseRemoteTarget(target)
          if (!remote) throw new CliError("`file ls` expects a remote target like `smp-a` or `smp-a/logs`")
          const resolved = await resolveServer(client, remote.server)
          const res = await client.servers.files.list(resolved.identifier, remote.path ? normalizeRemotePath(remote.path) : undefined)
          return ok("files.list", res.data.map((item) => item.attributes), { count: res.data.length })
        }

        if (action === "cat") {
          const target = primary
          if (!target) throw new CliError("Missing file path")
          const remote = parseRemoteTarget(target)
          if (!remote) throw new CliError("`file cat` expects a remote target like `smp-a/path/to/file`")
          const resolved = await resolveServer(client, remote.server)
          if (!remote.path) throw new CliError("Missing file path")
          const content = await client.servers.files.read(resolved.identifier, normalizeRemotePath(remote.path))
          return ok("files.cat", { server: resolved.identifier, name: resolved.name, path: remote.path, content })
        }

        if (action === "put") {
          const local = primary
          const remoteArg = secondary
          if (!local || !remoteArg) throw new CliError("Missing local or remote path")
          if (!isLocalPath(local)) throw new CliError("Local source must start with `./`, `../`, `/`, or `~`")
          const remote = parseRemoteTarget(remoteArg)
          if (!remote) throw new CliError("Remote destination must look like `smp-a/path`")
          const resolved = await resolveServer(client, remote.server)
          if (flags.link) {
            const signed = await client.servers.files.uploadUrl(resolved.identifier)
            return ok("files.put.link", { server: resolved.identifier, name: resolved.name, local, remote: `${resolved.identifier}/${remote.path ? remote.path.replace(/^\/+/, "") : ""}`.replace(/\/$/, ""), url: signed.attributes.url })
          }
          const content = await readTextFile(local)
          if (!remote.path) throw new CliError("Missing remote file path")
          const remotePath = normalizeRemotePath(remote.path)
          const destination = `${resolved.identifier}/${remote.path.replace(/^\/+/, "")}`
          await client.servers.files.write(resolved.identifier, remotePath, content)
          return ok("files.put", { server: resolved.identifier, name: resolved.name, local, remote: destination })
        }

        if (action === "get") {
          const remoteArg = primary
          const local = secondary
          if (!remoteArg) throw new CliError("Missing remote path")
          const remote = parseRemoteTarget(remoteArg)
          if (!remote) throw new CliError("Remote source must look like `smp-a/path`")
          if (!remote.path) throw new CliError("Missing file path")
          const resolved = await resolveServer(client, remote.server)
          if (flags.link) {
            const signed = await client.servers.files.downloadUrl(resolved.identifier, normalizeRemotePath(remote.path))
            return ok("files.get.link", { server: resolved.identifier, name: resolved.name, source: `${resolved.identifier}/${remote.path.replace(/^\/+/, "")}`, ...(local ? { local } : {}), url: signed.attributes.url })
          }
          const content = await client.servers.files.read(resolved.identifier, normalizeRemotePath(remote.path))
          if (local) await writeFile(local, content, "utf8")
          const source = `${resolved.identifier}/${remote.path.replace(/^\/+/, "")}`
          return ok("files.get", { source, ...(local ? { local } : {}), content })
        }

        if (action === "rm") {
          const target = primary
          if (!target) throw new CliError("Missing path")
          const remote = parseRemoteTarget(target)
          if (!remote) throw new CliError("`file rm` expects a remote target like `smp-a/path/to/file`")
          const resolved = await resolveServer(client, remote.server)
          if (!remote.path) throw new CliError("Missing file path")
          const remotePath = normalizeRemotePath(remote.path)
          await client.servers.files.remove(resolved.identifier, { files: [remotePath] })
          return ok("files.rm", { server: resolved.identifier, name: resolved.name, path: remote.path ?? "" })
        }
      }

      if (group === "backup") {
        const action = sub
        const server = serverIdFrom(rest[0] ?? "")
        if (!server) throw new CliError("Missing server id or name")
        const resolved = await resolveServer(client, server)
        if (action === "ls") {
          const res = await client.servers.backups(resolved.identifier)
          return ok("backup.list", res.data.map((item) => item.attributes), { count: res.data.length })
        }
        if (action === "create") {
          const name = rest[1]
          const res = await client.servers.createBackup(resolved.identifier, name ? { name } : {})
          return ok("backup.create", res.attributes)
        }
        if (action === "url") {
          const backup = rest[1]
          if (!backup) throw new CliError("Missing backup id")
          const res = await client.servers.backupUrl(resolved.identifier, backup)
          return ok("backup.url", res.attributes)
        }
      }

      if (group === "ssh") {
        const action = sub
        if (action === "keys") {
          const res = await client.sshKeys.list()
          return ok("ssh.keys", res.data.map((item) => item.attributes), { count: res.data.length })
        }
        if (action === "add") {
          const name = rest[0]
          const file = rest[1]
          if (!name || !file) throw new CliError("Missing name or public key path")
          const publicKey = await readTextFile(file)
          const res = await client.sshKeys.create(name, publicKey.trim())
          return ok("ssh.add", res.attributes)
        }
        if (action === "rm") {
          const fingerprint = rest[0]
          if (!fingerprint) throw new CliError("Missing fingerprint")
          await client.sshKeys.remove(fingerprint)
          return ok("ssh.rm", { fingerprint })
        }
      }

      if (group === "sftp" && sub === "init") {
        const server = serverIdFrom(rest[0] ?? "")
        if (!server) throw new CliError("Missing server id")
        const resolved = await resolveServer(client, server)
        const account = await client.account()
        const serverData = await client.servers.get(resolved.identifier)
        const host = serverData.attributes.sftp_details?.ip ?? ""
        const port = serverData.attributes.sftp_details?.port ?? 22
        const username = `${account.attributes.username}.${serverData.attributes.identifier ?? server}`
        return ok("sftp.init", { host, port, username, url: `sftp://${username}@${host}:${port}`, key: env.sftpKey ?? null })
      }

      throw new CliError(`Unknown command: ${group}${sub ? ` ${sub}` : ""}`)
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          ok: false,
          kind: "error",
          message: error.message,
          status: error.status,
          body: error.body,
          request: error.request,
          ...(flags.verbose ? { stack: error.stack } : {}),
        }
      }
      if (error instanceof CliError) return fail(error.message)
      if (error instanceof Error) return fail(error.message, { stack: flags.verbose ? error.stack : undefined })
      return fail("Unknown error")
    }
  }

  const result = await run()
  if (streamed) return result.ok ? 0 : 2
  console.log(renderResult(result, flags))
  return result.ok ? 0 : 2
}

main().then((code) => {
  process.exitCode = code
})
