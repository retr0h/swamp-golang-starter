# swamp-golang-starter

🐊 Scaffold a Go project for [swamp][] — module, justfile, CI workflows,
linters and release config in one workflow.

## Install

```bash
swamp extension pull @retr0h/golang-starter
```

## Use

```bash
swamp workflow run @retr0h/create-go-lib --input project_name=widget
swamp workflow run @retr0h/create-go-cli --input project_name=widgetctl
```

Both run one model, `@retr0h/go-project`. The library and command shapes differ
only in layout and release config, so they share a model rather than each
having their own.

## Why fetch rather than copy

The generated `justfile` fetches shared recipes at run time instead of carrying
a copy of them. Copied build logic drifts: across seven repositories built the
copy-paste way, six of ten workflow names had two or three variants in
circulation, and one shipped the template's placeholder text untouched. A
scaffolder that copies would manufacture that problem rather than solve it.

## Development

```bash
mise install                              # deno
swamp extension fmt manifest.yaml         # format and lint
swamp extension push manifest.yaml --dry-run   # validate without publishing
```

[swamp]: https://swamp-club.com
