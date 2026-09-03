---
name: golang-starter
description: Scaffold a Go project — library or command — with module, justfile, CI workflows, linters and release config. Use when creating a new Go repository from scratch. Triggers on "new go project", "scaffold go", "create go library", "create go cli", "golang starter", "bootstrap a go repo".
---

# Golang Starter

Scaffolds a Go project in one workflow run. Two shapes come from one model:

| Workflow | Produces |
|---|---|
| `@retr0h/create-go-lib` | An importable library — `pkg/`, no `main` |
| `@retr0h/create-go-cli` | A command — `cmd/`, cobra, goreleaser |

## Running it

```bash
swamp workflow run @retr0h/create-go-lib --input project_name=widget
```

Inputs, all optional but `project_name`:

| Input | Default | |
|---|---|---|
| `project_name` | — | lowercase, alphanumeric, hyphens |
| `owner` | `retr0h` | the module path is `github.com/<owner>/<project_name>` |
| `description` | `""` | one-line repository description |
| `parent_dir` | `~/git` | where the project directory is created |
| `go_version` | `1.25` | written to `go.mod` |

## What it does not do

It does not create the GitHub repository or push. Scaffolding a directory is
reversible; creating a remote repository is not, so that stays a deliberate
separate step.

## Shared build logic is fetched, not copied

The generated `justfile` fetches its recipes from a justfiles repository at run
time rather than carrying a copy. A change there reaches every scaffolded
project without one edit per project — which is the failure this extension
exists to avoid, not repeat.
