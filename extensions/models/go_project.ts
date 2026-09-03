/**
 * Scaffolds a Go project — module, justfile, CI workflows, linters and
 * release config.
 *
 * Two shapes come from one model: a library (`kind: lib`) and a command
 * (`kind: cli`). They differ in layout and release config and in nothing
 * else, which is why they share a model rather than each having their own.
 *
 * Templates are real files under `templates/`, listed in the manifest's
 * `additionalFiles` and resolved at run time through `context.extensionFile`.
 * They are not string literals in this file: a template that lives in a
 * `.yml` is linted, highlighted and diffable, and needs no escaping.
 *
 * @module
 */
import { z } from "npm:zod@4";

// --- Schemas ---

const GlobalArgsSchema = z.object({
  // Identity
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
    .describe("Repository owner; the module path is built from it"),
  moduleHost: z
    .string()
    .default("github.com")
    .describe("Module path host"),
  description: z
    .string()
    .default("")
    .describe("One-line repository description"),
  author: z
    .string()
    .default("")
    .describe("Copyright holder written to LICENSE; defaults to owner"),
  license: z
    .string()
    .default("MIT")
    .describe("SPDX identifier named in README and LICENSE"),

  // Environment
  parentDir: z
    .string()
    .default("~/git")
    .describe("Parent directory the project folder is created in"),
  goVersion: z
    .string()
    .default("1.25")
    .describe("Go version written to go.mod and .mise.toml"),
  coverageTarget: z
    .string()
    .default("100%")
    .describe(
      "Coverage target. Written to both .github/codecov.yml and the justfile, because neither can read the other's config.",
    ),
  defaultBranch: z
    .string()
    .default("main")
    .describe("Branch the CI workflows and branch protection target"),
  runsOn: z
    .string()
    .default("ubuntu-latest")
    .describe("GitHub Actions runner label"),
  goVersionCI: z
    .string()
    .default("stable")
    .describe(
      "Go version CI installs. Separate from goVersion, which pins the language version in go.mod: CI usually wants the newest toolchain, not the module's floor.",
    ),

  // Gates
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
  withCI: z.boolean().default(true).describe("GitHub Actions workflows"),
  withReleaser: z
    .boolean()
    .default(true)
    .describe("goreleaser config and release workflow. Ignored for kind: lib."),
  withCodecov: z.boolean().default(true).describe("Codecov config"),
  withDependabot: z.boolean().default(true).describe("Dependabot config"),
  withLabeler: z.boolean().default(true).describe(
    "Pull request labeler config",
  ),
  withAgentDocs: z
    .boolean()
    .default(true)
    .describe("AGENTS.md and CLAUDE.md"),
  overwrite: z
    .boolean()
    .default(false)
    .describe(
      "Re-render over files that already exist. Off by default because it discards local edits. Point parentDir and projectName at an existing repository to refresh it from the current templates.",
    ),
  withReposJson: z
    .boolean()
    .default(false)
    .describe(
      "'.github/repos.json' for gh-reposync. Off by default: it declares branch protection, which most consumers will not want applied.",
    ),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

const StateSchema = z.object({
  projectName: z.string(),
  projectPath: z.string(),
  modulePath: z.string(),
  kind: z.enum(["lib", "cli"]),
  goVersion: z.string(),
  filesWritten: z.array(z.string()).default([]),
  filesSkipped: z.array(z.string()).default([]),
  filesOverwritten: z.array(z.string()).default([]),
  status: z.enum([
    "prereqs_checked",
    "created",
    "files_written",
    "bootstrapped",
  ]),
  updatedAt: z.iso.datetime(),
});

// --- Context ---

/** The slice of the method context this model uses. */
interface Ctx {
  globalArgs: GlobalArgs;
  logger: { info: (m: string, p?: Record<string, unknown>) => void };
  extensionFile: (relPath: string) => string;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
}

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

/** Module path for the project. */
function modulePathFor(g: GlobalArgs): string {
  return `${g.moduleHost}/${g.owner}/${g.projectName}`;
}

/** Absolute project directory. */
function projectPathFor(g: GlobalArgs): string {
  return `${expandHome(g.parentDir)}/${g.projectName}`;
}

/**
 * Substitute `@@key@@` placeholders.
 *
 * The delimiter is deliberately not `{{ }}`. Three tools in a generated
 * project already own that syntax and one of them collides outright:
 *
 *   just              `{{ coverage_target }}`   — same shape, same spacing
 *   goreleaser        `{{.Version}}`
 *   GitHub Actions    `${{ secrets.TOKEN }}`
 *
 * A justfile template cannot use `{{ }}` for scaffolding variables and also
 * carry just's own, so the scaffolder yields the syntax rather than escaping
 * around it. Nothing in the Go, YAML, TOML, just, goreleaser or Actions
 * stack uses `@@`.
 */
function render(template: string, vars: Record<string, string>): string {
  return template.replace(
    /@@(\w+)@@/g,
    (_match, key: string) => {
      if (!(key in vars)) {
        throw new Error(`Template referenced unknown variable: ${key}`);
      }
      return vars[key];
    },
  );
}

/** Build the substitution map from the model's arguments. */
function varsFor(g: GlobalArgs): Record<string, string> {
  const modulePath = modulePathFor(g);
  return {
    projectName: g.projectName,
    packageName: g.projectName.replace(/-/g, ""),
    modulePath,
    moduleHost: g.moduleHost,
    owner: g.owner,
    description: g.description || g.projectName,
    author: g.author || g.owner,
    license: g.license,
    goVersion: g.goVersion,
    coverageTarget: g.coverageTarget,
    defaultBranch: g.defaultBranch,
    runsOn: g.runsOn,
    goVersionCI: g.goVersionCI,
    justfilesRepo: g.justfilesRepo,
    year: String(new Date().getFullYear()),
    installLine: g.kind === "cli"
      ? `go install ${modulePath}@latest`
      : `go get ${modulePath}`,
  };
}

/**
 * The template-to-destination plan for one project.
 *
 * Every gate is applied here rather than at write time, so the plan is the
 * single statement of what a given set of arguments produces.
 */
function planFor(g: GlobalArgs): Array<{ template: string; dest: string }> {
  const pkg = g.projectName.replace(/-/g, "");
  const files: Array<{ template: string; dest: string }> = [
    { template: "go.mod.txt", dest: "go.mod" },
    { template: "README.md", dest: "README.md" },
    { template: "CONTRIBUTING.md", dest: "CONTRIBUTING.md" },
    { template: "CODE_OF_CONDUCT.md", dest: "CODE_OF_CONDUCT.md" },
    { template: "AI_POLICY.md", dest: "AI_POLICY.md" },
    { template: "LICENSE.txt", dest: "LICENSE" },
    { template: "gitignore.txt", dest: ".gitignore" },
    { template: "coverignore.txt", dest: ".coverignore" },
    { template: "mise.toml.txt", dest: ".mise.toml" },
    { template: "golangci.yml", dest: ".golangci.yml" },
    {
      template: g.sharedJustfiles ? "justfile-shared.txt" : "justfile.txt",
      dest: "justfile",
    },
  ];

  if (g.withAgentDocs) {
    files.push({ template: "AGENTS.md", dest: "AGENTS.md" });
    files.push({ template: "CLAUDE.md", dest: "CLAUDE.md" });
  }

  if (g.kind === "lib") {
    files.push({
      template: "lib.go.txt",
      dest: `pkg/${pkg}/${pkg}.go`,
    });
  } else {
    files.push({ template: "main.go.txt", dest: "main.go" });
    if (g.withReleaser) {
      files.push({
        template: "goreleaser.yaml",
        dest: ".goreleaser.yaml",
      });
    }
  }

  if (g.withCodecov) {
    files.push({
      template: ".github/codecov.yml",
      dest: ".github/codecov.yml",
    });
  }
  if (g.withDependabot) {
    files.push({
      template: ".github/dependabot.yml",
      dest: ".github/dependabot.yml",
    });
  }
  if (g.withLabeler) {
    files.push({
      template: ".github/labeler.yml",
      dest: ".github/labeler.yml",
    });
  }
  if (g.withReposJson) {
    files.push({
      template: ".github/repos.json",
      dest: ".github/repos.json",
    });
  }

  if (g.withCI) {
    const workflows = [
      "go",
      "commit-lint",
      "dep-review",
      "greetings",
      "just-lint",
      "labeler",
      "markdown-lint",
      "report-card",
      "stale",
    ];
    if (g.kind === "cli" && g.withReleaser) workflows.push("release");
    for (const w of workflows) {
      files.push({
        template: `.github/workflows/${w}.yml`,
        dest: `.github/workflows/${w}.yml`,
      });
    }
    files.push({
      template: ".github/delete-merged-branch-config.yml",
      dest: ".github/delete-merged-branch-config.yml",
    });
  }

  return files;
}

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
      execute: async (_args: Record<string, never>, context: Ctx) => {
        for (const tool of ["go", "git", "just"]) {
          await runCommand(tool, ["--version"]);
        }
        const g = context.globalArgs;
        const projectPath = projectPathFor(g);
        context.logger.info("Prerequisites present; target is {path}", {
          path: projectPath,
        });
        const handle = await context.writeResource("state", "current", {
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
          filesWritten: [],
          filesSkipped: [],
          filesOverwritten: [],
          status: "prereqs_checked",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    create_project: {
      description: "Create the project directory and initialise git",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
        const g = context.globalArgs;
        const projectPath = projectPathFor(g);
        await Deno.mkdir(projectPath, { recursive: true });

        // `git init` on an existing repository is a no-op, so re-running is safe.
        await runCommand("git", ["init", "-b", "main"], { cwd: projectPath });

        context.logger.info("Initialised {path}", { path: projectPath });
        const handle = await context.writeResource("state", "current", {
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
          filesWritten: [],
          filesSkipped: [],
          filesOverwritten: [],
          status: "created",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    write_files: {
      description: "Render the templates into the project directory",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
        const g = context.globalArgs;
        const projectPath = projectPathFor(g);
        const vars = varsFor(g);
        const written: string[] = [];
        const skipped: string[] = [];
        const overwritten: string[] = [];

        for (const file of planFor(g)) {
          const dest = `${projectPath}/${file.dest}`;

          // A re-run must be safe on a project someone has since edited, so
          // an existing file is left alone unless overwrite says otherwise.
          let exists = true;
          try {
            await Deno.lstat(dest);
          } catch {
            exists = false;
          }
          if (exists) {
            if (!g.overwrite) {
              skipped.push(file.dest);
              continue;
            }
            overwritten.push(file.dest);
          }

          const template = await Deno.readTextFile(
            context.extensionFile(`templates/${file.template}`),
          );
          const slash = dest.lastIndexOf("/");
          await Deno.mkdir(dest.substring(0, slash), { recursive: true });
          await Deno.writeTextFile(dest, render(template, vars));
          if (!overwritten.includes(file.dest)) written.push(file.dest);
        }

        context.logger.info(
          "Wrote {written}, overwrote {overwritten}, skipped {skipped}",
          {
            written: written.length,
            overwritten: overwritten.length,
            skipped: skipped.length,
          },
        );

        const handle = await context.writeResource("state", "current", {
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
          filesWritten: written,
          filesSkipped: skipped,
          filesOverwritten: overwritten,
          status: "files_written",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },

    bootstrap: {
      description: "Resolve the module and verify the project builds",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
        const g = context.globalArgs;
        const projectPath = projectPathFor(g);

        await runCommand("go", ["mod", "tidy"], { cwd: projectPath });
        await runCommand("go", ["build", "./..."], { cwd: projectPath });

        context.logger.info("Project builds at {path}", { path: projectPath });
        const handle = await context.writeResource("state", "current", {
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
          filesWritten: [],
          filesSkipped: [],
          filesOverwritten: [],
          status: "bootstrapped",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
