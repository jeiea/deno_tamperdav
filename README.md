# deno_tamperdav

Deno port of [tamperdav](https://github.com/Tampermonkey/tamperdav).

## Usage

```
deno run -A https://raw.githubusercontent.com/jeiea/deno_tamperdav/main/mod.ts --path=dav --meta-touch
```

## Startup reconciliation

Before listening, the server reconciles `<path>/Tampermonkey/sync` once. Scripts without metadata
receive a `.meta.json` using their filename UUID, `@name`, empty `options`, and file modification
time as `lastModified`. Existing metadata is preserved unless `options.removed` is truthy (including
a deletion timestamp), in which case both the metadata and its matching script are deleted. An
absent sync directory is left alone. Invalid metadata or a script without `@name` stops startup with
a file diagnostic.

To disable this behavior, pass `--no-startup-reconcile` or set `TD_NO_STARTUP_RECONCILE=true`.

## Notes

It is unstable, issues are welcome.
