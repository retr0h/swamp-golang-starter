# Contributing

Thanks for contributing to `@retr0h/golang-starter`.

This file is the single source for how work happens here. `AGENTS.md` and
`CLAUDE.md` point at it and carry only what is specific to agents; the README
describes what the extension does, not how to change it.

## Prerequisites

- **[mise](https://mise.jdx.dev/).** Provisions Deno from `.mise.toml`. The only
  dependency you install yourself:

  ```bash
  brew install mise
  ```

- **[swamp](https://swamp-club.com).** The CLI this extension is built for.
  Authenticate once with `swamp auth login`.

Swamp bundles its own Deno at `~/.swamp/deno/deno`. It is not on `PATH`, and it
is the one the bundler uses, so type-check and test with it rather than any
Deno `mise` provides.

## Setup

```bash
mise install
swamp extension source add "$PWD"    # register this extension locally
```

## Layout

```text
manifest.yaml                          name, version, and every file shipped
extensions/models/go_project.ts        the model — schemas, gates, methods
extensions/models/go_project_test.ts   unit tests
extensions/models/instances/           the model definition consumers get
extensions/workflows/                  create-go-lib, create-go-cli, retemplate-go
templates/                             the files a generated project receives
.claude/skills/golang-starter/         the skill shipped with the extension
.swamp-review/                         adversarial review reports
```

## Adding a template

1. Write the file in `templates/`. Use the extension of what it produces —
   `.tmpl` is not an allowed `additionalFiles` extension, and a template that
   ends `.yml` is linted as YAML.
2. Add it to `additionalFiles` in `manifest.yaml`. A template the plan names but
   the manifest does not ship fails at run time, on someone else's machine.
   There is a test for this.
3. Add it to `planFor()` in the model, with `managed` set. The README's
   "Re-rendering an existing project" section in [README.md](README.md) defines
   the two classes and lists which files fall in each. Classify the new template
   against that, and add a case to the plan tests.

## Adding a variable

Add the field to `GlobalArgsSchema`, add it to the map `varsFor()` returns, then
wire it through both workflows and the instance. Reference it in a template as
`@@name@@`.

The delimiter is `@@`, not `{{ }}`. Three tools in a generated project already
own that syntax and one collides outright:

| Tool | Syntax |
| --- | --- |
| just | `{{ coverage_target }}` — same shape, same spacing |
| goreleaser | `{{.Version}}` |
| GitHub Actions | `${{ secrets.TOKEN }}` |

`render()` matches `@@word@@` only, so all three reach the generated file
untouched. There are tests for that.

## Testing

```bash
~/.swamp/deno/deno test --allow-read --allow-env extensions/models/
~/.swamp/deno/deno check extensions/models/go_project.ts
```

Tests cover the pure functions — `render`, `planFor`, `badgesFor`, `varsFor`,
the schema, and the coupling between workflows and the configs they read.
`execute()` is not covered: it needs `extensionFile`, which
`createModelTestContext` does not supply. That gap is recorded as an issue in
the adversarial review rather than hidden.

Prefer a test that pins a property which has actually broken over one that
raises a number.

## The workflows must match the justfile

`.github/workflows/` in a generated project calls `fetch`, `deps`, `test`,
`md-fmt-check` and `just-fmt-check` by name. Both justfile variants implement
all five, so the same workflows work whether or not a project uses shared
recipes. Adding a call to a workflow template means adding the recipe to both
variants. There is a test for this too.

The same rule holds for configuration: a workflow that reads a file its gate
excluded fails on the first push. `labeler.yml` ships only with
`.github/labeler.yml`, and `go.yml`'s codecov step is conditional on
`.github/codecov.yml` existing.

## Adversarial review

`swamp extension push` requires a review report bound to a content hash of the
source, so any change needs a fresh one.

```bash
swamp extension push manifest.yaml --dry-run --json    # prints path + skeleton
SWAMP_EXTENSION_REVIEW_DIR="$PWD/.swamp-review" \
  swamp extension push manifest.yaml --dry-run
```

Reports live in `.swamp-review/` rather than the system temp directory a local
run defaults to. **The override needs an absolute path**; a relative one is
ignored silently.

Run the mandatory mechanical checks before the dimensional review — schema-write
conformance in particular. It has caught two defects here that neither the type
checker nor the unit tests saw.

Record an honest `issue` rather than arguing a dimension into `pass`. Issues
surface under a different ruleId than a missing review, so a CI gate still
passes while the note stays visible.

## Publishing

```bash
swamp extension version @retr0h/golang-starter     # next CalVer
swamp extension fmt manifest.yaml
swamp extension push manifest.yaml --dry-run
swamp extension push manifest.yaml
```

## Before committing

```bash
swamp extension fmt manifest.yaml
~/.swamp/deno/deno test --allow-read --allow-env extensions/models/
```

## Branching

Develop on feature branches. Branch from `main` using `type/short-description`,
where `type` matches the [Conventional Commits](https://conventionalcommits.org)
type: `feat/add-service-template`, `fix/labeler-gate`, `docs/update-readme`.

## Commit messages

Follow [Conventional Commits](https://conventionalcommits.org) with the 50/72
rule:

- **Subject**: max 50 characters, imperative mood, capitalised, no period
- **Body**: wrapped at 72 characters, separated from the subject by a blank line
- **Format**: `type(scope): description`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Summarise the what and the why, not the how

## Submitting a PR

- **Describe your changes.** A reviewer should not have to read the diff to
  learn why it exists.
- **Link previous work**, and say how this differs from it.
- **Draft PRs** for incomplete work you want to discuss; start the discussion in
  a comment so the description stays free to be rewritten.

## AI usage

All contributions are subject to the [AI Usage Policy](AI_POLICY.md). Disclose
the tool you used, and make sure you can explain what your change does without
the aid of AI tools.
