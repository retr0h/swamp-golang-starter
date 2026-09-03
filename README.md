[![build](https://img.shields.io/github/actions/workflow/status/retr0h/swamp-golang-starter/ci.yml?style=for-the-badge)](https://github.com/retr0h/swamp-golang-starter/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-brightgreen.svg?style=for-the-badge)](LICENSE)
[![release](https://img.shields.io/github/release/retr0h/swamp-golang-starter.svg?style=for-the-badge)](https://github.com/retr0h/swamp-golang-starter/releases/latest)
[![swamp extension](https://img.shields.io/badge/swamp.club-%40retr0h%2Fgolang--starter-ff69b4?style=for-the-badge)](https://swamp.club/extensions/@retr0h/golang-starter)
[![deno](https://img.shields.io/badge/deno-2.x-000000?style=for-the-badge&logo=deno&logoColor=white)](https://deno.com)
[![conventional commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg?style=for-the-badge)](https://conventionalcommits.org)

# @retr0h/golang-starter

🐊 [Swamp](https://github.com/systeminit/swamp) extension that scaffolds a Go
project — module, justfile, CI workflows, linters, coverage gate and release
config — in one workflow run.

Two shapes come from one model. A library and a command differ in layout and
release config and in nothing else, so they share a model rather than each
having their own.

It also re-renders. Point it at a repository that already exists and it
refreshes the generated files while leaving everything the project wrote
itself untouched.

## 📦 Models

### `@retr0h/go-project`

| Method           | Description                                          |
| ---------------- | ---------------------------------------------------- |
| `check_prereqs`  | Verify `go`, `git` and `just` are installed          |
| `create_project` | Create the project directory and initialise git      |
| `write_files`    | Render the templates into the project directory      |
| `bootstrap`      | Resolve the module and verify the project builds     |

## 🔧 Workflows

| Workflow                    | Produces                                            |
| --------------------------- | --------------------------------------------------- |
| `@retr0h/create-go-lib`     | An importable library — `pkg/`, no `main`           |
| `@retr0h/create-go-cli`     | A command — `main.go`, goreleaser, release workflow |
| `@retr0h/retemplate-go`     | Re-renders generated files over an existing project |

```bash
swamp workflow run @retr0h/create-go-lib --input project_name=widget
swamp workflow run @retr0h/create-go-cli --input project_name=widgetctl
```

## 🎛️ Gates

Everything opinionated is a switch. Two are off by default, deliberately.

| Gate                | Default | Effect                                             |
| ------------------- | ------- | -------------------------------------------------- |
| `with_ci`           | on      | GitHub Actions workflows                            |
| `with_releaser`     | on      | goreleaser config and release workflow (cli only)   |
| `with_codecov`      | on      | Codecov config and upload step                      |
| `with_dependabot`   | on      | Dependabot config                                   |
| `with_labeler`      | on      | Labeler config and workflow                         |
| `with_agent_docs`   | on      | `AGENTS.md` and `CLAUDE.md`                         |
| `with_code_of_conduct` | on   | `CODE_OF_CONDUCT.md`; requires `email`              |
| `with_badges`       | on      | shields.io block in the generated README            |
| `shared_justfiles`  | **off** | Fetch build recipes from one URL instead of writing a self-contained justfile. Suits a single organization and nobody else. |
| `with_repos_json`   | **off** | `.github/repos.json` for `gh-reposync`. Declares branch protection most consumers will not want applied. |
| `overwrite`         | **off** | Re-render over existing files. On by default in `retemplate-go` only. |

## 🔤 Variables

| Variable            | Default          |                                                |
| ------------------- | ---------------- | ---------------------------------------------- |
| `project_name`      | —                | required; lowercase, alphanumeric, hyphens     |
| `owner`             | `retr0h`         | module path is `<module_host>/<owner>/<name>`  |
| `module_host`       | `github.com`     |                                                |
| `description`       | `""`             |                                                |
| `author`            | `owner`          | copyright holder in LICENSE                    |
| `email`             | `""`             | Code of Conduct enforcement contact            |
| `license`           | `MIT`            | SPDX identifier                                |
| `go_version`        | `1.26`           | language floor written to `go.mod`             |
| `go_version_mise`   | `latest`         | what `mise` provisions                         |
| `go_version_ci`     | `stable`         | what CI installs                               |
| `coverage_target`   | `100%`           | written to `codecov.yml` and the justfile      |
| `default_branch`    | `main`           |                                                |
| `runs_on`           | `ubuntu-latest`  | Actions runner label                           |
| `pkg_path`          | `""`             | import path for the go reference badge         |
| `parent_dir`        | `~/git`          | where the project directory is created         |

Three Go versions rather than one: `go.mod` carries a floor — the oldest Go
that compiles the module — while `mise` and CI track the newest toolchain.
Collapsing them pins developers to the floor.

## ♻️ Re-rendering an existing project

```bash
swamp workflow run @retr0h/retemplate-go \
  --input project_name=widget \
  --input parent_dir=~/git \
  --input owner=retr0h
```

Templates are two classes, and only one is rewritten:

- **managed** — workflows, dotfiles, `.github` config, `justfile`,
  `CONTRIBUTING.md`, `AGENTS.md`. Generated, so re-rendering is the point.
- **seeded** — `README.md`, `go.mod`, `LICENSE`, the Go sources. Written once,
  then the project's. These grow into writing no template can reproduce, so
  `overwrite` never touches them.

## 🔗 Dependencies

None at the extension layer. The generated project needs `go`, `git`, `just`
and `mise`; `uv` when markdown linting is enabled.

## 📥 Install

```bash
swamp extension pull @retr0h/golang-starter
```

## 🧰 Development

```bash
mise install                                   # deno
swamp extension fmt manifest.yaml              # format and lint
~/.swamp/deno/deno test --allow-read --allow-env extensions/models/
SWAMP_EXTENSION_REVIEW_DIR="$PWD/.swamp-review" \
  swamp extension push manifest.yaml --dry-run
```

The adversarial review report is bound to a content hash of the source, so any
change requires a fresh one. Reports live in `.swamp-review/` rather than the
system temp directory a local run defaults to — the override needs an absolute
path, and a relative one is ignored silently.

The current report records two open issues on purpose: `execute()` is not unit
tested, because `createModelTestContext` supplies no `extensionFile`; and the
mutating methods carry no labelled pre-flight checks.

## 📄 License

The [MIT](LICENSE) License.
