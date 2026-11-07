# Provenance and runtime integration

## Original implementation

Token Vault is an original MIT-licensed plugin implementation maintained for the `pnpwin` DSH plugin collection. This repository is **not a fork of a third-party vault implementation**. The bundled lock/key SVG artwork is original and covered by the same license. See [LICENSE](LICENSE) for the existing copyright notice and terms.

The source layout was consolidated into `src/` for the v1.0.2 GitHub release. The package's public Host, Client, MCP-adapter and API exports retain their intended behavior; obsolete root-level implementation/shim paths are not public entry points.

## Native dependencies supplied by DSH

The implementation integrates with DSH **0.2.2-rc.1** and its public native services: credentials, approval, shell, sandbox policy, working directory, tools, connection, loader and system-prompt sections. It does not vendor those implementations or install a separate credential backend.

- `src/dispatch.js` loads the public `@deepseek-ai/dsh-tools/pipeline` entry through DSH's package resolver to preserve Native/PTC nested execution policy.
- `src/mcp.js` loads DSH's installed `@deepseek-ai/dsh-mcp-client` only when the optional eager adapter is explicitly configured. No MCP SDK source is copied into this repository.
- The Client integrates through the native settings slots, theme tokens and locale service.
- [Lazy Discovery](https://github.com/pnpwin/dsh-lazy-discovery) is a separate optional consumer of the same native credential references. Its source is not bundled here and neither plugin requires the other.

Native DSH packages retain their own licenses and provenance. This package contains no extracted Harness source, credential snapshots, private catalogs, session transcripts or machine-specific runtime configuration.

## Release verification

Use `npm run build`, `npm test` and an actual package dry-run to verify exports and resources before publication. Source tests use synthetic credentials and mock runtime providers; they are not a substitute for explicit native integration checks. Live profile migration is performed through Plugin Manager, preserving user settings and stored credentials.
