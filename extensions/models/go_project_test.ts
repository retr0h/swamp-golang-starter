/**
 * Unit tests for the Go project scaffolder.
 *
 * The cases here are not a sweep for coverage. Each one pins a property that
 * was broken at some point in this extension's short history, or that would
 * cost a user real work if it broke:
 *
 *   - `render` must leave just, goreleaser and GitHub Actions syntax alone.
 *     An earlier version used `{{ }}`, which just also uses, with the same
 *     spacing.
 *   - `planFor` must mark hand-written files unmanaged. An earlier version
 *     marked none, and a retemplate run deleted 950 lines of a real
 *     repository's README, CONTRIBUTING and AGENTS.
 *   - Badges must be gated. A release badge on a project with no releaser
 *     renders as a broken image forever.
 *
 * @module
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  badgesFor,
  expandHome,
  type GlobalArgs,
  GlobalArgsSchema,
  modulePathFor,
  planFor,
  render,
  varsFor,
} from "./go_project.ts";

/** Arguments with every default applied, overridden as a case needs. */
function args(overrides: Partial<GlobalArgs> = {}): GlobalArgs {
  return GlobalArgsSchema.parse({ projectName: "widget", ...overrides });
}

// --- render ---

Deno.test("render substitutes a known placeholder", () => {
  assertEquals(render("module @@modulePath@@", { modulePath: "x/y" }), "module x/y");
});

Deno.test("render tolerates whitespace inside the delimiters", () => {
  assertEquals(render("@@ name @@", { name: "v" }), "v");
});

Deno.test("render throws on an unknown variable rather than emitting a hole", () => {
  assertThrows(
    () => render("@@nope@@", {}),
    Error,
    "Template referenced unknown variable: nope",
  );
});

Deno.test("render leaves just's own variable syntax alone", () => {
  // just uses {{ name }} — the exact shape an earlier version of this
  // scaffolder used, which is why the delimiter is @@ now.
  const justfile = 'target := "@@coverageTarget@@"\n  echo "{{ target }}"';
  assertEquals(
    render(justfile, { coverageTarget: "100%" }),
    'target := "100%"\n  echo "{{ target }}"',
  );
});

Deno.test("render leaves goreleaser and GitHub Actions syntax alone", () => {
  const input = "ldflags: -X main.v={{.Version}}\ntoken: ${{ secrets.TOKEN }}";
  assertEquals(render(input, {}), input);
});

// --- planFor: the managed/seeded split ---

Deno.test("planFor marks every hand-written file unmanaged", () => {
  // These grow into hundreds of lines no template can reproduce. A retemplate
  // run that overwrites one destroys work.
  const seeded = ["README.md", "go.mod", "LICENSE", "main.go"];
  const plan = planFor(args({ kind: "cli" }));
  for (const dest of seeded) {
    const entry = plan.find((e) => e.dest === dest);
    assert(entry, `${dest} missing from the plan`);
    assertEquals(entry.managed, false, `${dest} must not be managed`);
  }
});

Deno.test("planFor marks generated files managed", () => {
  const managed = [
    ".github/workflows/go.yml",
    ".gitignore",
    ".golangci.yml",
    "justfile",
    "CONTRIBUTING.md",
  ];
  const plan = planFor(args());
  for (const dest of managed) {
    const entry = plan.find((e) => e.dest === dest);
    assert(entry, `${dest} missing from the plan`);
    assertEquals(entry.managed, true, `${dest} must be managed`);
  }
});

Deno.test("planFor gives a library a package and no main", () => {
  const plan = planFor(args({ kind: "lib" }));
  assert(plan.some((e) => e.dest === "pkg/widget/widget.go"));
  assert(!plan.some((e) => e.dest === "main.go"));
  assert(!plan.some((e) => e.dest === ".goreleaser.yaml"));
});

Deno.test("planFor gives a command a main and a releaser", () => {
  const plan = planFor(args({ kind: "cli" }));
  assert(plan.some((e) => e.dest === "main.go"));
  assert(plan.some((e) => e.dest === ".goreleaser.yaml"));
  assert(plan.some((e) => e.dest === ".github/workflows/release.yml"));
});

