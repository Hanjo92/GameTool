import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Artifact } from "../packages/core/application.js";
import {
  comparisonSamples,
  deepPatch,
  normalizeVariants,
  recipeDiff,
} from "../packages/core/studio-workflows.js";
import { LocalIntegration } from "../apps/local-service/integration.js";
import { timingStats } from "../apps/local-service/profiling.js";

test("variant patch merges objects, replaces arrays, clones inputs and rejects prototype pollution", () => {
  const base = { x: { a: 1, b: 2 }, nodes: [{ id: "old" }] };
  const patch = { x: { a: 3 }, nodes: [{ id: "new" }] };
  const result = deepPatch(base, patch);
  assert.deepEqual(result, { x: { a: 3, b: 2 }, nodes: [{ id: "new" }] });
  result.nodes[0].id = "changed";
  assert.equal(base.nodes[0].id, "old");
  assert.equal(patch.nodes[0].id, "new");
  for (const key of ["__proto__", "constructor", "prototype"])
    assert.throws(
      () => deepPatch(base, JSON.parse(`{"nested":{"${key}":{}}}`)),
      /Unsafe property/,
    );
  assert.throws(() => deepPatch(base, { x: Infinity }));
  assert.throws(() => deepPatch(base, { x: new Date() }));
});
test("batch normalizes all recipes before returning, without callbacks that persist partial results", () => {
  const writes: unknown[] = [];
  assert.throws(() => {
    const variants = normalizeVariants(
      { n: 1 },
      [
        { name: "good", patch: { n: 2 } },
        { name: "bad", patch: { n: -1 } },
      ],
      (value) => {
        const r = value as { n: number };
        if (r.n < 0) throw Error("invalid");
        return r;
      },
    );
    writes.push(...variants);
  }, /invalid/);
  assert.equal(writes.length, 0);
  assert.throws(() =>
    normalizeVariants(
      {},
      [
        { name: "same", patch: {} },
        { name: " same ", patch: {} },
      ],
      (v) => v,
    ),
  );
});
test("diff uses escaped stable pointers and atomic arrays; sampling preserves requested order", () => {
  assert.deepEqual(
    recipeDiff(
      { "a/b": 1, list: [1], gone: true },
      { "a/b": 2, list: [2], added: false },
    ),
    [
      { path: "/a~1b", kind: "change", before: 1, after: 2 },
      { path: "/added", kind: "add", after: false },
      { path: "/gone", kind: "remove", before: true },
      { path: "/list", kind: "change", before: [1], after: [2] },
    ],
  );
  assert.deepEqual(
    comparisonSamples([{ name: "a", recipe: 3 }], [1, 0], (r, t) => r + t)[0]
      .samples,
    [
      { time: 1, state: 4 },
      { time: 0, state: 3 },
    ],
  );
  assert.throws(() =>
    comparisonSamples([{ name: "a", recipe: 3 }], [NaN], () => 1),
  );
  assert.deepEqual(timingStats([1, 2, 3, 4]), {
    mean: 2.5,
    p50: 2,
    p95: 4,
    max: 4,
  });
});
async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "gametool-integration-"));
  const root = join(temp, "host"),
    directory = join(temp, "artifact");
  await mkdir(root);
  await mkdir(directory);
  const artifact: Artifact = {
    id: randomUUID(),
    projectId: randomUUID(),
    revision: 1,
    target: "three",
    directory,
    files: ["src/effect.ts", "assets/image.png", "package.json"],
    validation: {},
  };
  const update = async (code: string) => {
    const sources = {
      "src/effect.ts": code,
      "assets/image.png": "image",
      "package.json": '{"name":"effect"}',
    };
    for (const [file, data] of Object.entries(sources)) {
      await mkdir(join(directory, file, ".."), { recursive: true });
      await writeFile(join(directory, file), data);
    }
    await writeFile(
      join(directory, "manifest.json"),
      JSON.stringify({
        ...artifact,
        hashes: Object.fromEntries(
          Object.entries(sources).map(([f, d]) => [
            f,
            createHash("sha256").update(d).digest("hex"),
          ]),
        ),
      }),
    );
  };
  await update("generated1");
  const service = new LocalIntegration([root]);
  const rootId = (await service.roots())[0].id;
  const dest = join(root, "gametool-effects", "effect", "three");
  return { temp, root, directory, artifact, update, service, rootId, dest };
}
test("integration plans and applies all source/assets in isolated subtree preserving host files and regeneration additions", async () => {
  const f = await fixture();
  try {
    await writeFile(join(f.root, "package.json"), "host package");
    const p = await f.service.plan(f.artifact, f.rootId, "effect");
    assert.ok(p.files.some((f) => f.path.endsWith("assets/image.png")));
    await assert.rejects(readFile(join(f.dest, "src/effect.ts")));
    await f.service.apply(p.planId, p.expectedHash);
    assert.equal(
      await readFile(join(f.root, "package.json"), "utf8"),
      "host package",
    );
    await writeFile(join(f.dest, "host-notes.txt"), "keep");
    await f.update("generated2");
    const p2 = await f.service.plan(f.artifact, f.rootId, "effect");
    await f.service.apply(p2.planId, p2.expectedHash);
    assert.equal(
      await readFile(join(f.dest, "src/effect.ts"), "utf8"),
      "generated2",
    );
    assert.equal(
      await readFile(join(f.dest, "host-notes.txt"), "utf8"),
      "keep",
    );
    await assert.rejects(
      f.service.apply(p2.planId, p2.expectedHash),
      /Unknown/,
    );
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
});
test("integration refuses hand edits, stale plans, unowned collisions and artifact tampering", async () => {
  const f = await fixture();
  try {
    const p = await f.service.plan(f.artifact, f.rootId, "effect");
    await assert.rejects(f.service.apply(p.planId, "wrong"), /mismatched/);
    await f.service.apply(p.planId, p.expectedHash);
    const stale = await f.service.plan(f.artifact, f.rootId, "effect");
    await writeFile(join(f.dest, "notes.txt"), "concurrent");
    await assert.rejects(
      f.service.apply(stale.planId, stale.expectedHash),
      /changed since planning/,
    );
    await writeFile(join(f.dest, "src/effect.ts"), "hand edit");
    await assert.rejects(
      f.service.plan(f.artifact, f.rootId, "effect"),
      /edited or removed/,
    );
    const other = join(f.root, "gametool-effects", "other", "three", "src");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "effect.ts"), "user");
    await assert.rejects(
      f.service.plan(f.artifact, f.rootId, "other"),
      /Unowned/,
    );
    const fresh = await f.service.plan(f.artifact, f.rootId, "fresh");
    await writeFile(join(f.directory, "src/effect.ts"), "tamper");
    await assert.rejects(
      f.service.apply(fresh.planId, fresh.expectedHash),
      /Artifact changed/,
    );
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
});
test("integration denies unconfigured roots, traversal, symlinks and roots swapped after planning", async () => {
  const f = await fixture();
  try {
    await assert.rejects(
      f.service.plan(f.artifact, "unknown", "effect"),
      /configured/,
    );
    for (const id of ["../escape", "a/b", "", "/tmp", ".."])
      await assert.rejects(f.service.plan(f.artifact, f.rootId, id));
    const outside = join(f.temp, "outside");
    await mkdir(outside);
    await symlink(outside, join(f.root, "gametool-effects"));
    await assert.rejects(
      f.service.plan(f.artifact, f.rootId, "effect"),
      /symlinks/,
    );
    await rm(join(f.root, "gametool-effects"));
    const p = await f.service.plan(f.artifact, f.rootId, "effect");
    await rename(f.root, f.root + "-original");
    await symlink(outside, f.root);
    await assert.rejects(f.service.apply(p.planId, p.expectedHash), /symlinks/);
    await assert.rejects(
      readFile(join(outside, "gametool-effects/effect/three/src/effect.ts")),
    );
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
});

test("integration rejects regular-directory replacement and hardlinked generated files", async () => {
  const f = await fixture();
  try {
    const p = await f.service.plan(f.artifact, f.rootId, "effect");
    await rename(f.root, f.root + "-original");
    await mkdir(f.root);
    await assert.rejects(
      f.service.apply(p.planId, p.expectedHash),
      /root directory was replaced/,
    );
    await rm(f.root, { recursive: true });
    await rename(f.root + "-original", f.root);
    const p2 = await f.service.plan(f.artifact, f.rootId, "effect");
    await f.service.apply(p2.planId, p2.expectedHash);
    const { link } = await import("node:fs/promises");
    await link(join(f.dest, "src/effect.ts"), join(f.temp, "hardlink"));
    await assert.rejects(
      f.service.plan(f.artifact, f.rootId, "effect"),
      /unlinked files/,
    );
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
});
test("integration rejects escaping artifact paths and symlinked source trees", async () => {
  const f = await fixture();
  try {
    const manifest = JSON.parse(
      await readFile(join(f.directory, "manifest.json"), "utf8"),
    );
    const malicious = { ...f.artifact, files: ["../outside.txt"] };
    await writeFile(
      join(f.directory, "manifest.json"),
      JSON.stringify({ ...manifest, files: malicious.files }),
    );
    await assert.rejects(
      f.service.plan(malicious, f.rootId, "effect"),
      /Unsafe relative/,
    );
    await writeFile(
      join(f.directory, "manifest.json"),
      JSON.stringify(manifest),
    );
    await rename(join(f.directory, "src"), join(f.temp, "src-outside"));
    await symlink(join(f.temp, "src-outside"), join(f.directory, "src"));
    await assert.rejects(
      f.service.plan(f.artifact, f.rootId, "effect"),
      /symlinks/,
    );
  } finally {
    await rm(f.temp, { recursive: true, force: true });
  }
});

test("application validates every batch recipe and asset before atomic persistence, with revision checks", async () => {
  const { Application } = await import("../packages/core/application.js");
  const { FileRepository } = await import(
    "../apps/local-service/repository.js"
  );
  const { defaultRecipe } = await import("../packages/core/model.js");
  const { defaultImage } = await import("../runtimes/shared/motion.js");
  const temp = await mkdtemp(join(tmpdir(), "gametool-batch-"));
  try {
    const repo = new FileRepository(temp);
    await repo.init();
    const project = {
      id: randomUUID(),
      name: "base",
      recipe: structuredClone(defaultRecipe),
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
    await repo.save(project);
    const unexpected = async (): Promise<never> => {
      throw Error("Production must not run");
    };
    const app = new Application(
      repo,
      { create: unexpected, preview: unexpected, validate: unexpected },
      randomUUID,
      async () => ({}),
      {
        list: async () => [],
        import: unexpected,
        get: async () => {
          throw Error("Missing asset");
        },
      },
    );
    const ref = { projectId: project.id, expectedRevision: 1, save: true };
    await assert.rejects(
      app.execute("studio_variants", {
        ...ref,
        variants: [
          { name: "ok", patch: { color: "#ff0000" } },
          { name: "bad", patch: { width: -1 } },
        ],
      }),
    );
    assert.equal((await repo.projects()).length, 1);
    await assert.rejects(
      app.execute("studio_variants", {
        ...ref,
        variants: [
          { name: "ok", patch: { color: "#ff0000" } },
          {
            name: "missing",
            patch: {
              image: { ...defaultImage, enabled: true, assetId: randomUUID() },
            },
          },
        ],
      }),
      /Missing asset/,
    );
    assert.equal((await repo.projects()).length, 1);
    await assert.rejects(
      app.execute("studio_variants", {
        ...ref,
        expectedRevision: 2,
        variants: [{ name: "ok", patch: {} }],
      }),
    );
    const result = await app.execute("studio_variants", {
      ...ref,
      variants: [
        { name: "red", patch: { color: "#ff0000" } },
        { name: "blue", patch: { color: "#0000ff" } },
      ],
    });
    assert.equal(result.saved, true);
    assert.equal((await repo.projects()).length, 3);
    for (const p of result.projects)
      assert.equal((await repo.project(p.id)).name, p.name);
    assert.deepEqual((await repo.project(project.id)).recipe, project.recipe);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("profiler rejects remote URLs and unbounded frame counts before launching a browser", async () => {
  const { measurePreview } = await import("../apps/local-service/profiling.js");
  const { defaultRecipe } = await import("../packages/core/model.js");
  await assert.rejects(
    measurePreview({
      url: "https://example.com",
      recipe: defaultRecipe,
      frames: 30,
    }),
    /local preview URL/,
  );
  await assert.rejects(
    measurePreview({
      url: "http://127.0.0.1:4317",
      recipe: defaultRecipe,
      frames: 10000,
    }),
    /30 to 600/,
  );
  assert.throws(() => timingStats([NaN]));
});
