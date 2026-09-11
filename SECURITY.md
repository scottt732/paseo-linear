# Security

## Reporting a vulnerability

Report suspected vulnerabilities through [GitHub private vulnerability
reporting](https://github.com/scottt732/paseo-linear/security/advisories/new) rather than a public
issue. Expect an acknowledgement within a week.

## What this plugin can do on your machine

Paseo plugins are trusted, unsandboxed code. Everything under `server/` runs in a subprocess of
your Paseo daemon with your user's access to files, processes, environment, and the network, and
everything under `client/` runs inside the Paseo app. Installing this plugin — by path or with
`paseo plugin add` — means you trust this source. Read the diff before you update a pinned ref.

## Credentials

The plugin needs a Linear personal API key and takes it from one of two places:

- `LINEAR_API_KEY` in the daemon's environment, which wins when both are set, or
- Settings → Plugins → Linear, which stores it as ordinary JSON in the daemon's config directory.

The settings value is **not** held in a credential vault. Treat the daemon's config file as a file
containing a secret, and prefer the environment variable on any shared or headless host.

Keys never leave the daemon: the key is read in server handlers, sent only to Linear's API over
HTTPS, and never returned to the client, written to a plugin timeline row, or logged. Keep it that
way — `paseo plugin logs linear` shows plugin stdout and stderr to anyone who can reach the
daemon, so never `console.log` a key, an `Authorization` header, or a raw request.

No credential belongs in this repository. CI runs gitleaks over the full history on every push;
enable GitHub secret scanning and push protection on the repository as the second layer.