Deno.test("planFor honours every gate", () => {
  const off = planFor(args({
    kind: "cli",
    withCI: false,
    withReleaser: false,
    withCodecov: false,
    withDependabot: false,
    withLabeler: false,
    withAgentDocs: false,
    withCodeOfConduct: false,
    withReposJson: false,
  }));
  const dests = off.map((e) => e.dest);
  for (const gated of [
    ".github/workflows/go.yml",
    ".goreleaser.yaml",
    ".github/codecov.yml",
    ".github/dependabot.yml",
    ".github/labeler.yml",
    "AGENTS.md",
    "CODE_OF_CONDUCT.md",
    ".github/repos.json",
  ]) {
    assert(!dests.includes(gated), `${gated} survived its gate`);
  }
  // The floor is still a project.
  assert(dests.includes("go.mod"));
  assert(dests.includes("justfile"));
});

Deno.test("planFor never emits a duplicate destination", () => {
  const dests = planFor(args({ kind: "cli" })).map((e) => e.dest);
  assertEquals(dests.length, new Set(dests).size);
});

// --- badges ---

Deno.test("badgesFor omits a release badge when nothing releases", () => {
  const lib = badgesFor(args({ kind: "lib" }), "github.com/retr0h/widget");
  assert(!lib.includes("img.shields.io/github/release"));
  assert(!lib.includes("goreleaser"));
});

Deno.test("badgesFor includes release badges for a released command", () => {
  const cli = badgesFor(
    args({ kind: "cli", withReleaser: true }),
    "github.com/retr0h/widget",
  );
  assert(cli.includes("img.shields.io/github/release"));
  assert(cli.includes("goreleaser"));
});

Deno.test("badgesFor omits the codecov badge when coverage is not uploaded", () => {
  const none = badgesFor(args({ withCodecov: false }), "github.com/retr0h/widget");
  assert(!none.includes("codecov"));
});

Deno.test("badgesFor renders nothing when badges are off", () => {
  assertEquals(badgesFor(args({ withBadges: false }), "x/y"), "");
});

Deno.test("badgesFor points the go reference at pkgPath when set", () => {
  const withPkg = badgesFor(
    args({ pkgPath: "pkg/widget" }),
    "github.com/retr0h/widget",
  );
  assert(withPkg.includes("pkg.go.dev/github.com/retr0h/widget/pkg/widget"));
});

// --- paths and variables ---

Deno.test("modulePathFor composes host, owner and name", () => {
  assertEquals(
    modulePathFor(args({ moduleHost: "git.example.com", owner: "acme" })),
    "git.example.com/acme/widget",
  );
});

Deno.test("expandHome resolves a leading tilde", () => {
  const home = Deno.env.get("HOME");
  assert(home, "HOME must be set for this test");
  assertEquals(expandHome("~/git"), `${home}/git`);
  assertEquals(expandHome("/abs/path"), "/abs/path");
});

Deno.test("varsFor turns a hyphenated name into a legal package name", () => {
  // Go package names cannot contain hyphens.
  assertEquals(varsFor(args({ projectName: "my-widget" })).packageName, "mywidget");
});

Deno.test("varsFor picks the install line from the project shape", () => {
  assert(varsFor(args({ kind: "cli" })).installLine.startsWith("go install"));
  assert(varsFor(args({ kind: "lib" })).installLine.startsWith("go get"));
});

Deno.test("varsFor keeps the three Go versions distinct", () => {
  // go.mod carries a language floor; mise and CI track the latest toolchain.
  const v = varsFor(args());
  assertEquals(v.goVersion, "1.26");
  assertEquals(v.goVersionMise, "latest");
  assertEquals(v.goVersionCI, "stable");
});

Deno.test("varsFor excludes cmd and main from a library's coverage ignores", () => {
  assert(!varsFor(args({ kind: "lib" })).coverPaths.includes("/cmd/"));
  assert(varsFor(args({ kind: "cli" })).coverPaths.includes("/cmd/"));
});

Deno.test("varsFor falls back to owner when no author is given", () => {
  assertEquals(varsFor(args({ owner: "acme", author: "" })).author, "acme");
});

// --- schema ---

Deno.test("the schema rejects a project name Go cannot use", () => {
  assertThrows(() => GlobalArgsSchema.parse({ projectName: "My Widget" }));
  assertThrows(() => GlobalArgsSchema.parse({ projectName: "UPPER" }));
});

