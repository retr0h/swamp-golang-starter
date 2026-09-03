# Contributing

## Prerequisites

- **[mise](https://mise.jdx.dev/).** Provisions every other tool from
  `.mise.toml`. This is the only dependency you install yourself.

  ```bash
  brew install mise
  ```

## Setup

```bash
mise install
just fetch
just deps
```

## Before you commit

```bash
just ready
```

That runs formatting, linting and the tests — the same checks CI runs.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description`, subject under 50 characters, body wrapped at 72.

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`.

## Branches

Branch from `main` using `type/short-description`, matching the commit type.
