import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { defaultRecipe, recipeSchema } from "../packages/core/model.js";
import { evaluate, Playback } from "../runtimes/shared/motion.js";
import { Application } from "../packages/core/application.js";
import { FileRepository } from "../apps/local-service/repository.js";
import { generate, dartString } from "../packages/generators/index.js";

test("absolute timeline covers start, entry, hold, exit and loop boundaries", () => {
  const r = { ...defaultRecipe, enter: 1, hold: 1, exit: 1, loop: false };
  assert.equal(evaluate(r, 0).opacity, 0);
  assert.equal(evaluate(r, 0.5).opacity, 0.5);
  assert.equal(evaluate(r, 1).opacity, 1);
  assert.equal(evaluate(r, 2).opacity, 1);
  assert.equal(evaluate(r, 2.5).opacity, 0.5);
  assert.equal(evaluate(r, 3).opacity, 0);
  assert.equal(evaluate({ ...r, loop: true }, 3).opacity, 0);
  assert.equal(evaluate({ ...r, loop: true }, 3.5).opacity, 0.5);
  assert.equal(evaluate({ ...r, enter: 0 }, 0).opacity, 1);
  assert.equal(evaluate({ ...r, exit: 0 }, 2).opacity, 0);
  assert.throws(() => evaluate(r, NaN));
  assert.throws(() => evaluate(r, -1));
});
test("slide and pop use cubic easing, not accumulated frame history", () => {
  const r = {
    ...defaultRecipe,
    enter: 1,
    hold: 1,
    exit: 1,
    loop: false,
    effect: "slide" as const,
    distance: 100,
  };
  assert.equal(evaluate(r, 0.25).y, 42.1875);
  assert.equal(evaluate({ ...r, effect: "pop" }, 0.5).scale, 0.965);
  const samples = [30, 60, 120].map((fps) => {
    const p = new Playback(r);
    p.play();
    for (let i = 0; i < fps; i++) p.advance(1 / fps);
    return p.state;
  });
  for (const s of samples) assert.ok(Math.abs(s.opacity - 1) < 1e-12);
});
test("playback pause, speed, reverse seek and completed non-loop state", () => {
  const p = new Playback({ ...defaultRecipe, loop: false });
  p.play();
  p.advance(0.2);
  p.pause();
  p.advance(1);
  assert.equal(p.time, 0.2);
  p.speed = 2;
  p.play();
  p.advance(0.2);
  assert.ok(Math.abs(p.time - 0.6) < 1e-12);
  p.seek(0.1);
  assert.equal(p.time, 0.1);
  p.advance(20);
  assert.equal(p.playing, false);
  assert.equal(p.state.opacity, 0);
  assert.throws(() => {
    p.speed = 0;
  });
  assert.throws(() => p.advance(Infinity));
});
test("schema rejects unknown features, giant canvases and invalid durations", () => {
  for (const r of [
    { ...defaultRecipe, enter: 0, hold: 0, exit: 0 },
    { ...defaultRecipe, width: 1e8 },
    { ...defaultRecipe, effect: "shader" },
    { ...defaultRecipe, evil: "code" },
    { ...defaultRecipe, color: "url(x)" },
    { ...defaultRecipe, fontSize: NaN },
  ])
    assert.equal(recipeSchema.safeParse(r).success, false);
});
test("GUI and MCP command boundary serializes revisions and persists saved projects", async () => {
  const root = await mkdtemp(join(tmpdir(), "gametool-test-"));
  try {
    const repo = new FileRepository(root);
    await repo.init();
    const production: any = {
      create: async () => {
        throw new Error("unavailable");
      },
    };
    const app = new Application(repo, production, randomUUID, async () => ({}));
    const p = await app.execute("project_create", { name: "test" });
    const update = {
      projectId: p.id,
      expectedRevision: 1,
      recipe: { ...p.recipe, text: "수정됨" },
    };
    const results = await Promise.allSettled([
      app.execute("project_update", update),
      app.execute("project_update", update),
    ]);
    assert.equal(results[0].status, "fulfilled");
    assert.equal(results[1].status, "rejected");
    if (results[1].status === "rejected")
      assert.equal(results[1].reason.code, "REVISION_CONFLICT");
    assert.equal((await repo.project(p.id)).revision, 2);
    await assert.rejects(
      app.execute("code_generate", {
        projectId: p.id,
        expectedRevision: 1,
        target: "flutter",
      }),
      { code: "REVISION_CONFLICT" },
    );
    await assert.rejects(
      app.execute("project_get", { projectId: "../../etc/passwd" }),
    );
    const j = await app.execute("code_generate", {
      projectId: p.id,
      expectedRevision: 2,
      target: "three",
    });
    let state: any;
    for (let i = 0; i < 50; i++) {
      state = await app.execute("job_get", { jobId: j.jobId });
      if (state.status === "failed") break;
      await new Promise((r) => setTimeout(r, 10));
    }
    assert.equal(state.status, "failed");
    assert.equal(state.error.message, "unavailable");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("source generation is deterministic and serializes literal special characters", async () => {
  const project = {
    id: randomUUID(),
    name: "example",
    revision: 1,
    updatedAt: "",
    recipe: { ...defaultRecipe, text: '한글 "quote"\n${danger} \\ </script>' },
  };
  for (const target of ["flutter", "phaser", "three"] as const) {
    const a = await generate(project, target),
      b = await generate(project, target);
    assert.deepEqual(a, b);
    assert.ok(Object.keys(a).length >= 8);
    if (target === "flutter")
      assert.ok(String(a["lib/recipe.dart"]).includes("\\${danger}"));
    else
      assert.equal(
        JSON.parse(String(a["src/recipe.ts"]).split(" = ")[1].slice(0, -2))
          .text,
        project.recipe.text,
      );
  }
  assert.equal(dartString("$name"), '"\\$name"');
});

test("job cancellation stops work and restart marks unfinished jobs interrupted", async () => {
  const root = await mkdtemp(join(tmpdir(), "gametool-cancel-"));
  try {
    const repo = new FileRepository(root);
    await repo.init();
    const app = new Application(
      repo,
      {
        create: async (_p, _t, signal) => {
          signal.throwIfAborted();
          return new Promise((_resolve, reject) =>
            signal.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            ),
          );
        },
        preview: async () => ({ previewUrl: "" }),
        validate: async () => {},
      },
      randomUUID,
      async () => ({}),
    );
    const p = await app.execute("project_create", { name: "cancel" });
    const j = await app.execute("code_generate", {
      projectId: p.id,
      expectedRevision: 1,
      target: "three",
    });
    await new Promise((r) => setTimeout(r, 50));
    await app.execute("job_cancel", { jobId: j.jobId });
    await app.shutdown();
    const ended = await app.execute("job_get", { jobId: j.jobId });
    assert.equal(ended.status, "cancelled");
    const unfinished = {
      id: randomUUID(),
      kind: "code_generate",
      status: "running" as const,
      progress: "test",
    };
    await repo.saveJob(unfinished);
    await repo.init();
    assert.equal(
      (await repo.jobs()).find((x) => x.id === unfinished.id)?.status,
      "interrupted",
    );
    assert.equal((await repo.project(p.id)).revision, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Flutter generation preserves fractional timings and asserts rendered opacity", async () => {
  const p = {
    id: randomUUID(),
    name: "precision",
    revision: 1,
    updatedAt: "",
    recipe: {
      ...defaultRecipe,
      enter: 0.123456789,
      hold: 0,
      exit: 0,
      loop: false,
    },
  };
  const files = await generate(p, "flutter");
  assert.ok(String(files["lib/recipe.dart"]).includes("enter: 0.123456789"));
  assert.ok(String(files["pubspec.yaml"]).includes("family: Roboto"));
  assert.ok(
    String(files["test/effect_test.dart"]).includes("tester.widget<Opacity>"),
  );
  assert.ok(
    String(files["test/effect_test.dart"]).includes("closeTo(0, 0.00001)"),
  );
});