Deno.test("every template the plan names is listed once", () => {
  // A template in the plan but absent from additionalFiles fails only at run
  // time, on someone else's machine.
  const manifest = Deno.readTextFileSync(
    new URL("../../manifest.yaml", import.meta.url),
  );
  const both = [...planFor(args({ kind: "cli" })), ...planFor(args({ kind: "lib" }))];
  for (const entry of both) {
    assert(
      manifest.includes(`templates/${entry.template}`),
      `templates/${entry.template} is not in additionalFiles`,
    );
  }
});

// --- coupling between the workflows and everything they invoke ---


Deno.test("a workflow never ships without the config it reads", () => {
  const noLabeler = planFor(args({ withLabeler: false })).map((e) => e.dest);
  assert(!noLabeler.includes(".github/workflows/labeler.yml"));
  assert(!noLabeler.includes(".github/labeler.yml"));

  const withLabeler = planFor(args({ withLabeler: true })).map((e) => e.dest);
  assert(withLabeler.includes(".github/workflows/labeler.yml"));
  assert(withLabeler.includes(".github/labeler.yml"));

  // release.yml reads .goreleaser.yaml
  const noRel = planFor(args({ kind: "cli", withReleaser: false })).map((e) => e.dest);
  assert(!noRel.includes(".github/workflows/release.yml"));
  assert(!noRel.includes(".goreleaser.yaml"));
});

// --- execute(), with a context this file supplies ---
//
// createModelTestContext does not provide extensionFile, which every write
// path needs, so the context is built here. Ctx is a plain interface, so this
// costs nothing and closes the gap the adversarial review recorded: the
// schema-write defect that review found lived in execute, where no test
// reached.

import { type CheckResult, model } from "./go_project.ts";

interface Written {
  specName: string;
  name: string;
  data: Record<string, unknown>;
}

/** A method context backed by a temporary directory. */
function testContext(overrides: Partial<GlobalArgs> = {}) {
  const written: Written[] = [];
  const logs: string[] = [];
  const stored = new Map<string, Record<string, unknown>>();
  const repoRoot = new URL("../../", import.meta.url).pathname;

  const context = {
    globalArgs: args(overrides),
    logger: {
      info: (m: string, p?: Record<string, unknown>) =>
        logs.push(m + JSON.stringify(p ?? {})),
    },
    extensionFile: (relPath: string) => `${repoRoot}${relPath}`,
    readResource: (specName: string, name: string) =>
      Promise.resolve(stored.get(`${specName}/${name}`)),
    writeResource: (
      specName: string,
      name: string,
      data: Record<string, unknown>,
    ) => {
      written.push({ specName, name, data });
      stored.set(`${specName}/${name}`, data);
      return Promise.resolve({ name });
    },
  };
  return { context, written, logs, stored };
}

/** Run a body against a throwaway directory, always cleaning up. */
async function withTempDir(body: (dir: string) => Promise<void>) {
  const dir = await Deno.makeTempDir({ prefix: "golang-starter-test-" });
  try {
    await body(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

Deno.test("write_files renders a library into an empty directory", async () => {
  await withTempDir(async (dir) => {
    const { context, written } = testContext({
      projectName: "widget",
      kind: "lib",
      parentDir: dir,
      email: "maintainer@example.com",
    });
    await model.methods.write_files.execute({}, context);

    const goMod = await Deno.readTextFile(`${dir}/widget/go.mod`);
    assert(goMod.startsWith("module github.com/retr0h/widget\n\ngo 1.26\n"));

    // Every placeholder substituted, in every file.
    for await (const entry of Deno.readDir(`${dir}/widget`)) {
      if (!entry.isFile) continue;
      const body = await Deno.readTextFile(`${dir}/widget/${entry.name}`);
      assert(!body.includes("@@"), `${entry.name} has an unrendered placeholder`);
    }

    const state = written[0].data;
    assertEquals(state.status, "files_written");
    assertEquals((state.filesSkipped as string[]).length, 0);
    assert((state.filesWritten as string[]).includes("pkg/widget/widget.go"));
  });
});

Deno.test("write_files leaves an existing file alone by default", async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(`${dir}/widget`, { recursive: true });
    await Deno.writeTextFile(`${dir}/widget/README.md`, "# mine\n");

    const { context, written } = testContext({
      parentDir: dir,
      email: "maintainer@example.com",
    });
    await model.methods.write_files.execute({}, context);

    assertEquals(await Deno.readTextFile(`${dir}/widget/README.md`), "# mine\n");
    assert((written[0].data.filesSkipped as string[]).includes("README.md"));
  });
});

