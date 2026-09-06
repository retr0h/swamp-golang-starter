# Contributing

Thanks for contributing to @@projectName@@.

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md). It applies to every
  interaction in this repo.
- **Check existing work.** Is there an existing PR? Are there issues discussing
  the feature/change you want to make? Please make sure you consider/address
  these discussions in your work.
- **Backwards compatibility.** Will your change break existing consumers of
  @@projectName@@? It is much more likely that your change will be merged if it
  is backwards compatible. Is there an approach you can take that maintains this
  compatibility? If not, consider opening an issue first so that API changes can
  be discussed before you invest your time into a PR.

## Prerequisites

Install tools using [mise]:

```bash
mise install
```

- **[Go].** @@projectName@@ is written in Go. We always support the latest two
  major Go versions, so make sure your version is recent enough.
- **[uv].** Python package runner. `just md-fmt` formats markdown with
  [mdformat] through `uvx`; nothing is installed into the repository.
- **[just].** Task runner used for building, testing, formatting, and other
  development workflows. Install with `brew install just`.

### Claude Code

If you use [Claude Code] for development, install this plugin from the default
marketplace:

```
/plugin install commit-commands@claude-plugins-official
```

- **commit-commands.** provides `/commit` and `/commit-push-pr` slash commands
  that follow the project's commit conventions automatically.

## Setup

Fetch shared justfiles and install all dependencies:

```bash
just fetch
just deps
```

## Project structure

```text
@@projectStructure@@
```

## Code style

Go code is formatted by [gofumpt] and linted using [golangci-lint], enforced by
CI.

```bash
just go-fmt-check   # Check formatting
just go-fmt         # Auto-fix formatting
just go-vet         # Run linter
```

The linters that run are declared in `.golangci.yml`. Read them there rather
than looking for a list here. A copied list goes stale the first time the
configuration changes. Generated files (`*.gen.go`, `*.pb.go`) are excluded from
formatting.

### Documentation

Markdown files are formatted with [mdformat] through `uvx`. This style is
enforced by CI.

```bash
just md-fmt-check   # Check formatting
just md-fmt         # Auto-fix formatting
```

## Code standards

### Function signatures

Functions with parameters use multi-line format, one parameter per line, with
the closing parenthesis and the return types on a line of their own:

```go
func FunctionName(
    param1 type1,
    param2 type2,
) (returnType, error) {
}
```

Functions taking no parameters stay on one line:

```go
func Name() string {
}
```

Adding a parameter then shows as one added line rather than a rewritten
signature.

### File naming

Name a file for what it holds. Avoid `helpers.go`, `utils.go`, and names of that
kind: they describe where code was put rather than what it is, and they
accumulate whatever has no other home.

`types.go` holds only type declarations: structs, interfaces, constants, and
aliases. A function belongs in a file named for what it does.

A test file is named for the production file it tests. Where tests grow too
large to read, split the production file first so each test file keeps a
counterpart, rather than splitting tests away from the file they cover.

### Go patterns

- Error wrapping: `fmt.Errorf("context: %w", err)`, so the chain names each
  layer it passed through and stays inspectable with `errors.Is` and
  `errors.As`.
- Early returns rather than nesting the successful path inside conditionals.
- Unused parameters: rename to `_`.
- Import order: standard library, third party, then local, separated by blank
  lines.

### Test doubles

A double for an interface this organization defines is generated with `mockgen`
and committed. Do not write a struct by hand to satisfy one.

Generated mocks live in a `mocks` package beside the code they mock, produced by
a `generate.go` holding the directive:

```go
package mocks

//go:generate go tool go.uber.org/mock/mockgen -source=../types.go -destination=types.gen.go -package=mocks
```

The generator is resolved through the module's tool dependencies, so every
checkout runs the version `go.mod` records. Destination files end in `.gen.go`
and are committed. Do not use `gen/` for mocks. That name is taken by API code
generation.

When the interface is **unexported**, a sibling package cannot work: the mock
has to import the package to name the types in the interface, and the package's
own tests have to import the mock. Generate it into the package instead, with a
destination scoped to tests so the mocking library stays out of the dependency
graph of anything that imports the package:

```go
// generate.go, in the package that declares the interface
package thispackage

//go:generate go tool go.uber.org/mock/mockgen -source=thing.go -destination=thing.gen_test.go -package=thispackage
```

Either way the directives live in a `generate.go` that holds no code, and the
generated file carries `.gen` so a reader knows not to edit it.

Where call sites would otherwise repeat the same expectations, write a
constructor returning a configured mock rather than introducing a hand-written
type. The generated mock is still what satisfies the interface.

