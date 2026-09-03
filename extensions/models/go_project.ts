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

export const GlobalArgsSchema = z.object({
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
    .default("1.26")
    .describe(
      "Language version written to go.mod. This is a floor — the oldest Go that can compile the module — not the toolchain anyone builds with.",
    ),
  goVersionMise: z
    .string()
    .default("latest")
    .describe(
      "Go version mise provisions. Defaults to latest so it moves with CI rather than pinning developers to the module's floor.",
    ),
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
  email: z
    .string()
    .default("")
    .describe(
      "Contact address for the Code of Conduct's enforcement section. Required when withCodeOfConduct is on: a document that names someone else's address is worse than none.",
    ),
  withCodeOfConduct: z
    .boolean()
    .default(true)
    .describe("CODE_OF_CONDUCT.md. Needs email."),
  pkgPath: z
    .string()
    .default("")
    .describe(
      "Import path under the module that the go reference badge points at, e.g. 'pkg/widget'. Empty means the module root.",
    ),
  withBadges: z
    .boolean()
    .default(true)
    .describe("Render the shields.io badge block at the top of the README"),
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

export type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

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
export interface Ctx {
  globalArgs: GlobalArgs;
  logger: { info: (m: string, p?: Record<string, unknown>) => void };
  extensionFile: (relPath: string) => string;
  readResource: (
    specName: string,
    name: string,
  ) => Promise<Record<string, unknown> | undefined>;
  writeResource: (
    specName: string,
    name: string,
    data: Record<string, unknown>,
  ) => Promise<{ name: string }>;
}

/** The result of a pre-flight check. */
export interface CheckResult {
  pass: boolean;
  errors?: string[];
}

// --- Helpers ---

/**
 * The file lists recorded by a previous `write_files` run.
 *
 * A method that does not write files must not claim it wrote none: every
 * method writes the whole state resource, so returning `[]` from
 * `create_project` or `bootstrap` erases what `write_files` recorded a step
 * earlier. Reading the prior state forward keeps the record true.
 */
async function priorFileLists(
  context: Pick<Ctx, "readResource">,
): Promise<
  {
    filesWritten: string[];
    filesSkipped: string[];
    filesOverwritten: string[];
  }
> {
  const prior = await context.readResource("state", "current");
  return {
    filesWritten: (prior?.filesWritten as string[]) ?? [],
    filesSkipped: (prior?.filesSkipped as string[]) ?? [],
    filesOverwritten: (prior?.filesOverwritten as string[]) ?? [],
  };
}

/** Expand a leading `~` to the user's home directory. */
export function expandHome(dir: string): string {
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
export function modulePathFor(g: GlobalArgs): string {
  return `${g.moduleHost}/${g.owner}/${g.projectName}`;
}

/** Absolute project directory. */
export function projectPathFor(g: GlobalArgs): string {
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
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(
    /@@\s*(\w+)\s*@@/g,
    (_match, key: string) => {
      if (!(key in vars)) {
        throw new Error(`Template referenced unknown variable: ${key}`);
      }
      return vars[key];
    },
  );
}

/**
 * Compose the README badge block.
 *
 * Badges cannot live in the template as plain text: which ones apply depends
 * on the gates. A release badge on a project with no releaser, or a codecov
 * badge on one with no coverage upload, renders as a broken image forever.
 */
export function badgesFor(g: GlobalArgs, modulePath: string): string {
  if (!g.withBadges) return "";
  const repo = `${g.owner}/${g.projectName}`;
  const style = "style=for-the-badge";
  const rows: string[] = [];

  if (g.withReleaser && g.kind === "cli") {
    rows.push(
      `[![release](https://img.shields.io/github/release/${repo}.svg?${style})](https://github.com/${repo}/releases/latest)`,
    );
  }
  if (g.withCodecov) {
    rows.push(
      `[![codecov](https://img.shields.io/codecov/c/github/${repo}?${style})](https://codecov.io/gh/${repo})`,
    );
  }
  rows.push(
    `[![go report card](https://goreportcard.com/badge/${modulePath}?${style})](https://goreportcard.com/report/${modulePath})`,
  );
  rows.push(
    `[![license](https://img.shields.io/badge/license-${g.license}-brightgreen.svg?${style})](LICENSE)`,
  );
  if (g.withCI) {
    rows.push(
      `[![build](https://img.shields.io/github/actions/workflow/status/${repo}/go.yml?${style})](https://github.com/${repo}/actions/workflows/go.yml)`,
    );
  }
  if (g.withReleaser && g.kind === "cli") {
    rows.push(
      `[![powered by](https://img.shields.io/badge/powered%20by-goreleaser-green.svg?${style})](https://github.com/goreleaser)`,
    );
  }
  rows.push(
    `[![conventional commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg?${style})](https://conventionalcommits.org)`,
  );
  rows.push(
    `[![built with just](https://img.shields.io/badge/Built_with-Just-black?${style}&logo=just&logoColor=white)](https://just.systems)`,
  );
  rows.push(
    `![github commit activity](https://img.shields.io/github/commit-activity/m/${repo}?${style})`,
  );
  const ref = g.pkgPath ? `${modulePath}/${g.pkgPath}` : modulePath;
  rows.push(
    `[![go reference](https://img.shields.io/badge/go-reference-00ADD8?${style}&logo=go&logoColor=white)](https://pkg.go.dev/${ref})`,
  );

  return rows.join("\n") + "\n";
}

/** Build the substitution map from the model's arguments. */
export function varsFor(g: GlobalArgs): Record<string, string> {
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
    goVersionMise: g.goVersionMise,
    coverageTarget: g.coverageTarget,
    defaultBranch: g.defaultBranch,
    runsOn: g.runsOn,
    goVersionCI: g.goVersionCI,
    justfilesRepo: g.justfilesRepo,
    year: String(new Date().getFullYear()),
    badges: badgesFor(g, modulePath),
    email: g.email,
    coverPaths: g.kind === "lib"
      ? ["/examples/", "/gen/", "/mocks/"].join("\n")
      : ["/cmd/", "/examples/", "/gen/", "main.go", "/mocks/"].join("\n"),
    labelerSource: g.kind === "lib"
      ? 'source:\n  - changed-files:\n      - any-glob-to-any-file:\n          - "pkg/**"'
      : 'source:\n  - changed-files:\n      - any-glob-to-any-file:\n          - "cmd/**"\n          - "internal/**"\n          - "main.go"',
    projectStructure: g.kind === "lib"
      ? [
        `pkg/${
          g.projectName.replace(/-/g, "")
        }/   the package — this is the product`,
        "examples/            standalone programs a reader can run",
        ".github/workflows/   CI",
      ].join("\n")
      : [
        "main.go              entry point",
        "cmd/                 command definitions",
        "internal/            implementation, not importable",
        ".github/workflows/   CI",
      ].join("\n"),
    repoUrl: `https://github.com/${g.owner}/${g.projectName}`,
    pkgPath: g.pkgPath,
    goReference: g.pkgPath ? `${modulePath}/${g.pkgPath}` : modulePath,
    installLine: g.kind === "cli"
      ? `go install ${modulePath}@latest`
      : `go get ${modulePath}`,
  };
}

/** One template and where it lands. */
export interface PlanEntry {
  template: string;
  dest: string;
  /**
   * Whether the scaffolder keeps ownership of the file after seeding it.
   *
   * `true` — generated. Nobody edits it by hand, so re-rendering is safe and
   * is the whole point of the retemplate flow.
   *
   * `false` — seeded once, then the project's. A README, a CONTRIBUTING, an
   * AGENTS.md and the Go sources grow to hundreds of lines of writing that no
   * template can reproduce. Overwriting one destroys work, so `overwrite`
   * never touches it.
   */
  managed: boolean;
}

/**
 * The template-to-destination plan for one project.
 *
 * Every gate is applied here rather than at write time, so the plan is the
 * single statement of what a given set of arguments produces.
 */
export function planFor(g: GlobalArgs): PlanEntry[] {
  const pkg = g.projectName.replace(/-/g, "");
  const files: PlanEntry[] = [
    { template: "go.mod.txt", dest: "go.mod", managed: false },
    { template: "README.md", dest: "README.md", managed: false },
    { template: "CONTRIBUTING.md", dest: "CONTRIBUTING.md", managed: true },
    { template: "AI_POLICY.md", dest: "AI_POLICY.md", managed: true },
    { template: "LICENSE.txt", dest: "LICENSE", managed: false },
    { template: "gitignore.txt", dest: ".gitignore", managed: true },
    { template: "coverignore.txt", dest: ".coverignore", managed: true },
    { template: "mise.toml.txt", dest: ".mise.toml", managed: true },
    { template: "golangci.yml", dest: ".golangci.yml", managed: true },
    {
      template: g.sharedJustfiles ? "justfile-shared.txt" : "justfile.txt",
      dest: "justfile",
      managed: true,
    },
  ];

  if (g.withCodeOfConduct) {
    files.push({
      template: "CODE_OF_CONDUCT.md",
      dest: "CODE_OF_CONDUCT.md",
      managed: true,
    });
  }

  if (g.withAgentDocs) {
    files.push({ template: "AGENTS.md", dest: "AGENTS.md", managed: true });
    files.push({ template: "CLAUDE.md", dest: "CLAUDE.md", managed: true });
  }

  if (g.kind === "lib") {
    files.push({
      template: "lib.go.txt",
      dest: `pkg/${pkg}/${pkg}.go`,
      managed: false,
    });
    files.push({
      template: "lib_test.go.txt",
      dest: `pkg/${pkg}/${pkg}_test.go`,
      managed: false,
    });
  } else {
    files.push({ template: "main.go.txt", dest: "main.go", managed: false });
    files.push({
      template: "cmd_root.go.txt",
      dest: "cmd/root.go",
      managed: false,
    });
    if (g.withReleaser) {
      files.push({
        template: "goreleaser.yaml",
        dest: ".goreleaser.yaml",
        managed: true,
      });
    }
  }

  if (g.withCodecov) {
    files.push({
      template: ".github/codecov.yml",
      dest: ".github/codecov.yml",
      managed: true,
    });
  }
  if (g.withDependabot) {
    files.push({
      template: ".github/dependabot.yml",
      dest: ".github/dependabot.yml",
      managed: true,
    });
  }
  if (g.withLabeler) {
    files.push({
      template: ".github/labeler.yml",
      dest: ".github/labeler.yml",
      managed: true,
    });
  }
  if (g.withReposJson) {
    files.push({
      template: ".github/repos.json",
      dest: ".github/repos.json",
      managed: true,
    });
  }

  if (g.withCI) {
    // A workflow that reads a config file its gate excluded fails on the
    // first push, so each one ships only when what it needs ships with it.
    const workflows = [
      "go",
      "commit-lint",
      "dep-review",
      "greetings",
      "just-lint",
      "markdown-lint",
      "report-card",
      "stale",
    ];
    if (g.withLabeler) workflows.push("labeler"); // reads .github/labeler.yml
    if (g.kind === "cli" && g.withReleaser) workflows.push("release");
    for (const w of workflows) {
      files.push({
        template: `.github/workflows/${w}.yml`,
        dest: `.github/workflows/${w}.yml`,
        managed: true,
      });
    }
    files.push({
      template: ".github/delete-merged-branch-config.yml",
      dest: ".github/delete-merged-branch-config.yml",
      managed: true,
    });
  }

  return files;
}

// --- Model ---

/** Model definition for scaffolding a Go project. */
export const model = {
  type: "@retr0h/go-project",
  version: "2026.09.03.5",
  globalArguments: GlobalArgsSchema,
  resources: {
    "state": {
      description: "Scaffolding progress for one Go project",
      schema: StateSchema,
      lifetime: "infinite",
      garbageCollection: 10,
    },
  },
  checks: {
    "code-of-conduct-needs-contact": {
      description:
        "A code of conduct names an enforcement contact, or is not written",
      labels: ["policy"],
      execute: (context: { globalArgs: GlobalArgs }): Promise<CheckResult> => {
        const g = context.globalArgs;
        if (g.withCodeOfConduct && !g.email) {
          return Promise.resolve({
            pass: false,
            errors: [
              "withCodeOfConduct is on but email is empty. The enforcement " +
              "section names an address, and one naming the template author " +
              "is worse than no code of conduct at all. Set email, or set " +
              "withCodeOfConduct to false.",
            ],
          });
        }
        return Promise.resolve({ pass: true });
      },
    },
    "shared-justfiles-needs-a-source": {
      description: "Fetching shared recipes requires somewhere to fetch from",
      labels: ["policy"],
      execute: (context: { globalArgs: GlobalArgs }): Promise<CheckResult> => {
        const g = context.globalArgs;
        if (g.sharedJustfiles && !g.justfilesRepo) {
          return Promise.resolve({
            pass: false,
            errors: [
              "sharedJustfiles is on but justfilesRepo is empty. The " +
              "generated justfile would fetch from nowhere and CI would fail " +
              "on the first push.",
            ],
          });
        }
        return Promise.resolve({ pass: true });
      },
    },
    "parent-directory-must-exist": {
      description: "The parent directory is where the project is created",
      labels: ["live"],
      appliesTo: ["create_project"],
      execute: async (
        context: { globalArgs: GlobalArgs },
      ): Promise<CheckResult> => {
        const parent = expandHome(context.globalArgs.parentDir);
        try {
          const info = await Deno.stat(parent);
          if (!info.isDirectory) {
            return {
              pass: false,
              errors: [`parentDir is not a directory: ${parent}`],
            };
          }
        } catch {
          return {
            pass: false,
            errors: [
              `parentDir does not exist: ${parent}. Create it, or point ` +
              "parentDir somewhere that does.",
            ],
          };
        }
        return { pass: true };
      },
    },
    "project-must-exist-to-build": {
      description: "bootstrap resolves modules in a project that was created",
      labels: ["live"],
      appliesTo: ["bootstrap"],
      execute: async (
        context: { globalArgs: GlobalArgs },
      ): Promise<CheckResult> => {
        const goMod = `${projectPathFor(context.globalArgs)}/go.mod`;
        try {
          await Deno.stat(goMod);
        } catch {
          return {
            pass: false,
            errors: [
              `No go.mod at ${goMod}. Run create_project and write_files ` +
              "first, or use one of the create-go workflows, which chain them.",
            ],
          };
        }
        return { pass: true };
      },
    },
    "declared-kind-matches-the-project": {
      description: "The declared shape matches the project already on disk",
      labels: ["live"],
      appliesTo: ["write_files"],
      execute: async (context: { globalArgs: GlobalArgs }): Promise<
        CheckResult
      > => {
        const g = context.globalArgs;
        // Only meaningful when re-rendering something that exists. A fresh
        // scaffold has nothing to disagree with.
        if (!g.overwrite) return { pass: true };

        const root = projectPathFor(g);
        const exists = async (rel: string) => {
          try {
            await Deno.stat(`${root}/${rel}`);
            return true;
          } catch {
            return false;
          }
        };

        const looksLikeCli = await exists("main.go") || await exists("cmd");
        const looksLikeLib = await exists("pkg");

        if (looksLikeCli && g.kind === "lib") {
          return {
            pass: false,
            errors: [
              `${root} has main.go or cmd/, so it is a command, but kind is ` +
              `"lib". Re-rendering would strip /cmd/ and main.go from ` +
              ".coverignore and describe pkg/ as the product in " +
              "CONTRIBUTING.md, leaving the project a hybrid of both shapes. " +
              'Pass kind="cli".',
            ],
          };
        }
        if (looksLikeLib && !looksLikeCli && g.kind === "cli") {
          return {
            pass: false,
            errors: [
              `${root} has pkg/ and no main.go, so it is a library, but kind ` +
              'is "cli". Re-rendering would add a command layout over it. ' +
              'Pass kind="lib".',
            ],
          };
        }
        return { pass: true };
      },
    },
  },
  methods: {
    check_prereqs: {
      description: "Verify go, git and just are installed",
      arguments: z.object({}),
      execute: async (_args: Record<string, never>, context: Ctx) => {
        const g = context.globalArgs;
        context.logger.info("Checking prerequisites for {project}", {
          project: g.projectName,
        });
        // `go --version` is not valid — Go spells it `go version`, and the
        // invalid form exits 2 after printing help. git and just take the flag.
        const probes: Array<[string, string[]]> = [
          ["go", ["version"]],
          ["git", ["--version"]],
          ["just", ["--version"]],
        ];
        for (const [tool, probeArgs] of probes) {
          try {
            await runCommand(tool, probeArgs);
          } catch (cause) {
            throw new Error(
              `${tool} is required and was not usable. Install it, or if it ` +
                `is managed by mise, run the workflow through \`mise exec --\` ` +
                `so it is on PATH.\n${(cause as Error).message}`,
            );
          }
        }
        const projectPath = projectPathFor(g);
        context.logger.info("Prerequisites present; target is {path}", {
          path: projectPath,
        });
        const handle = await context.writeResource("state", "current", {
          ...(await priorFileLists(context)),
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
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
        context.logger.info("Creating {path}", { path: projectPath });
        await Deno.mkdir(projectPath, { recursive: true });

        // `git init` on an existing repository is a no-op, so re-running is safe.
        await runCommand("git", ["init", "-b", "main"], { cwd: projectPath });

        context.logger.info("Initialised {path}", { path: projectPath });
        const handle = await context.writeResource("state", "current", {
          ...(await priorFileLists(context)),
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
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
        if (g.withCodeOfConduct && !g.email) {
          throw new Error(
            "withCodeOfConduct needs email: the enforcement section names an " +
              "address, and shipping one that names the template author's is " +
              "worse than shipping no code of conduct at all. Set email, or " +
              "set withCodeOfConduct to false.",
          );
        }
        const vars = varsFor(g);
        context.logger.info("Rendering templates into {path}", {
          path: projectPath,
        });
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
            // `overwrite` reaches generated files only. A seeded file is the
            // project's own writing by now, and no template can reproduce it.
            if (!g.overwrite || !file.managed) {
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
        context.logger.info("Resolving modules in {path}", {
          path: projectPath,
        });

        await runCommand("go", ["mod", "tidy"], { cwd: projectPath });
        await runCommand("go", ["build", "./..."], { cwd: projectPath });

        context.logger.info("Project builds at {path}", { path: projectPath });
        const handle = await context.writeResource("state", "current", {
          ...(await priorFileLists(context)),
          projectName: g.projectName,
          projectPath,
          modulePath: modulePathFor(g),
          kind: g.kind,
          goVersion: g.goVersion,
          status: "bootstrapped",
          updatedAt: new Date().toISOString(),
        });
        return { dataHandles: [handle] };
      },
    },
  },
};