Deno.test("overwrite rewrites generated files and spares seeded ones", async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(`${dir}/widget/.github/workflows`, { recursive: true });
    await Deno.writeTextFile(`${dir}/widget/README.md`, "# hand written\n");
    await Deno.writeTextFile(`${dir}/widget/.github/workflows/go.yml`, "stale\n");

    const { context, written } = testContext({
      parentDir: dir,
      overwrite: true,
      email: "maintainer@example.com",
    });
    await model.methods.write_files.execute({}, context);

    // Seeded: untouched, however stale.
    assertEquals(
      await Deno.readTextFile(`${dir}/widget/README.md`),
      "# hand written\n",
    );
    // Managed: refreshed.
    const wf = await Deno.readTextFile(`${dir}/widget/.github/workflows/go.yml`);
    assert(wf.includes("name: Go"));

    const state = written[0].data;
    assert((state.filesOverwritten as string[]).includes(
      ".github/workflows/go.yml",
    ));
    assert((state.filesSkipped as string[]).includes("README.md"));
  });
});

Deno.test("write_files refuses a code of conduct with no contact", async () => {
  await withTempDir(async (dir) => {
    const { context, written } = testContext({ parentDir: dir, email: "" });
    let threw = false;
    try {
      await model.methods.write_files.execute({}, context);
    } catch (e) {
      threw = true;
      assert((e as Error).message.includes("withCodeOfConduct needs email"));
    }
    assert(threw, "expected a throw");
    // Nothing written before the throw.
    assertEquals(written.length, 0);
    assertEquals([...Deno.readDirSync(dir)].length, 0);
  });
});

Deno.test("a later method preserves the file lists an earlier one recorded", async () => {
  // Every method writes the whole state resource. Returning [] from one that
  // does not write files erased what write_files had just recorded.
  await withTempDir(async (dir) => {
    const { context, written, stored } = testContext({
      parentDir: dir,
      email: "maintainer@example.com",
    });
    await model.methods.write_files.execute({}, context);
    const count = (written[0].data.filesWritten as string[]).length;
    assert(count > 0);

    await model.methods.create_project.execute({}, context);
    const after = stored.get("state/current")!;
    assertEquals((after.filesWritten as string[]).length, count);
    assertEquals(after.status, "created");
  });
});

Deno.test("every state write matches StateSchema exactly", async () => {
  await withTempDir(async (dir) => {
    const { context, written } = testContext({
      parentDir: dir,
      email: "maintainer@example.com",
    });
    await model.methods.write_files.execute({}, context);
    await model.methods.create_project.execute({}, context);

    const fields = new Set([
      "projectName", "projectPath", "modulePath", "kind", "goVersion",
      "filesWritten", "filesSkipped", "filesOverwritten", "status", "updatedAt",
    ]);
    for (const w of written) {
      assertEquals(
        new Set(Object.keys(w.data)),
        fields,
        "a state write drifted from StateSchema",
      );
    }
  });
});

// --- pre-flight checks ---

Deno.test("the code of conduct check fails before anything is created", async () => {
  const { context } = testContext({ email: "" });
  const result = await model.checks["code-of-conduct-needs-contact"]
    .execute(context);
  assertEquals(result.pass, false);
  assert(result.errors![0].includes("withCodeOfConduct is on but email"));
});

Deno.test("the justfiles check fails with no source", async () => {
  const { context } = testContext({ justfilesRepo: "" });
  const result = await model.checks["justfiles-need-a-source"]
    .execute(context);
  assertEquals(result.pass, false);
});

Deno.test("checks pass on a well-formed configuration", async () => {
  const { context } = testContext({ email: "maintainer@example.com" });
  const checks: Array<keyof typeof model.checks> = [
    "code-of-conduct-needs-contact",
    "justfiles-need-a-source",
  ];
  for (const name of checks) {
    const result: CheckResult = await model.checks[name].execute(context);
    assertEquals(result.pass, true, name);
  }
});