Three doubles are written by hand, because generating them buys nothing:

- One standing in for a standard library interface: `net.Conn`, `fs.File`,
  `io.Writer`, `slog.Handler`. Those do not move when our code does.
- One carrying a real implementation of the behavior under test, such as signing
  with a genuinely generated key pair.
- A recorder for a dependency called from a goroutine the test cannot join,
  where a generated mock would assert a call count at a moment the test cannot
  establish. State that reason where the recorder is defined.

### File headers

Every `.go` file MUST start with the @@license@@ license header. See any
existing Go file in the repo for the exact format. Build-tagged files put
`//go:build` on line 1, blank line, then the header.

## Testing

```bash
just test           # Run all tests (lint + unit + coverage)
just go-unit       # Run unit tests only
just go-unit-cov   # Generate coverage report
go test -run TestName -v ./...  # Run a single test
```

Coverage is gated at @@coverageTarget@@. `just test` fails if total coverage
drops below it, so a change that adds untested code fails locally and in CI:

```bash
just go-unit-cov-check   # Report coverage and fail below the target
```

The target is declared in `.github/codecov.yml` and in the shared `go` justfile
module. Change both together.

### Test file conventions

- Public tests: `*_public_test.go` in the package's `_test` package, exercising
  the exported surface. This is the default.
- Internal tests: `*_test.go` in the same package, for what the exported surface
  cannot reach.
- Suite naming: `*_public_test.go` → `{Name}PublicTestSuite`, `*_test.go` →
  `{Name}TestSuite`.
- `testify/suite` with table-driven cases.
- One suite method per function under test. Success, errors, and edge cases are
  rows in one table, not separate methods.
- `export_test.go` exposes unexported symbols to external tests, by alias or by
  setter. Do not use an alias to re-cover behavior the caller's own test already
  reaches; a helper with its own contract is what the pattern is for.

## Before committing

Run `just ready` before committing to ensure generated code, package docs,
formatting, and lint are all up to date:

```bash
just ready
```

## Branching

All changes should be developed on feature branches. Create a branch from
`@@defaultBranch@@` using the naming convention `type/short-description`, where
`type` matches the [Conventional Commits] type:

- `feat/add-retry-logic`
- `fix/null-pointer-crash`
- `docs/update-api-reference`
- `refactor/simplify-handler`
- `chore/update-dependencies`

When using Claude Code's `/commit` command, a branch will be created
automatically if you are on `@@defaultBranch@@`.

## Commit messages

Follow [Conventional Commits] with the 50/72 rule:

- **Subject line**: max 50 characters, imperative mood, capitalized, no period
- **Body**: wrap at 72 characters, separated from subject by a blank line
- **Format**: `type(scope): description`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`
- Summarize the "what" and "why", not the "how"

Try to write meaningful commit messages and avoid having too many commits on a
PR. Most PRs should likely have a single commit (although for bigger PRs it may
be reasonable to split it in a few). Git squash and rebase is your friend!

## Submitting a PR

- **Describe your changes.** Say what changed and why. A reviewer should not
  have to read the diff to learn the reason for it.
- **Issue/PR links.** Link any previous work such as related issues or PRs.
  Please describe how your changes differ to/extend this work.
- **Examples.** Add any examples or screenshots that you think are useful to
  demonstrate the effect of your changes.
- **Draft PRs.** If your changes are incomplete, but you would like to discuss
  them, open the PR as a draft and add a comment to start a discussion. Using
  comments rather than the PR description allows the description to be updated
  later while preserving any discussions.

## AI usage

This repo is written with AI assistance. All contributions are subject to the
[AI Usage Policy](AI_POLICY.md). Disclose the tool you used, and make sure you
can explain what your change does without the aid of AI tools.

## FAQ

> I want to contribute, where do I start?

All kinds of contributions are welcome, whether it's a typo fix or a shiny new
feature. You can also contribute by upvoting/commenting on issues or helping to
answer questions.

> I'm stuck, where can I get help?

If you have questions, open a [Discussion] on GitHub.

[claude code]: https://claude.ai/code
[conventional commits]: https://www.conventionalcommits.org
[discussion]: https://@@modulePath@@/discussions
[go]: https://go.dev
[gofumpt]: https://github.com/mvdan/gofumpt
[golangci-lint]: https://golangci-lint.run
[just]: https://just.systems
[mdformat]: https://pypi.org/project/mdformat/
[mise]: https://mise.jdx.dev
[uv]: https://docs.astral.sh/uv/
