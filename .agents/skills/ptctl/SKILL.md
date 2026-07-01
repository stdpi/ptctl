---
name: pterodactyl-cli
description: Pterodactyl client CLI (`pt` / `ptctl`) for installing, publishing, configuring, and using this package from the command line. Use this skill whenever the user mentions `pt`, `ptctl`, the Pterodactyl client API, `.env`-based configuration, Bun global installs, package publishing, or needs help with any command exposed by this CLI. Also use it when the user wants to debug, extend, or document the package because the command behavior is source-of-truth driven and easy to get subtly wrong.
metadata:
  version: 1.0.0
  category: cli
  tags: [pterodactyl, bun, node, cli, pt, ptctl, publish, env]
---

This skill is for the `ptctl` package in this repo: a TypeScript CLI that talks to the Pterodactyl client API and installs as the `pt` binary.

## Source of truth

When answering questions about behavior, always anchor on these files:

- `README.md` for the user-facing install and env docs
- `package.json` for packaging, binary name, scripts, and publish metadata
- `src/cli.ts` for command parsing and supported subcommands
- `src/env.ts` for `.env` loading and runtime configuration
- `src/client.ts` for API endpoints and request behavior
- `src/output.ts` and `src/presenter.ts` for human-readable output

Do not invent flags, subcommands, or API behavior that are not present in those files.

## What this package does

`ptctl` is a command-line client for managing Pterodactyl servers and account resources.

- It authenticates with a panel URL and client API key.
- It supports human output and `--json` output.
- It can list servers, inspect a single server, stream logs, control power state, run console commands, work with files, manage backups, manage SSH keys, and print SFTP connection details.
- It reads configuration from the current shell environment and also loads a local `.env` file from the current working directory.

## Configuration rules

The CLI expects these environment variables:

- `PTERODACTYL_URL` - required
- `PTERODACTYL_CLIENT_KEY` - required
- `PTERODACTYL_SFTP` - optional boolean (`1`, `true`, `yes`, `on`)
- `PTERODACTYL_SFTP_KEY` - optional path; `~` expands to the home directory
- `PTERODACTYL_TENANT` - optional

Behavioral rules:

- Load `.env` from `process.cwd()` if present.
- Do not overwrite values already present in `process.env`.
- Treat `.env` as optional; missing file is not an error.
- Prefer `.env` in the current project directory over hard-coded examples.

## Installation and publishing

This package is publishable as-is when the build output exists.

- `bin.pt` points to `./dist/cli.js`
- `files` includes `dist` and `README.md`
- `prepare` and `build` both run `tsc -p tsconfig.build.json`
- `private` is `false`
- the package name is `ptctl`

For Bun local/global installation:

- Use `bun install -g /absolute/path/to/repo` or `bun install -g "$(pwd)"`
- Avoid relying on `bun install -g .` because Bun 1.3.14 can mis-resolve the current directory in this repository
- After global install, the binary is `pt`
- If `pt` is not found, add Bun’s global bin directory to `PATH`

## Build and verification workflow

When asked to make this package installable, publishable, or ready for release:

1. Run `bun run build`
2. Run `bun pm pack --dry-run --quiet` to verify the package shape
3. If needed, install globally from the absolute repository path with Bun
4. Verify the binary with `pt --help` or `pt --version`

If you modify the CLI or config loader, re-check that the build still emits `dist/cli.js` and that the package still packs cleanly.

## Command reference

### Global help/version

- `pt --help`
- `pt -h`
- `pt --version`
- `pt -V`

### Core commands

- `pt auth check`
  - Verifies panel auth by fetching the account record.
- `pt ls [server[/path]]`
  - Without an argument, lists servers.
  - With `server` or `server/path`, lists files in the remote directory.
- `pt server list`
  - Explicit alias for server listing.
- `pt server <id|name>`
  - Shows one server.
- `pt server log <id|name>`
  - Streams console logs.
- `pt log <id|name>`
  - Alias for `pt server log`.
- `pt stats <id|name>`
  - Shows live resource stats.
