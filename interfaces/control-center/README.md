# Pritha Control Center

Status: experimental.

This is the new local web UI for Pritha. It is intentionally isolated from the
legacy web UI and from the current voice experiment while the control
center design is being rebuilt.

## Routes

- `/agents` - child agents overview.
- `/voice` - voice control surface.
- `/settings` - compact settings.
- `/dev` - read-only diagnostics.

Desktop `/` resolves to `/agents`; mobile `/` resolves to `/voice`.

## Run

From a fresh Pritha clone, use bootstrap:

```sh
node scripts/bootstrap.mjs --profile local --start control-center
```

For direct local UI development:

```sh
npm --prefix interfaces/control-center ci --ignore-scripts
npm --prefix interfaces/control-center run dev
```

For the Pritha Tailscale link or any non-local browser access, use the
production server on the same port:

```sh
npm --prefix interfaces/control-center run serve
```

Default local URL:

```text
http://127.0.0.1:3420/agents
```

The app defaults to `3420` to avoid colliding with the existing legacy web UI
on `3000`.

Localhost URLs and localhost QR codes work only on the Mac that runs Control
Center. A phone sees `127.0.0.1` as the phone itself. For phone access, prefer
Tailscale Serve; for temporary trusted-LAN testing start with
`PRITHA_CONTROL_CENTER_HOST=0.0.0.0` and set
`PRITHA_CONTROL_CENTER_ALLOWED_DEV_ORIGINS` to the Mac LAN IP.

Do not expose `next dev` through Tailscale. The dev client can render the page
while failing to hydrate React event handlers behind HTTPS proxying; production
`build` + `start` keeps filters, credentials drawers, Voice controls and the
Three.js web active.

Optional local env:

```sh
PRITHA_CONTROL_CENTER_HOST=127.0.0.1
PRITHA_CONTROL_CENTER_PORT=3420
```

Do not commit real Tailscale URLs, tailnet names, device names, API keys,
private transcripts or Codex task outputs.

Tailscale access is optional. Bootstrap may detect readiness, but it does not
install Tailscale, authenticate the device or configure Tailscale Serve.

Use the guided operator flow:

```sh
node scripts/tailscale-setup.mjs plan --app control-center --port 3420
node scripts/tailscale-setup.mjs status --json
node scripts/tailscale-setup.mjs serve --app control-center --port 3420 --yes
node scripts/tailscale-setup.mjs off --app control-center --port 3420 --yes
```
