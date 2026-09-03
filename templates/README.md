# {{ projectName }}

{{ description }}

## Install

```bash
{{ installLine }}
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

## License

{{ license }}, see [LICENSE](LICENSE).
