import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Application, type AssetStore } from "../packages/core/application.js";
import { FileRepository } from "../apps/local-service/repository.js";
import { defaultRecipe, type Project } from "../packages/core/model.js";
import { generate } from "../packages/generators/index.js";

async function fixture(run: (app: Application, repo: FileRepository) => Promise<void>, assets?: AssetStore) {
  const root = await mkdtemp(join(tmpdir(), "gametool-workspace-"));
  try {
    const repo = new FileRepository(root);
    await repo.init();
    const app = new Application(repo, {} as any, randomUUID, async () => ({}), assets);
    await run(app, repo);
  } finally { await rm(root, { recursive: true, force: true }); }
}
const ref = (p: Project) => ({ projectId: p.id, expectedRevision: p.revision });

test("legacy projects acquire bounded atomic history; restore is reversible and survives reopening", async () => {
  await fixture(async (app, repo) => {
    let p: Project = { id: randomUUID(), name: "기존", revision: 7, recipe: defaultRecipe, updatedAt: "2026-10-04T00:00:00Z" };
    await writeFile(join(repo.root, "projects", `${p.id}.json`), JSON.stringify(p));
    assert.deepEqual((await app.execute("project_history", { projectId: p.id })).entries, []);
    for (let i = 0; i < 33; i++) {
      p = await app.execute("project_update", { ...ref(p), name: `변형 ${i}`, recipe: { ...p.recipe, text: `문구 ${i}` } });
    }
    const h = await app.execute("project_history", { projectId: p.id });
    assert.equal(h.entries.length, 30);
    assert.deepEqual(h.entries.map((s: any) => s.revision), Array.from({ length: 30 }, (_, i) => 39 - i));
    assert.ok(h.entries.every((s: any) => !s.history && !s.id));
    assert.equal((await repo.projects())[0].revision, 40);
    assert.ok(!Object.hasOwn((await repo.projects())[0], "history"));
    const restored = await app.execute("project_restore", { ...ref(p), revision: 10 });
    assert.equal(restored.revision, 41);
    assert.equal(restored.name, "변형 2");
    assert.equal(restored.recipe.text, "문구 2");
    const freshRepo = new FileRepository(repo.root);
    await freshRepo.init();
    const freshApp = new Application(freshRepo, {} as any, randomUUID, async () => ({}));
    assert.deepEqual(await freshRepo.project(p.id), restored);
    const undone = await freshApp.execute("project_restore", { ...ref(restored), revision: 40 });
    assert.deepEqual(undone.recipe, p.recipe);
    assert.equal(undone.name, p.name);
    await assert.rejects(app.execute("project_restore", { ...ref(undone), revision: 7 }), { code: "NOT_FOUND" });
    assert.deepEqual(await repo.project(p.id), undone);
  });
});

test("restore and copy reject stale revisions, malformed IDs and concurrent overwrite", async () => {
  await fixture(async (app, repo) => {
    const p = await app.execute("project_create", { name: "source" });
    const saved = await app.execute("project_update", { ...ref(p), recipe: { ...p.recipe, text: "saved" } });
    for (const [command, extra] of [["project_duplicate", { name: "copy" }], ["project_restore", { revision: 1 }], ["preset_save", { name: "preset" }]] as const)
      await assert.rejects(app.execute(command, { ...ref(p), ...extra }), { code: "REVISION_CONFLICT" });
    const outcomes = await Promise.allSettled([
      app.execute("project_restore", { ...ref(saved), revision: 1 }),
      app.execute("project_update", { ...ref(saved), recipe: p.recipe }),
    ]);
    assert.equal(outcomes[0].status, "fulfilled");
    assert.equal(outcomes[1].status, "rejected");
    assert.equal((await repo.project(p.id)).revision, 3);
    await assert.rejects(app.execute("project_history", { projectId: "../projects" }));
    await assert.rejects(app.execute("preset_delete", { presetId: "battle" }));
    await assert.rejects(app.execute("project_create", { name: "bad", presetId: "missing" }), { code: "NOT_FOUND" });
  });
});

test("copies and user presets are independent; deleting a preset preserves derived projects and generates all targets", async () => {
  await fixture(async (app, repo) => {
    let p = await app.execute("project_create", { name: "원본", presetId: "ref-message-battle" });
    const original = structuredClone(p);
    const preset = await app.execute("preset_save", { ...ref(p), name: "전투 스타일" });
    const copy = await app.execute("project_duplicate", { ...ref(p), name: "사본" });
    assert.notEqual(copy.id, p.id);
    assert.equal(copy.revision, 1);
    assert.deepEqual((await app.execute("project_history", { projectId: copy.id })).entries, []);
    p = await app.execute("project_update", { ...ref(p), recipe: { ...p.recipe, text: "새 문구" } });
    const freshRepo = new FileRepository(repo.root);
    await freshRepo.init();
    assert.deepEqual((await freshRepo.presets())[0].recipe, original.recipe);
    const fromPreset = await app.execute("project_create", { name: "재사용", presetId: preset.id });
    assert.deepEqual(fromPreset.recipe, original.recipe);
    assert.deepEqual((await repo.project(copy.id)).recipe, original.recipe);
    await app.execute("preset_delete", { presetId: preset.id });
    assert.equal((await app.execute("presets_list", {})).length, 90);
    assert.deepEqual(await repo.project(fromPreset.id), fromPreset);
    assert.deepEqual(await repo.project(p.id), p);
    await assert.rejects(app.execute("preset_delete", { presetId: preset.id }), { code: "NOT_FOUND" });
    for (const target of ["flutter", "phaser", "three"] as const) {
      const output = await generate(fromPreset, target);
      assert.deepEqual(JSON.parse(String(output["recipe.json"])), original.recipe);
      assert.ok(!String(output["recipe.json"]).includes("history"));
    }
  });
});

test("restore, duplication and user presets recheck image/font references without saving on failure", async () => {
  const imageId = randomUUID();
  let available = true;
  const assets: AssetStore = {
    list: async () => [], import: async () => { throw Error("unused"); },
    get: async (id) => {
      if (!available || id !== imageId) throw Object.assign(new Error("missing asset"), { code: "ASSET_NOT_FOUND" });
      return { id, name: "image", kind: "image", width: 1, height: 1, format: "png", bytes: 1, originalHash: "x", runtimeHash: "y", createdAt: "" };
    },
  };
  await fixture(async (app, repo) => {
    let p = await app.execute("project_create", { name: "assets" });
    p = await app.execute("project_update", { ...ref(p), recipe: { ...p.recipe, background: { ...p.recipe.background, enabled: true, assetId: imageId } } });
    const preset = await app.execute("preset_save", { ...ref(p), name: "with image" });
    const saved = structuredClone(p);
    available = false;
    for (const [command, args] of [
      ["project_duplicate", { ...ref(p), name: "bad copy" }],
      ["preset_save", { ...ref(p), name: "bad preset" }],
      ["project_create", { name: "bad create", presetId: preset.id }],
    ] as const) await assert.rejects(app.execute(command, args), { code: "ASSET_NOT_FOUND" });
    assert.deepEqual(await repo.project(p.id), saved);
    p = await app.execute("project_update", { ...ref(p), recipe: defaultRecipe });
    await assert.rejects(app.execute("project_restore", { ...ref(p), revision: saved.revision }), { code: "ASSET_NOT_FOUND" });
    assert.deepEqual(await repo.project(p.id), p);
    assert.equal((await repo.projects()).length, 1);
    assert.equal((await repo.presets()).length, 1);
    assert.equal((await repo.history(p.id)).length, 2);
  }, assets);
});