- `pt power <id|name> <start|stop|restart|kill>`
  - Sends a power action.
- `pt command <id|name> <text>`
  - Runs a console command.
- `pt exec|send|run <id|name> <text>`
  - Aliases for `pt command`.
  - If no inline text is provided, read the command from stdin.

### File commands

- `pt file ls <server[/path]>`
  - Lists files in a directory.
- `pt file cat <server/path>`
  - Prints file contents.
- `pt file put <local> <server/path>`
  - Uploads a local file.
  - The local path must look like a local path (`./`, `../`, `/`, or `~`).
  - With `--link`, print a signed upload URL instead of uploading.
- `pt file get <server/path> [local]`
  - Downloads a remote file.
  - If `local` is provided, write the file there.
  - With `--link`, print a signed download URL instead of downloading.
- `pt file rm <server/path>`
  - Deletes a file or directory.

### Backup commands

- `pt backup ls <id|name>`
  - Lists backups.
- `pt backup create <id|name> [name]`
  - Creates a backup.
- `pt backup url <id|name> <backup>`
  - Fetches a temporary download URL.

### SSH / SFTP commands

- `pt ssh keys`
  - Lists SSH keys.
- `pt ssh add <name> <public-key-path>`
  - Reads the key file and uploads it.
- `pt ssh rm <fingerprint>`
  - Deletes an SSH key.
- `pt sftp init <id|name>`
  - Prints host, port, username, SFTP URL, and configured key path.

## Flag behavior

- `--json`
  - Output the raw `Result` object as JSON.
- `--verbose` / `-v`
  - Include request/response details and stack traces where available.
- `--follow` / `-f`
  - Keep log streaming open instead of auto-closing after the first log burst.
- `--link` / `-L`
  - Print signed transfer URLs for file upload/download instead of transferring content.
- `--compact`
  - Exists in the parser but is currently the default presentation mode.

## Output model

The CLI returns a structured `Result` object internally.

- Success results have `ok: true`, a `kind`, and `data`.
- Error results have `ok: false`, `kind: "error"`, and `message`.
- API failures may include `status`, `body`, `request`, and `stack` when verbose mode is active.

Human output rules:

- Strings print directly.
- Lists of servers and files use compact tabular text.
- Objects print as sorted key/value trees.
- `--json` bypasses human rendering entirely.

## Common troubleshooting guidance

When a user reports a failure, check these first:

- Missing `.env` or missing `PTERODACTYL_URL` / `PTERODACTYL_CLIENT_KEY`
- Incorrect `PTERODACTYL_URL` base URL
- Wrong server reference format (`id`, exact name, or unique prefix)
- Local file path not treated as local for `file put`
- `pt` not on `PATH` after global install
- Using `bun install -g .` instead of an absolute path on Bun 1.3.14

## How to help the user

When the user asks for help with this package, prefer this order:

1. Confirm whether they are installing, running, publishing, or extending the CLI.
2. Check whether the issue is configuration, command syntax, or packaging.
3. Use the command reference above to answer with exact syntax.
4. If the user wants a code change, inspect `src/cli.ts`, `src/env.ts`, and `package.json` together because the CLI behavior spans all three.

## Examples

### Install and run

```bash
bun run build
bun install -g "$(pwd)"
pt --help
```

### Local configuration

```env
PTERODACTYL_URL=https://panel.example.com
PTERODACTYL_CLIENT_KEY=ptlc_your_api_key_here
PTERODACTYL_SFTP=false
PTERODACTYL_SFTP_KEY=~/.ssh/id_ed25519
PTERODACTYL_TENANT=
```

### Stream logs

```bash
pt server log my-server
pt log my-server --follow
```

### File upload with signed URL only

```bash
pt file put ./backup.tar.gz my-server/backups/backup.tar.gz --link
```

## Guardrails

- Keep answers grounded in the actual command parser.
- Do not invent flags, aliases, or API endpoints.
- Preserve the package’s current binary name (`pt`) and package name (`ptctl`).
- If a request is about changing behavior, explain the user-visible impact as well as the code change.