Deno.test("bootstrap refuses a directory with no go.mod", async () => {
  await withTempDir(async (dir) => {
    const { context } = testContext({ parentDir: dir });
    const result = await model.checks["project-must-exist-to-build"]
      .execute(context);
    assertEquals(result.pass, false);
    assert(result.errors![0].includes("No go.mod"));
  });
});

Deno.test("check_prereqs probes go with a flag go actually accepts", async () => {
  // `go --version` exits 2 after printing help; the spelling is `go version`.
  // This test runs the real probe, so it fails if the spelling regresses.
  const { context, written } = testContext({ email: "maintainer@example.com" });
  await model.methods.check_prereqs.execute({}, context);
  assertEquals(written[0].data.status, "prereqs_checked");
});

Deno.test("go.mod pins the tools the justfile runs", async () => {
  // The justfile invokes golangci-lint, gofumpt, golines and
  // gocover-cobertura through `go tool`, which only works when go.mod
  // declares them. A template that calls a global binary produces a project
  // whose lint step fails on any machine that has not installed it.
  await withTempDir(async (dir) => {
    const { context } = testContext({
      parentDir: dir,
      email: "maintainer@example.com",
    });
    await model.methods.write_files.execute({}, context);
    const goMod = await Deno.readTextFile(`${dir}/widget/go.mod`);
    const justfile = await Deno.readTextFile(`${dir}/widget/justfile`);

    for (const tool of [
      "github.com/golangci/golangci-lint/v2/cmd/golangci-lint",
      "mvdan.cc/gofumpt",
      "github.com/segmentio/golines",
      "github.com/boumenot/gocover-cobertura",
      "go.uber.org/mock/mockgen",
    ]) {
      assert(goMod.includes(tool), `go.mod does not pin ${tool}`);
    }
    // Every tool the justfile runs must be pinned.
    for (const m of justfile.matchAll(/go tool ([a-z0-9.]+\/[^\s]+)/g)) {
      assert(
        goMod.includes(m[1]),
        `justfile runs ${m[1]} but go.mod does not pin it`,
      );
    }
  });
});

Deno.test("re-rendering a command as a library is refused", async () => {
  // Without this, retemplate with the wrong kind strips /cmd/ and main.go
  // from .coverignore and rewrites CONTRIBUTING.md to call pkg/ the product,
  // while .goreleaser.yaml and release.yml survive — a project that is half
  // each shape.
  await withTempDir(async (dir) => {
    await Deno.mkdir(`${dir}/widget`, { recursive: true });
    await Deno.writeTextFile(`${dir}/widget/main.go`, "package main\n");

    const { context } = testContext({
      parentDir: dir,
      kind: "lib",
      overwrite: true,
      email: "maintainer@example.com",
    });
    const result = await model.checks["declared-kind-matches-the-project"]
      .execute(context);
    assertEquals(result.pass, false);
    assert(result.errors![0].includes('Pass kind="cli"'));
  });
});

Deno.test("re-rendering a library as a command is refused", async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(`${dir}/widget/pkg/widget`, { recursive: true });

    const { context } = testContext({
      parentDir: dir,
      kind: "cli",
      overwrite: true,
      email: "maintainer@example.com",
    });
    const result = await model.checks["declared-kind-matches-the-project"]
      .execute(context);
    assertEquals(result.pass, false);
    assert(result.errors![0].includes('Pass kind="lib"'));
  });
});

Deno.test("the kind check does not fire on a fresh scaffold", async () => {
  // Nothing on disk to disagree with, and overwrite is off.
  await withTempDir(async (dir) => {
    const { context } = testContext({ parentDir: dir, kind: "lib" });
    assertEquals(
      (await model.checks["declared-kind-matches-the-project"].execute(context))
        .pass,
      true,
    );
  });
});

Deno.test("a correctly declared re-render passes", async () => {
  await withTempDir(async (dir) => {
    await Deno.mkdir(`${dir}/widget`, { recursive: true });
    await Deno.writeTextFile(`${dir}/widget/main.go`, "package main\n");

    const { context } = testContext({
      parentDir: dir,
      kind: "cli",
      overwrite: true,
      email: "maintainer@example.com",
    });
    assertEquals(
      (await model.checks["declared-kind-matches-the-project"].execute(context))
        .pass,
      true,
    );
  });
});

