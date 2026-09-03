/**
 * Scaffolds a Go project — module, justfile, CI workflows, linters and
 * release config.
 *
 * Two shapes are produced from one model: a library (`kind: lib`) and a
 * command (`kind: cli`). They differ only in layout and release config;
 * everything else is identical, which is the reason they share a model
 * rather than each having their own.
 *
 * Shared build logic is fetched at run time from a justfiles repository
 * rather than written into each project, so a change there reaches every
 * scaffolded repository without one edit per repository.
 *
 * @module
 */
import { z } from "npm:zod@4";

// --- Schemas ---

const GlobalArgsSchema = z.object({
  projectName: z
    .string()
    .regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens")
    .describe("Directory name, module name, and repository name"),
  kind: z
    .enum(["lib", "cli"])
    .default("lib")
    .describe("Project shape: an importable library, or a command"),
  owner: z
    .string()
    .default("retr0h")
    .describe("GitHub owner; the module path is built from it"),
  description: z
    .string()
    .default("")
    .describe("One-line repository description"),
  parentDir: z
    .string()
    .default("~/git")
    .describe("Parent directory the project folder is created in"),
  goVersion: z
    .string()
    .default("1.25")
    .describe("Go version written to go.mod"),
  license: z
    .string()
    .default("MIT")
    .describe("SPDX identifier written to LICENSE and the module metadata"),
  sharedJustfiles: z
    .boolean()
    .default(false)
    .describe(
      "Fetch build recipes from a shared justfiles repository instead of writing a self-contained justfile. Off by default: it couples every generated project to one URL, which suits a single organization and nobody else.",
    ),
  justfilesRepo: z
    .string()
    .default(
      "https://raw.githubusercontent.com/osapi-io/osapi-justfiles/refs/heads/main",
    )
    .describe(
      "Base URL for shared recipes. Only used when sharedJustfiles is on.",
    ),
  withCI: z
    .boolean()
    .default(true)
    .describe("Write GitHub Actions workflows"),
  withReleaser: z
    .boolean()
    .default(true)
    .describe("Write .goreleaser.yaml. Ignored for kind: lib."),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const StateSchema = z.object({
  projectName: z.string(),
  projectPath: z.string(),
  modulePath: z.string(),
  kind: z.enum(["lib", "cli"]),
  goVersion: z.string(),
  filesWritten: z.array(z.string()).default([]),
  status: z.enum([
    "prereqs_checked",
    "created",
    "files_written",
    "bootstrapped",
  ]),
  updatedAt: z.iso.datetime(),
});

// --- Helpers ---

/** Expand a leading `~` to the user's home directory. */
function expandHome(dir: string): string {
  if (!dir.startsWith("~")) return dir;
  const home = Deno.env.get("HOME");
  if (!home) throw new Error("HOME is not set; cannot expand '~'");
  return dir.replace(/^~/, home);
}

/** Run a command, capture output, and throw on failure. */
async function runCommand(
  command: string,
  args: string[],
  opts?: { cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  const cmd = new Deno.Command(command, {
    args,
    cwd: opts?.cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await cmd.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);

  if (!output.success) {
    throw new Error(
      `Command failed: ${command} ${args.join(" ")}\n` +
        `Exit code: ${output.code}\n` +
        `Stdout: ${stdout}\n` +
        `Stderr: ${stderr}`,
    );
  }
  return { stdout, stderr };
}

/** Derive the module path from owner and project name. */
function modulePathFor(args: GlobalArgs): string {
  return `github.com/${args.owner}/${args.projectName}`;
}

/** Derive the project directory from parentDir and project name. */
function projectPathFor(args: GlobalArgs): string {
  return `${expandHome(args.parentDir)}/${args.projectName}`;
}

/**
 * Render a template by substituting `{{ key }}` placeholders.
 *
 * Files are templated rather than copied: the module path, project name,
 * description, Go version and license differ per project, and a scaffolder
 * that copies them verbatim produces a repository that lies about itself.
 */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_match, key: string) => {
      if (!(key in vars)) {
        throw new Error(`Template referenced unknown variable: ${key}`);
      }
      return vars[key];
    },
  );
}

/** Write a file only when it does not already exist, so re-runs are safe. */
async function writeIfAbsent(path: string, content: string): Promise<boolean> {
  try {
    await Deno.lstat(path);
    return false;
  } catch {
    await Deno.mkdir(path.substring(0, path.lastIndexOf("/")), {
      recursive: true,
    });
    await Deno.writeTextFile(path, content);
    return true;
  }
}

// --- Templates ---
//
// Each is rendered with the variables below, never copied verbatim:
//   modulePath, projectName, description, goVersion, owner, license, year

const GO_MOD = `module {{ modulePath }}

go {{ goVersion }}
`;

const README = `# {{ projectName }}

{{ description }}

## Install

\`\`\`bash
go get {{ modulePath }}
\`\`\`

## Development

\`\`\`bash
mise install
just test
\`\`\`
`;

const GITIGNORE = `.just/
dist/
.coverage/
`;

const MISE_TOML = `[tools]
go = "{{ goVersion }}"
just = "latest"
`;

/** Self-contained justfile — used when sharedJustfiles is off. */
const JUSTFILE_STANDALONE = `# {{ projectName }}

default:
    @just --list

# Install dependencies
deps:
    go mod download
    go mod tidy

# Run the linters
lint:
    golangci-lint run

# Run the tests with coverage
test:
    go test -race -coverprofile=.coverage/cover.out ./...

# Everything CI runs
ready: deps lint test
`;

/** Thin justfile that fetches shared recipes — used when sharedJustfiles is on. */
const JUSTFILE_SHARED = `# {{ projectName }}

set shell := ["bash", "-uc"]

import? '.just/remote/go.just'

default:
    @just --list

# Fetch shared recipes
fetch:
    mkdir -p .just/remote
    curl -sSfL {{ justfilesRepo }}/go/go.just -o .just/remote/go.just

# Everything CI runs
ready: fetch go-deps go-lint go-test
`;

const GOLANGCI = `version: "2"

linters:
  enable:
    - errcheck
    - govet
    - ineffassign
    - staticcheck
    - unused
`;

const GORELEASER = `version: 2

project_name: {{ projectName }}

builds:
  - main: ./cmd/{{ projectName }}
    binary: {{ projectName }}
    env:
      - CGO_ENABLED=0
    goos: [linux, darwin]
    goarch: [amd64, arm64]

changelog:
  use: github
`;

const CI_WORKFLOW = `---
name: Go

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Set up Go
        uses: actions/setup-go@v7
        with:
          go-version: "{{ goVersion }}"
      - name: Install just
        uses: extractions/setup-just@v4
      - name: Test
        run: just ready
`;

const LIB_SOURCE = `// Package {{ packageName }} {{ description }}
package {{ packageName }}
`;

const CLI_SOURCE = `// Command {{ projectName }} {{ description }}
package main

import "fmt"

func main() {
	fmt.Println("{{ projectName }}")
}
`;

// --- Model ---

/** Model definition for scaffolding a Go project. */
export const model = {
  type: "@retr0h/go-project",
  version: "2026.09.03.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    "state": {
      description: "Scaffolding progress for one Go project",
      schema: StateSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  methods: {
    check_prereqs: {
      description: "Verify go, git and just are installed",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          globalArgs: GlobalArgs;
          logger: { info: (m: string, p?: unknown) => void };
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        for (const tool of ["go", "git", "just"]) {
          await runCommand(tool, ["--version"]);
        }
        const projectPath = projectPathFor(context.globalArgs);
        context.logger.info("Prerequisites present; target is {path}", {
          path: projectPath,
        });
        const handle = await context.writeResource("state", "current", {
          projectName: context.globalArgs.projectName,
          projectPath,
          modulePath: modulePathFor(context.globalArgs),
          kind: context.globalArgs.kind,
          goVersion: context.globalArgs.goVersion,
          filesWritten: [],
          status: "prereqs_checked",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
    write_files: {
      description:
        "Render and write the project files, honouring the feature toggles",
      arguments: z.object({}),
      execute: async (
        _args: Record<string, never>,
        context: {
          globalArgs: GlobalArgs;
          logger: { info: (m: string, p?: unknown) => void };
          writeResource: (
            specName: string,
            name: string,
            data: Record<string, unknown>,
          ) => Promise<{ name: string }>;
        },
      ) => {
        const g = context.globalArgs;
        const projectPath = projectPathFor(g);
        const vars: Record<string, string> = {
          modulePath: modulePathFor(g),
          projectName: g.projectName,
          packageName: g.projectName.replace(/-/g, ""),
          description: g.description || g.projectName,
          goVersion: g.goVersion,
          owner: g.owner,
          license: g.license,
          justfilesRepo: g.justfilesRepo,
          year: String(new Date().getFullYear()),
        };

        const files: Array<{ path: string; template: string }> = [
          { path: "go.mod", template: GO_MOD },
          { path: "README.md", template: README },
          { path: ".gitignore", template: GITIGNORE },
          { path: ".mise.toml", template: MISE_TOML },
          { path: ".golangci.yml", template: GOLANGCI },
          {
            path: "justfile",
            template: g.sharedJustfiles ? JUSTFILE_SHARED : JUSTFILE_STANDALONE,
          },
        ];

        if (g.kind === "lib") {
          files.push({
            path: `pkg/${vars.packageName}/${vars.packageName}.go`,
            template: LIB_SOURCE,
          });
        } else {
          files.push({
            path: `cmd/${g.projectName}/main.go`,
            template: CLI_SOURCE,
          });
          if (g.withReleaser) {
            files.push({ path: ".goreleaser.yaml", template: GORELEASER });
          }
        }

        if (g.withCI) {
          files.push({
            path: ".github/workflows/go.yml",
            template: CI_WORKFLOW,
          });
        }

        const written: string[] = [];
        for (const file of files) {
          const full = `${projectPath}/${file.path}`;
          if (await writeIfAbsent(full, render(file.template, vars))) {
            written.push(file.path);
          }
        }

        context.logger.info("Wrote {count} files to {path}", {
          count: written.length,
          path: projectPath,
        });

        const handle = await context.writeResource("state", "current", {
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
          filesWritten: written,
          status: "files_written",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
