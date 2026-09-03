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

Deno.test("planFor picks the justfile variant from sharedJustfiles", () => {
  const standalone = planFor(args({ sharedJustfiles: false }))
    .find((e) => e.dest === "justfile");
  const shared = planFor(args({ sharedJustfiles: true }))
    .find((e) => e.dest === "justfile");
  assertEquals(standalone?.template, "justfile.txt");
  assertEquals(shared?.template, "justfile-shared.txt");
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
