# Contributing

Thank you for your contribution to @@projectName@@.

<!-- The shared sections of every osapi-io CONTRIBUTING.md, in their order.
CONSTITUTION.md says which sections every repository has and which only the Go
repositories have. A repository puts its own sections between these. It does
not rename, move or remove one. -->

## Before you start

- Read the [Code of Conduct](CODE_OF_CONDUCT.md). It applies to all
  communication in this repository.
- **Design pages.** The design pages of this repository are in
  [osapi-io/specs](https://github.com/osapi-io/specs), under
  `components/@@projectName@@/`. Read them before you change the behavior. When
  you change the behavior, change the design page in the same work. A design
  page in this repository becomes incorrect when the code changes. No check
  finds the difference.
- **Examine the work that exists.** Look for a pull request or an issue about
  the change. If you find one, use what it says in your work.
- **Backward compatibility.** Make sure that your change does not stop a program
  that uses @@projectName@@. A change that keeps compatibility is more likely to
  merge. If your change cannot keep it, open an issue first. Then the
  maintainers can discuss the API change before you do the work.

## Prerequisites

Install the tools with [mise]:

```bash
mise install
```

- **[Go].** @@projectName@@ is written in Go. The project supports the two
  latest major versions of Go. Use one of them.
- **[uv].** A Python package runner. `just md-fmt` uses it to run [mdformat]. It
  installs nothing into the repository.
- **[just].** The task runner. Use it to build, test and format.

### Coding agents

This repository works with any coding agent that reads `AGENTS.md`. Claude Code
and Codex read the same skills: `.claude/skills` holds them, and
`.agents/skills` is a link to it. `CLAUDE.md` only points to `AGENTS.md`.

For [Claude Code], install this plugin from the default marketplace:

```
/plugin install commit-commands@claude-plugins-official
```

- **commit-commands.** It gives the `/commit` and `/commit-push-pr` commands.
  They follow the commit rules of this repository.

## Setup

Download the shared justfiles and install the dependencies:

```bash
just fetch
just deps
```

## Project structure

```text
@@projectStructure@@
```

## Code style

[gofumpt] formats the Go code. [golangci-lint] examines the Go code for
problems. CI makes sure that both pass.

```bash
just go-fmt-check   # Check formatting
just go-fmt         # Auto-fix formatting
just go-vet         # Run linter
```

`.golangci.yml` lists the linters that run. Read the list there. A copy of the
list in a page becomes incorrect when the configuration changes. Formatting does
not apply to generated files (`*.gen.go`, `*.pb.go`).

### Documentation

[mdformat] formats the markdown files, through `uvx`. CI makes sure that the
format is correct.

```bash
just md-fmt-check   # Check formatting
just md-fmt         # Auto-fix formatting
```

Write each page in Simplified Technical English, as
[the osapi-io constitution](https://github.com/osapi-io/specs/blob/main/CONSTITUTION.md)
requires.

## Code standards

### Function signatures

If a function has parameters, write its signature on more than one line. Put
each parameter on its own line. Put the last `)` and the return types on their
own line:

```go
func FunctionName(
    param1 type1,
    param2 type2,
) (returnType, error) {
}
```

Write a function that has no parameters on one line:

```go
func Name() string {
}
```

Then a new parameter shows as one added line in a diff, not as a changed
signature.

### File names

Give a file the name of what it holds. Do not use `helpers.go`, `utils.go` or
names of that type. They tell where code is, not what it is. They also collect
code that has no other place.

`types.go` holds only type declarations: structs, interfaces, constants and
aliases. Put a function in a file that has the name of what the function does.

A test file has the name of the production file that it tests. If a test file
becomes too large to read, split the production file first. Then each test file
keeps its production file.

### Go patterns

- Wrap errors with `fmt.Errorf("context: %w", err)`. Then the chain names each
  layer. `errors.Is` and `errors.As` can examine the chain.
- Return early. Do not put the successful path inside conditions.
- Give an unused parameter the name `_`.
- Put imports in three groups, with a blank line between them: the standard
  library, third-party packages, then local packages.

### Test doubles

For an interface that this organization defines, generate the double with
`mockgen` and commit it. Do not write a struct by hand for it.

A generated mock is in a `mocks` package next to the code that it mocks. A
`generate.go` file in that package holds the directive:

```go
package mocks

//go:generate go tool go.uber.org/mock/mockgen -source=../types.go -destination=types.gen.go -package=mocks
```

The tool dependencies of the module supply the generator. Thus each checkout
runs the version that `go.mod` records. The names of the generated files end in
`.gen.go`. Commit these files. Do not put mocks in `gen/`. That name is for API
code generation.

If the interface is **unexported**, a sibling package cannot hold the mock. The
mock must import the package to name the types of the interface. The tests of
the package must import the mock. Thus generate the mock into the package. Give
the mock a destination that only tests use. Then the mock library is not a
dependency of code that imports the package:

```go
// generate.go, in the package that declares the interface
package thispackage

//go:generate go tool go.uber.org/mock/mockgen -source=thing.go -destination=thing.gen_test.go -package=thispackage
```

In both cases, the directives are in a `generate.go` that holds no code. The
name of the generated file has `.gen`, so a reader knows not to edit it.

If many tests set the same expectations, write a constructor that returns a
configured mock. Do not write a type by hand for it. The generated mock is still
the type that satisfies the interface.

Write these three doubles by hand, because a generated one gives no advantage:

- A double for a standard library interface: `net.Conn`, `fs.File`, `io.Writer`,
  `slog.Handler`. These interfaces do not change when our code changes.
- A double that has a real implementation of the behavior under test, for
  example signatures from a key pair that the test generates.
- A recorder for a dependency that a goroutine calls, if the test cannot wait
  for that goroutine. A generated mock counts the calls at a time that the test
  cannot control. Write that reason where you define the recorder.

### File headers

Start each `.go` file with the @@license@@ license header. Copy the format from
a Go file in the repository. In a file with a build tag, put `//go:build` on
line 1, then a blank line, then the header.

## Tests

```bash
just test           # Run all tests (lint + unit + coverage)
just go-unit       # Run unit tests only
just go-unit-cov   # Generate coverage report
go test -run TestName -v ./...  # Run a single test
```

The coverage target is @@coverageTarget@@. `just test` fails when the total
coverage is less than the target. Thus a change that adds code without tests
fails on your machine and in CI:

```bash
just go-unit-cov-check   # Report coverage and fail below the target
```

`.github/codecov.yml` and the shared `go` justfile module both declare the
target. Change the two together.

### Test file conventions

- Public tests: `*_public_test.go`, in the `_test` package of the package. They
  test the exported API. Write this type of test first.
- Internal tests: `*_test.go`, in the same package. Use them only for what the
  exported API cannot reach.
- Suite names: `*_public_test.go` has `{Name}PublicTestSuite`, and `*_test.go`
  has `{Name}TestSuite`.
- Use `testify/suite` with table-driven cases.
- Write one suite method for each function under test. Success, errors and edge
  cases are rows in one table, not different methods.
- `export_test.go` gives external tests access to unexported symbols, through an
  alias or a setter. Do not use an alias to test again what the test of the
  caller already reaches. Use it for a helper that has its own contract.

## Before you commit

Run `just ready` before you commit. It makes sure that generated code, package
documentation, format and lint are current:

```bash
just ready
```

## Branches

Make all changes on a branch. Make the branch from `@@defaultBranch@@`. Give it
the name `type/short-description`, where `type` is the [Conventional Commits]
type:

- `feat/add-retry-logic`
- `fix/null-pointer-crash`
- `docs/update-api-reference`
- `refactor/simplify-handler`
- `chore/update-dependencies`

If you are on `@@defaultBranch@@`, the `/commit` command of Claude Code makes
the branch for you.

## Commit messages

Use [Conventional Commits] with the 50/72 rule:

- **Subject line.** 50 characters or fewer, in the imperative mood, with no
  period at the end.
- **Body.** Wrap it at 72 characters. Put a blank line between the subject and
  the body.
- **Format.** `type(scope): description`.
- **Types.** `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
  `chore`.
- Tell what changed and why, not how.

Write commit messages that help the reader. Keep the number of commits in a pull
request small. Most pull requests have one commit. A large pull request can have
a few. Use squash and rebase to combine commits.

## Submit a pull request

- **Describe your changes.** Tell what changed and why. Then a reviewer does not
  have to read the diff to find the reason.
- **Links to issues and pull requests.** Link to related issues and pull
  requests. Tell how your change is different from that work, or how it adds to
  it.
- **Examples.** Add examples or screenshots that show the effect of your change.
- **Draft pull requests.** If your change is not complete but you want to
  discuss it, open the pull request as a draft. Start the discussion in a
  comment, not in the description. Then you can change the description later and
  keep the discussion.

## AI usage

We write this repository with the help of AI tools. The
[AI Usage Policy](AI_POLICY.md) applies to all contributions. Tell which tool
you used. Make sure that you can explain what your change does without the help
of an AI tool.

## FAQ

> I want to contribute. Where do I start?

All contributions are welcome, from a typo fix to a new feature. You can also
vote or comment on issues, or help answer questions.

> I need help. Where do I ask?

Open a [Discussion] on GitHub.

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
