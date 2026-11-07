# Tokens and environment for DSH

English | [Русский](README.ru.md)

`@pnpwin/dsh-token-vault` adds **Settings → Tokens and environment**: a named `NAME → TOKEN` store backed by DSH's native credentials service. Values are injected explicitly into one command, one MCP call, or a configured MCP connection. Nothing is exported into the global process environment.

## Compatibility and installation

- DSH **0.2.2-rc.1**, the exact runtime used to verify the native services and public tool pipeline.
- Node.js **22 or newer**.
- No runtime dependencies, installation scripts, copied MCP SDK or external credential service.

Install the bundle through DSH Plugin Manager using:

```text
github:pnpwin/dsh-token-vault#v1.0.2
```

The bundle inserts the `pnpwin-token-vault` Host row and contributes its Client settings page. It does **not** configure, enable or rebind an MCP server. A local checkout can also be installed through Plugin Manager; do not edit profile files manually. Replacing an existing installation must preserve the user's credentials and configuration. Follow Plugin Manager's reported applied/restart state, then verify the existing GUI rather than assuming a reload occurred.

## Add, replace and delete

Enter a POSIX identifier, such as `GITHUB_TOKEN`, and a non-empty value in the settings page, **never in chat**. Names are case-sensitive, at most 128 characters; `DSH_*` and prototype-related names are reserved. Values are at most 32 KiB and may not contain NUL.

The inventory never downloads saved values to the browser. **Show draft** reveals only what is currently being entered. Replacement and deletion require explicit UI acknowledgement.

Values are written with `ctx.credentials.set(NAME, value)`, not stored in plugin configuration. Other DSH consumers resolving the same name, including model providers, see the replacement too. Non-secret inventory markers use reversible case-preserving ASCII-hex record IDs, `pnpwin-token-vault/n-…`, compatible with DSH's native record-key grammar.

Deleting a stored value may expose a launch-environment or `.env` fallback. The UI reports this; deletion is **not remote token revocation**. A failed save after marker creation can leave a visible unconfigured entry that can be retried or removed. Reference and marker updates are separate native operations; concurrent writers in different processes/interfaces have no cross-process CAS guarantee. Avoid editing the same name concurrently.

## Commands and skills

Ask DSH to run a command using named credentials:

```js
vault_run({
  names: ['GITHUB_TOKEN'],
  command: 'gh api user',
  description: 'Check GitHub authentication'
})
```

- Approval is required for every invocation. Rejection, cancellation or unavailable approval fails closed **before resolving credentials**.
- Only selected names are added to that command's environment. Ordinary `bash`, existing terminals and previously started programs receive nothing automatically.
- Session sandbox mode, workspace boundary, working directory and cancellation are preserved. There is no sandbox escalation option. Never retry a sandbox denial through another tool.
- Execution is foreground-only, with a 30-second default timeout and a 120-second maximum; expiry kills the command.
- `vault_list({})` returns only names and configured/writable states.
- Skills are instructions, not a separate runtime. A skill's script can run through `vault_run` and read `$NAME` or `os.environ['NAME']` normally.

## One MCP call: argument substitution

First discover and load the exact MCP tool through the client's normal mechanism. For a hypothetical tool accepting a `token` argument:

```js
vault_call({
  tool: 'mcp__example__request',
  arguments: { token: '', query: 'example' },
  bindings: [{ name: 'API_TOKEN', path: ['token'] }]
})
```

Nested destinations use paths such as `['headers', 'Authorization']` and an optional `prefix: 'Bearer '`. Intermediate objects must already exist. The model supplies names and paths; values are resolved on the Host.

The nested call uses the public `ToolExecutionPipeline.prepare → dispatch → complete` stages with the same Agent, admitted tool set, parent/root identity, schema validation, pre-execute policy and guards. Native and PTC callers are supported without starting a new root MCP batch. Hidden or restricted tools cannot be made available this way.

Expanded arguments are not written as root Session call/result events. The returned JSON batch masks exact echoed values, including canonical output. Additional contexts are not independently injected. This tool substitutes **arguments**, not the transport authentication of an existing MCP connection.

## Lazy Discovery: independent integration

