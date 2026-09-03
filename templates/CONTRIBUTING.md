# Contributing

Thanks for contributing to @@projectName@@.

## Before you start

Read this file end to end. It covers prerequisites, setup, layout, code
standards, testing and the pull request workflow. All of it applies to agents
exactly as it applies to people.

## Prerequisites

- **[mise](https://mise.jdx.dev/).** Provisions every other tool from
  `.mise.toml`. This is the only dependency you install yourself:

  ```bash
  brew install mise
  ```

  Then [activate it in your shell](https://mise.jdx.dev/getting-started.html)
  so tools land on `PATH` when you `cd` into the repository.

Everything below is provisioned by `mise install`:

- **[just](https://just.systems).** Task runner. `just test` runs every check
  CI runs.
- **[uv](https://docs.astral.sh/uv/).** Python package runner, used for
  markdown formatting.

### Claude Code

If you use [Claude Code](https://claude.ai/code), install the commit plugin
from the default marketplace:

```
/plugin install commit-commands@claude-plugins-official
```

It provides `/commit` and `/commit-push-pr`, which follow the conventions
below automatically.

## Setup

```bash
mise install
just fetch     # pull shared build recipes
just deps
just test
```

## Project structure

```text
@@projectStructure@@
```

## Code style

Formatting is not a matter of taste here — `just go-fmt` and `just md-fmt`
decide it, and CI checks the result. Run `just ready` before committing and
the question does not arise.

### Documentation

Every exported identifier carries a doc comment, starting with the identifier's
own name. A package has a package comment on exactly one file.

## Code standards

### Function signatures

Take interfaces, return structs. A function that accepts a concrete type it
does not need forces every caller to construct one.

### File naming

One responsibility per file, named for it. `snake_case.go`, matching the
package it lives in.

### Go patterns

- Accept a `context.Context` as the first parameter on anything that does I/O.
- Return errors, do not log them. The caller decides what is worth reporting.
- Zero values should be useful where they can be.

### Test doubles

Prefer a real implementation over a fake, a fake over a mock. A mock that
asserts call order tests the implementation rather than the behaviour, and
fails when the implementation changes for good reasons.

### File headers

Every source file carries the licence header. `just ready` adds it.

### Error wrapping at the module boundary

Wrap with `fmt.Errorf("...: %w", err)` when adding context a caller cannot
already infer. Do not wrap to restate the operation the call site already
names.

## Testing

```bash
just test           # everything CI runs — lint, unit, coverage
just go-unit        # unit tests only
just go-unit-cov    # coverage report
go test -run TestName -v ./...   # a single test
```

Coverage is gated at @@coverageTarget@@. `just test` fails when total coverage
drops below it, so a change that adds untested code fails locally and in CI:

```bash
just cov-check      # report coverage and fail below the target
```

The target is declared in `.github/codecov.yml` and again in the `justfile`.
Neither system can read the other's config, so change both together.

### Test file conventions

- **Public tests**: `*_public_test.go` in the package's `_test` package,
  exercising the exported surface. This is the default.
- **Internal tests**: `*_test.go` in the same package, for what the exported
  surface cannot reach.
- **Suite naming**: `*_public_test.go` → `{Name}PublicTestSuite`,
  `*_test.go` → `{Name}TestSuite`.

## Quick reference

```bash
just fetch      # pull shared build recipes
just deps       # resolve modules
just test       # everything CI runs
just cov-check  # coverage gate
just ready      # format, vet, lint before committing
```

## Before committing

```bash
just ready
```

That runs generation, markdown formatting, Go formatting and vet. CI runs the
same checks, so a clean `just ready` is a clean build.

## Branching

Develop on feature branches. Branch from `@@defaultBranch@@` using
`type/short-description`, where `type` matches the
[Conventional Commits](https://conventionalcommits.org) type:

- `feat/add-retry-policy`
- `fix/nil-deref-on-empty-config`
- `docs/update-readme`
- `refactor/simplify-registry`
- `chore/update-dependencies`

Claude Code's `/commit` creates a branch automatically when you are on
`@@defaultBranch@@`.

## Commit messages

Follow [Conventional Commits](https://conventionalcommits.org) with the 50/72
rule:

- **Subject**: max 50 characters, imperative mood, capitalised, no period
- **Body**: wrapped at 72 characters, separated from the subject by a blank line
- **Format**: `type(scope): description`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Summarise the what and the why, not the how

Most pull requests should carry a single commit. Squash and rebase are your
friends.

## Submitting a PR

- **Describe your changes.** Say what changed and why. A reviewer should not
  have to read the diff to learn the reason for it.
- **Link previous work.** Related issues or pull requests, and how this differs
  from or extends them.
- **Examples.** Anything that demonstrates the effect of the change.
- **Draft PRs.** If the change is incomplete but worth discussing, open it as a
  draft and start the discussion in a comment rather than the description, so
  the description stays free to be rewritten.

## AI usage

All contributions are subject to the [AI Usage Policy](AI_POLICY.md). Disclose
the tool you used, and make sure you can explain what your change does without
the aid of AI tools.
