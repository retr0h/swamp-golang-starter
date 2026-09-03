@@badges@@
# @@projectName@@

@@description@@

## Install

```bash
@@installLine@@
```

## Usage

<!-- Describe what this does and how to use it. -->

## Development

Prerequisites are `mise`; everything else is provisioned from `.mise.toml`.

```bash
mise install
just fetch      # pull shared build recipes
just deps
just test
just ready      # everything CI runs
```

## Documentation

[Package documentation](https://pkg.go.dev/@@goReference@@) on pkg.go.dev.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, setup, conventions
and the pull request workflow.

## License

The @@license@@ License, see [LICENSE](LICENSE).