[Lazy Discovery v1.2.4](https://github.com/pnpwin/dsh-lazy-discovery/tree/v1.2.4) consumes the same native DSH credentials without depending on this Vault package:

1. Save a value in **Settings → Tokens and environment**.
2. Open **Settings → MCP authorization**.
3. Select the destination server and bind a credential **name** to Bearer/custom HTTP headers or stdio environment variables.
4. Confirm the destination and save. Do not enter secret values in Lazy configuration.

A value change invalidates only affected Lazy connections and catalogs. Reconnection remains lazy. Do not run the eager adapter below alongside Lazy for the same server/tool namespace.

Vault is optional: Lazy also accepts manually entered names backed by the native provider and environment/dotenv fallbacks. Disabling Vault's UI does not delete credentials. To stop further MCP use regardless of fallbacks, disable the server or revoke the token remotely.

Optional names-only UI integration: authenticated `GET /api/token-vault/list` returns `{ entries: [{ name, configured, writable }] }`. Third-party UIs should retain manual name entry if the endpoint is unavailable. No endpoint returns a saved secret value.

## Optional eager MCP connection adapter

`@pnpwin/dsh-token-vault/mcp` wraps DSH's installed native MCP client. It does not download another SDK or change existing server rows. Configure it **instead of** the native client row for the same `serverName`:

```yaml
- id: github-with-vault
  name: '@pnpwin/dsh-token-vault/mcp'
  config:
    mcp:
      serverName: github
      transport: streamable-http
      url: https://api.githubcopilot.com/mcp/
    headerRefs:
      Authorization:
        name: GITHUB_TOKEN
        prefix: 'Bearer '
```

For stdio, provide the executable appropriate to your own MCP server:

```yaml
- id: local-api-with-vault
  name: '@pnpwin/dsh-token-vault/mcp'
  config:
    mcp:
      serverName: local-api
      transport: stdio
      command: your-mcp-server
      args: []
    envRefs:
      SERVICE_API_KEY: API_TOKEN
```

The left env key is the child variable; the right value is the Vault name. Header refs require Streamable HTTP; env refs require stdio. The native client validates `mcp`. The adapter awaits startup with `failOnStartupError: true`, resolves new values when rebuilding the connection, and disposes the previous generation on rotation/removal/failure. Runtime child configuration contains resolved values only in Host memory. Never put tokens directly in `mcp.env` or `mcp.headers`.

## Host plugins

Prefer the native service, resolving at each operation:

```js
export const inject = ['credentials'];
export async function apply(ctx) {
  // Inside the operation needing the credential:
  const hit = await ctx.credentials.resolve('GITHUB_TOKEN');
  if (!hit) throw new Error('GITHUB_TOKEN is not configured');
  // Pass hit.value to the intended SDK; never log it or put it in a prompt.
}
```

`@pnpwin/dsh-token-vault/api` also exports `resolveEnvironment(ctx, names)` for consumers specifically requiring Vault-enrolled names.

## Security boundaries

- The default native local provider uses an owner-only local file, **not encryption, OS Keychain or KMS**. Other providers have their own guarantees.
- This is not isolation from the agent, trusted Host plugins, other processes running as your OS user, or the receiving command/MCP server. Giving a program a token lets it use or transmit that token.
- Exact-output masking is best effort. Encoded, split, transformed or binary/image data are not protected.
- Do not print secrets, run `env`/`printenv`, enable `set -x`, use verbose HTTP header logs, or dump credentials. Raw subprocess output/spill, third-party event listeners, SDK diagnostics, MCP instructions/results, files and remote recipients may capture values before masking. Native eager MCP output does not pass through Vault's output redaction.
- There is no model-facing read-value or save-token tool. Authenticated owner HTTP clients retain the same CRUD rights as the UI; the UI is not a separate OS/user-presence authorization boundary.
- Cancellation cannot undo side effects already accepted by a remote service.

## Source layout and verification

All executable implementation and build helpers are in `src/`; existing `tests/` and `locale/` directories stay in place. Package exports, not obsolete root-file paths, are the supported entry points. The original icon and implementation are MIT-licensed; provenance is documented in [UPSTREAM.md](UPSTREAM.md).

```sh
npm run build
npm run check
npm test
npm pack --dry-run --ignore-scripts
```

`build`/`check` validate syntax, the root allowlist, manifest exports, packaged resource coverage and localized metadata without emitting generated files. Tests use synthetic values and mock providers only. They cover inventory secrecy, record-key grammar, replacement/deletion failures, approval denial, sandbox/cwd/signal propagation, scoped Native/PTC dispatch, exact masking, prototype defenses, request limits, MCP lifecycle and distribution contracts. Real UI, native sandbox and MCP transport verification require a separate check in the intended DSH runtime; unit tests do not establish live behavior.
