# Repository conventions

- All executable implementation belongs in `src/`: Host/runtime, Client UI, CLI, build scripts, helpers and compatibility entry points. Do not leave implementation or forwarding JavaScript/TypeScript at the package root.
- Keep existing resource and test directories in place, including `tests/` and `locale/`. The source-layout rule concerns root files, not renaming these directories.
- Root regular files are limited to documentation (`README`, `LICENSE`, `UPSTREAM`, contributor guidance), Git/package/lock metadata, and files DSH genuinely needs to discover, load or display the bundle (its patch and exported icon).
- Maintain English `README.md` and Russian `README.ru.md`. Keep the security boundaries and native-credentials/Lazy/eager-client distinction explicit in both.
- Before a release, validate the root allowlist, exports, actual packed resources, build/check and tests. Keep runtime behavior changes separate from source-layout migrations.
- Publish only intended public source. Never include credentials, private catalogs, raw session logs, machine-specific absolute paths, `node_modules/` or generated package archives.
- Use Plugin Manager for live installation/migration. Do not hand-edit profile files; preserve user configuration and named credential bindings when replacing an existing installation.
- Use synthetic values and in-memory providers in tests. Never resolve real credentials or grant a real server binding as part of automated verification.
