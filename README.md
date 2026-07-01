# pt

Node-compatible CLI for the Pterodactyl client API.

## Env

Place a `.env` file in the current working directory or export the variables in your shell.

```env
PTERODACTYL_URL=https://panel.example.com
PTERODACTYL_CLIENT_KEY=ptlc_your_api_key_here
PTERODACTYL_SFTP=false
PTERODACTYL_SFTP_KEY=~/.ssh/id_ed25519
PTERODACTYL_TENANT=
```

## Install

```bash
bun install
bun run build
bun install -g "$(pwd)"
pt --help
```

## Run locally

```bash
bun run pt -- --help
```