Deno.test("a library scaffold ships a test for its stub", () => {
  // Without one, `just ready` fails the coverage gate on a pristine project:
  // 0% against a 100% target.
  const dests = planFor(args({ kind: "lib" })).map((e) => e.dest);
  assert(dests.includes("pkg/widget/widget.go"));
  assert(dests.includes("pkg/widget/widget_test.go"));
});

Deno.test("a command puts its definitions in cmd/, untested", () => {
  // Every command in this organization keeps main.go and /cmd/ out of
  // coverage and ships no tests for them. A scaffold that seeds tests there
  // teaches the opposite of the convention it is meant to carry.
  const dests = planFor(args({ kind: "cli" })).map((e) => e.dest);
  assert(dests.includes("main.go"));
  assert(dests.includes("cmd/root.go"));
  assert(
    !dests.some((d) => d.startsWith("cmd/") && d.endsWith("_test.go")),
    "cmd/ must ship no tests",
  );
  assert(
    !dests.some((d) => d.startsWith("internal/cli/")),
    "the command layer is cmd/, not internal/cli/",
  );
});


Deno.test("golangci config is v2 format, not v1 keys under a v2 version", () => {
  // `version: 2` with linters-settings/exclude-use-default is rejected by
  // `golangci-lint config verify`, and `run` silently ignores them — so
  // revive's enable-all-rules never took effect.
  const cfg = Deno.readTextFileSync(
    new URL("../../templates/golangci.yml", import.meta.url),
  );
  assert(cfg.includes('version: "2"'), "version must be the string \"2\"");
  assert(!cfg.includes("linters-settings:"), "linters-settings is a v1 key");
  assert(!cfg.includes("exclude-use-default:"), "exclude-use-default is a v1 key");
  assert(cfg.includes("  settings:"), "v2 nests settings under linters");
});


Deno.test("the justfile is the one this organization already runs", () => {
  // Not an invention. It imports the shared modules and delegates, so the
  // coverage gate, the formatters and the linters are osapi-justfiles' rather
  // than a second implementation free to drift from them.
  const justfile = Deno.readTextFileSync(
    new URL("../../templates/justfile.txt", import.meta.url),
  );
  for (const mod of ["go.just", "md.just", "just.just"]) {
    assert(justfile.includes(`.just/remote/${mod}`), `does not import ${mod}`);
  }
  for (const recipe of ["fetch:", "deps:", "test:", "generate:", "ready:"]) {
    assert(justfile.includes(`\n${recipe}`), `missing recipe ${recipe}`);
  }
  // ready delegates; it does not reimplement.
  for (const step of [
    "just generate",
    "just md-fmt",
    "just go-fmt",
    "just go-vet",
    "just just-fmt",
  ]) {
    assert(justfile.includes(step), `ready does not run ${step}`);
  }
});

Deno.test("a command's coverage comes from internal, not cmd", () => {
  // cmd/ and main.go are in .coverignore, so a command whose only code is
  // there has nothing the gate can measure.
  const dests = planFor(args({ kind: "cli" })).map((e) => e.dest);
  assert(dests.includes("cmd/root.go"));
  assert(dests.includes("internal/widget/widget.go"));
  assert(dests.includes("internal/widget/widget_test.go"));
  assert(
    !dests.some((d) => d.startsWith("cmd/") && d.endsWith("_test.go")),
    "cmd/ ships no tests",
  );

  const ignore = varsFor(args({ kind: "cli" })).coverPaths;
  assert(ignore.includes("/cmd/") && ignore.includes("main.go"));
  assert(!ignore.includes("/internal/"), "internal/ must stay measurable");
});

Deno.test("revive's threshold rules are disabled, the rest are on", () => {
  // enable-all-rules turns on rules that measure rather than find:
  // line-length-limit alone was 35 of 50 findings on gohai, duplicating what
  // golines --max-len=80 already enforces in go-fmt.
  const cfg = Deno.readTextFileSync(
    new URL("../../templates/golangci.yml", import.meta.url),
  );
  assert(cfg.includes("enable-all-rules: true"));
  for (const rule of [
    "line-length-limit",
    "add-constant",
    "cyclomatic",
    "cognitive-complexity",
    "function-length",
    "argument-limit",
    "max-public-structs",
  ]) {
    assert(
      new RegExp(`- name: ${rule}\\s+disabled: true`).test(cfg),
      `${rule} must be disabled`,
    );
  }
});
