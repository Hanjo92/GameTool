import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  recipeSchema,
  defaultRecipe,
  type Project,
} from "../packages/core/model.js";
import { Application, type Production } from "../packages/core/application.js";
import { FileRepository } from "../apps/local-service/repository.js";
import {
  createStudioNode,
  defaultStudio,
} from "../runtimes/shared/studio-types.js";
import { defaultParticles, defaultTypography } from "../runtimes/shared/motion.js";
function composition() {
  const group = createStudioNode("group", "group"),
    hp = createStudioNode("ui", "health", "health-bar");
  hp.parentId = group.id;
  hp.tracks = [
    {
      property: "x",
      keys: [
        { time: 0, value: 0, easing: "linear" },
        { time: 2, value: 100, easing: "smooth" },
      ],
    },
  ];
  return {
    ...defaultRecipe,
    studio: {
      ...structuredClone(defaultStudio),
      nodes: [group, hp],
      data: { hp: 45 },
      bindings: [
        {
          nodeId: hp.id,
          property: "value" as const,
          key: "hp",
          scale: 1,
          offset: 0,
          min: 0,
          max: 100,
          format: "{value}",
        },
      ],
      events: [
        { id: "impact", time: 1, name: "impact", payload: { intensity: 1 } },
      ],
    },
  };
}
const ref = (p: Project) => ({ projectId: p.id, expectedRevision: p.revision });
async function fixture(
  run: (app: Application, repo: FileRepository) => Promise<void>,
  production = {} as Production,
) {
  const path = await mkdtemp(join(tmpdir(), "gametool-studio-core-"));
  const repo = new FileRepository(path);
  await repo.init();
  const app = new Application(repo, production, randomUUID, async () => ({}));
  try {
    await run(app, repo);
  } finally {
    await app.shutdown();
    await rm(path, { recursive: true, force: true });
  }
}
test("studio remains optional and strict graph, keyframe, binding, event and budget rules reject invalid drafts", () => {
  assert.equal(recipeSchema.parse(defaultRecipe).studio, undefined);
  assert.equal(recipeSchema.parse(composition()).studio!.nodes.length, 2);
  const invalids = [
    (r: ReturnType<typeof composition>) =>
      r.studio.nodes.push(r.studio.nodes[0]),
    (r: ReturnType<typeof composition>) =>
      (r.studio.nodes[0].parentId = "group"),
    (r: ReturnType<typeof composition>) =>
      (r.studio.nodes[1].parentId = "missing"),
    (r: ReturnType<typeof composition>) =>
      (r.studio.nodes[0].parentId = "health"),
    (r: ReturnType<typeof composition>) =>
      (r.studio.nodes[1].tracks[0].keys[1].time = 0),
    (r: ReturnType<typeof composition>) =>
      (r.studio.nodes[1].tracks[0].keys[1].time = 6),
    (r: ReturnType<typeof composition>) =>
      (r.studio.bindings[0].nodeId = "missing"),
    (r: ReturnType<typeof composition>) =>
      r.studio.bindings.push(r.studio.bindings[0]),
    (r: ReturnType<typeof composition>) => (r.studio.events[0].time = 9),
    (r: ReturnType<typeof composition>) =>
      (r.studio.quality.particleBudget = 5001),
    (r: ReturnType<typeof composition>) =>
      (r.studio.nodes[1].widget = undefined),
    (r: ReturnType<typeof composition>) => (r.studio.nodes[1].scale = Infinity),
  ];
  for (const mutate of invalids) {
    const r = composition();
    mutate(r);
    assert.equal(recipeSchema.safeParse(r).success, false);
  }
  const r = composition();
  r.studio.nodes[1].sprite = {
    rows: 2,
    columns: 2,
    frames: 5,
    fps: 20,
    loop: true,
  };
  assert.equal(recipeSchema.safeParse(r).success, false);
});
test("studio draft variants validate all inputs and references before a single atomic batch save", async () => {
  await fixture(async (app, repo) => {
    const p = await app.execute("project_create", { name: "source" });
    const source = await app.execute("project_update", {
      ...ref(p),
      recipe: composition(),
    });
    const args = {
      ...ref(source),
      variants: [
        { name: "Red", patch: { color: "#ff0000" } },
        { name: "Blue", patch: { color: "#0000ff" } },
      ],
    };
    const draft = await app.execute("studio_variants", args);
    assert.equal(draft.saved, false);
    assert.equal((await repo.projects()).length, 1);
    await assert.rejects(
      app.execute("studio_variants", {
        ...args,
        save: true,
        variants: [args.variants[0], { name: "bad", patch: { width: 99999 } }],
      }),
    );
    assert.equal((await repo.projects()).length, 1);
    const image = createStudioNode("image", "image");
    image.assetId = randomUUID();
    await assert.rejects(
      app.execute("studio_variants", {
        ...args,
        save: true,
        variants: [
          args.variants[0],
          {
            name: "missing asset",
            patch: {
              studio: { ...structuredClone(defaultStudio), nodes: [image] },
            },
          },
        ],
      }),
      { code: "UNAVAILABLE" },
    );
    assert.equal((await repo.projects()).length, 1);
    await assert.rejects(
      app.execute("studio_variants", {
        ...args,
        expectedRevision: 1,
        save: true,
      }),
      { code: "REVISION_CONFLICT" },
    );
    const saved = await app.execute("studio_variants", { ...args, save: true });
    assert.equal(saved.projects.length, 2);
    assert.equal(
      (await readdir(join(repo.root, "project-batches"))).filter((f) =>
        f.endsWith(".json"),
      ).length,
      1,
    );
    assert.deepEqual(await repo.project(source.id), source);
    const reopened = new FileRepository(repo.root);
    await reopened.init();
    assert.equal((await reopened.projects()).length, 3);
    const variant = saved.projects[0];
    assert.deepEqual(await reopened.history(variant.id), []);
    const changed = await app.execute("project_update", {
      ...ref(variant),
      recipe: { ...variant.recipe, text: "edited" },
    });
    assert.equal(changed.revision, 2);
    assert.equal((await reopened.projects()).length, 3);
    assert.equal((await reopened.project(variant.id)).recipe.text, "edited");
    const restored = await app.execute("project_restore", {
      ...ref(changed),
      revision: 1,
    });
    assert.equal(restored.recipe.text, variant.recipe.text);
    assert.equal(restored.revision, 3);
  });
});
test("studio comparison and diff are read-only and report sampled bindings without expanding every particle", async () => {
  await fixture(async (app, repo) => {
    let p = await app.execute("project_create", { name: "source" });
    const r = composition();
    const particles = createStudioNode("particles", "particles");
    r.text = "A".repeat(2000);
    r.typography = { ...defaultTypography, enabled: true };
    r.particles = { ...defaultParticles, enabled: true, count: 500 };
    particles.particles = { ...defaultParticles, enabled: true, count: 100 };
    r.studio.nodes.push(particles);
    p = await app.execute("project_update", { ...ref(p), recipe: r });
    const result = await app.execute("studio_compare", {
      ...ref(p),
      variants: [{ name: "low HP", patch: { studio: { data: { hp: 12 } } } }],
      times: [0.5],
    });
    assert.equal(result.kind, "numerical-samples");
    assert.equal(result.samples.length, 2);
    const sample = result.samples[0].samples[0].state;
    assert.equal(sample.glyphCount, 2000);
    assert.equal(sample.glyphSample.length, 3);
    assert.equal(sample.particleCount, 500);
    assert.equal(sample.particleSample.length, 3);
    assert.ok(JSON.stringify(result).length < 20000);
    assert.equal(
      result.samples[1].samples[0].state.studio.find(
        (n: any) => n.id === "health",
      ).value,
      12,
    );
    assert.ok(
      result.samples[0].samples[0].state.studio.find(
        (n: any) => n.id === "particles",
      ).particleSample.length <= 3,
    );
    const diff = await app.execute("recipe_diff", {
      ...ref(p),
      recipe: { ...p.recipe, color: "#123456" },
    });
    assert.equal(diff.changes[0].path, "/color");
    assert.deepEqual(await repo.project(p.id), p);
    assert.equal((await repo.projects()).length, 1);
  });
});
test("integration and profiling are explicit ports, unauthorized or unavailable actions fail before writes", async () => {
  await fixture(async (app) => {
    assert.deepEqual(await app.execute("integration_roots", {}), { roots: [] });
    await assert.rejects(
      app.execute("integration_plan", {
        artifactId: randomUUID(),
        rootId: "none",
        effectId: "test",
      }),
      { code: "UNAVAILABLE" },
    );
    await assert.rejects(
      app.execute("performance_start", {
        artifactId: randomUUID(),
        frames: 120,
      }),
      { code: "UNAVAILABLE" },
    );
    await assert.rejects(
      app.execute("integration_apply", {
        planId: "anything",
        expectedHash: "a".repeat(64),
      }),
      { code: "UNAVAILABLE" },
    );
  });
});
