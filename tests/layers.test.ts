import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  defaultRecipe,
  presets,
  recipeSchema,
} from "../packages/core/model.js";
import {
  defaultBackground,
  defaultParticles,
  backgroundAt,
  particlesAt,
  Playback,
  sceneSnapshot,
} from "../runtimes/shared/motion.js";
import { LocalAssets } from "../apps/local-service/assets.js";
import { FileRepository } from "../apps/local-service/repository.js";
import { Application } from "../packages/core/application.js";

test("legacy recipes normalize with disabled layers and every preset validates", () => {
  const r = recipeSchema.parse(defaultRecipe);
  assert.equal(r.background.enabled, false);
  assert.equal(r.textVisible, true);
  for (const p of presets)
    assert.ok(recipeSchema.safeParse(p.recipe).success, p.id);
  for (const particles of [
    { ...defaultParticles, count: 501 },
    { ...defaultParticles, seed: NaN },
    { ...defaultParticles, lifetime: 0 },
  ])
    assert.equal(recipeSchema.safeParse({ ...r, particles }).success, false);
  assert.equal(
    recipeSchema.safeParse({ ...r, image: { ...r.image, enabled: true } })
      .success,
    false,
  );
});
test("background modes respect amount, absolute seek and loop endpoint", () => {
  for (const motion of [
    "none",
    "zoom-in",
    "zoom-out",
    "pan-left",
    "pan-right",
    "pan-up",
    "pan-down",
    "shake",
  ] as const) {
    const r = {
      ...defaultRecipe,
      loop: false,
      background: { ...defaultBackground, enabled: true, motion, amount: 0.25 },
    };
    const a = backgroundAt(r, 0),
      b = backgroundAt(r, 2.6);
    assert.ok(Object.values(b).every(Number.isFinite));
    if (motion === "zoom-in") assert.equal(b.scale, 1.25);
    if (motion === "zoom-out") assert.equal(a.scale, 1.25);
    if (motion === "pan-left") assert.ok(b.x < a.x);
    if (motion === "pan-right") assert.ok(b.x > a.x);
    if (motion === "pan-up") assert.ok(b.y < a.y);
    if (motion === "pan-down") assert.ok(b.y > a.y);
    assert.deepEqual(backgroundAt({ ...r, loop: true }, 2.6), a);
  }
});
test("seeded emitters reproduce reverse seek and different frame rates; burst expires", () => {
  for (const preset of ["snow", "sparks", "confetti"] as const) {
    const r = {
      ...defaultRecipe,
      loop: false,
      particles: { ...defaultParticles, enabled: true, preset },
    };
    const p = new Playback(r);
    p.seek(1.1);
    const expected = sceneSnapshot(r, p.time);
    p.seek(2);
    p.seek(1.1);
    assert.deepEqual(sceneSnapshot(r, p.time), expected);
    assert.notDeepEqual(
      particlesAt({ ...r, particles: { ...r.particles, seed: 43 } }, 1.1),
      expected.particles,
    );
    for (const fps of [30, 60, 120]) {
      p.seek(0);
      p.play();
      for (let i = 0; i < fps; i++) p.advance(1 / fps);
      const actual = particlesAt(r, p.time);
      const exp = particlesAt(r, 1);
      assert.ok(Math.abs(actual[0].x - exp[0].x) < 1e-8);
    }
    assert.ok(
      particlesAt(
        {
          ...r,
          particles: { ...r.particles, emission: "burst", lifetime: 0.5 },
        },
        1,
      ).every((x) => x.opacity === 0),
    );
    assert.ok(particlesAt(r, 3).every((x) => x.opacity === 0));
  }
});
test("image import preserves originals, decodes formats, rejects malformed data and detects tampering", async () => {
  const root = await mkdtemp(join(tmpdir(), "gametool-assets-"));
  try {
    const assets = new LocalAssets(root);
    for (const format of ["png", "jpeg", "webp"] as const) {
      const bytes = await sharp({
        create: { width: 13, height: 7, channels: 4, background: "#ff00aa80" },
      })
        [format]()
        .toBuffer();
      const a = await assets.import(
        "../safe-name." + format,
        bytes.toString("base64"),
      );
      assert.equal(a.width, 13);
      assert.equal(a.height, 7);
      assert.deepEqual(
        await readFile(join(root, "assets", a.id, "original")),
        bytes,
      );
      assert.equal(
        (await sharp(await assets.bytes(a.id)).metadata()).format,
        "png",
      );
    }
    const oriented = await sharp({
      create: { width: 13, height: 7, channels: 3, background: "#ff0000" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const rotated = await assets.import(
      "oriented.jpg",
      oriented.toString("base64"),
    );
    assert.equal(rotated.width, 7);
    assert.equal(rotated.height, 13);
    await assert.rejects(assets.import("bad", "not base64"), {
      code: "INVALID_IMAGE",
    });
    await assert.rejects(
      assets.import(
        "script.png",
        Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
        ).toString("base64"),
      ),
      { code: "INVALID_IMAGE" },
    );
    const huge = await sharp({
      create: { width: 4100, height: 4000, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await assert.rejects(assets.import("huge.png", huge.toString("base64")), {
      code: "INVALID_IMAGE",
    });
    assert.equal((await assets.list()).length, 4);
    await writeFile(join(root, "assets", rotated.id, "image.png"), "changed");
    await assert.rejects(assets.bytes(rotated.id), { code: "ASSET_CHANGED" });
    const repo = new FileRepository(root);
    await repo.init();
    const app = new Application(
      repo,
      {} as any,
      randomUUID,
      async () => ({}),
      assets,
    );
    const p = await app.execute("project_create", { name: "asset reference" });
    await assert.rejects(
      app.execute("project_update", {
        projectId: p.id,
        expectedRevision: 1,
        recipe: {
          ...p.recipe,
          background: { ...defaultBackground, assetId: randomUUID() },
        },
      }),
      { code: "ASSET_NOT_FOUND" },
    );
    assert.equal((await repo.project(p.id)).revision, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("random channels do not align particles in correlated ribbons", async () => {
  const { randomAt } = await import("../runtimes/shared/motion.js");
  const samples = Array.from({ length: 500 }, (_, i) => [
    randomAt(42, i, 1),
    randomAt(42, i, 2),
  ]);
  const means = [0, 1].map(
    (c) => samples.reduce((sum, v) => sum + v[c], 0) / samples.length,
  );
  const covariance = samples.reduce(
    (sum, v) => sum + (v[0] - means[0]) * (v[1] - means[1]),
    0,
  );
  const variance = [0, 1].map((c) =>
    samples.reduce((sum, v) => sum + (v[c] - means[c]) ** 2, 0),
  );
  assert.ok(Math.abs(covariance / Math.sqrt(variance[0] * variance[1])) < 0.2);
  assert.ok(samples.every((v) => v.every((x) => x >= 0 && x < 1)));
});

test("reference background modes, transitions and all image filters are deterministic", async () => {
  const { backgroundMotions, backgroundAssetIds, assetIds, imageFilters } =
    await import("../runtimes/shared/motion.js");
  const { filterPixels } = await import("../runtimes/shared/filters.js");
  for (const motion of backgroundMotions) {
    const r = {
      ...defaultRecipe,
      loop: false,
      background: {
        ...defaultBackground,
        enabled: true,
        motion,
        assetIds: ["a", "b", "c"],
      },
    };
    for (const t of [0, 0.3, 1.3, 2.6, 10])
      assert.ok(Object.values(backgroundAt(r, t)).every(Number.isFinite));
    assert.equal(backgroundAt(r, 2.6).index, 2);
  }
  const r = {
    ...defaultRecipe,
    background: { ...defaultBackground, assetIds: ["b", "a"] },
  };
  assert.deepEqual(backgroundAssetIds(r), ["b", "a"]);
  assert.deepEqual(assetIds(r), ["b", "a"]);
  const source = new Uint8ClampedArray([
      255, 40, 0, 255, 40, 255, 80, 150, 20, 50, 255, 200, 100, 150, 90, 0,
    ]),
    copy = source.slice();
  for (const filter of imageFilters) {
    const result = filterPixels(source, 2, 2, filter);
    assert.deepEqual(result, filterPixels(source, 2, 2, filter));
    for (let i = 3; i < source.length; i += 4)
      assert.equal(result[i], source[i]);
  }
  assert.deepEqual(source, copy);
  const gray = filterPixels(source, 2, 2, "grayscale");
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.ok(filterPixels(source, 2, 2, "night")[0] < source[0]);
});

test("glyph timing staggers characters, supports reverse seek and finishes every motion", async () => {
  const { defaultTypography, glyphAt, textMotions, holdMotions } = await import(
    "../runtimes/shared/motion.js"
  );
  for (const entrance of textMotions) {
    const r = {
      ...defaultRecipe,
      loop: false,
      enter: 1,
      hold: 2,
      exit: 1,
      typography: { ...defaultTypography, enabled: true, entrance },
    };
    assert.equal(glyphAt(r, 0, 0, 4).opacity, 0);
    assert.ok(Object.values(glyphAt(r, 0.4, 2, 4)).every(Number.isFinite));
    assert.equal(glyphAt(r, 1, 3, 4).opacity, 1);
    assert.equal(glyphAt(r, 4, 2, 4).opacity, 0);
  }
  const r = {
    ...defaultRecipe,
    enter: 1,
    typography: { ...defaultTypography, enabled: true },
  };
  assert.ok(glyphAt(r, 0.3, 0, 4).opacity > glyphAt(r, 0.3, 3, 4).opacity);
  for (const holdMotion of holdMotions)
    assert.ok(
      Object.values(
        glyphAt(
          { ...r, typography: { ...r.typography, holdMotion } },
          1.2,
          2,
          4,
        ),
      ).every(Number.isFinite),
    );
});

test("Flutter image sequences serialize as Dart lists, including empty lists", async () => {
  const { generate } = await import("../packages/generators/index.js");
  for (const assetIds of [[], [randomUUID(), randomUUID()]]) {
    const files = await generate(
      {
        id: randomUUID(),
        name: "sequence",
        revision: 1,
        updatedAt: "",
        recipe: {
          ...defaultRecipe,
          background: { ...defaultBackground, assetIds },
        },
      },
      "flutter",
    );
    assert.ok(String(files["lib/recipe.dart"]).includes('"assetIds":['));
    assert.equal(
      String(files["lib/recipe.dart"]).includes('"assetIds":{'),
      false,
    );
  }
});

test("frame traces clockwise independently of glyph entry and survives reverse seek", async () => {
  const {defaultFrame, defaultTypography, frameAt, traceRectangle, glyphAt} = await import('../runtimes/shared/motion.js');
  const r=recipeSchema.parse({...defaultRecipe,enter:1,hold:2,exit:.6,loop:false,frame:{...defaultFrame,enabled:true},typography:{...defaultTypography,enabled:true}});
  assert.deepEqual(frameAt(r,0),{progress:0,opacity:0});
  assert.ok(frameAt(r,.15).progress>0);
  assert.equal(glyphAt(r,.15,0,4).opacity,0);
  assert.equal(frameAt(r,.6).progress,1);
  assert.equal(glyphAt(r,1,3,4).opacity,1);
  assert.ok(frameAt(r,3.3).progress<1);
  assert.equal(frameAt(r,3.6).opacity,0);
  assert.deepEqual(frameAt({...r,loop:true},3.6),frameAt(r,0));
  const playback=new Playback(r);playback.seek(.2);const first=sceneSnapshot(r,playback.time);playback.seek(3.4);playback.seek(.2);
  assert.deepEqual(sceneSnapshot(r,playback.time),first);
  assert.deepEqual(traceRectangle(0,0,100,50,1/3),[[0,0],[100,0]]);
  assert.deepEqual(traceRectangle(0,0,100,50,.5),[[0,0],[100,0],[100,50]]);
  assert.deepEqual(traceRectangle(0,0,100,50,5/6),[[0,0],[100,0],[100,50],[0,50]]);
  assert.deepEqual(traceRectangle(0,0,100,50,1),[[0,0],[100,0],[100,50],[0,50],[0,0]]);
  assert.deepEqual(traceRectangle(0,0,100,50,1/6,true),[[100,0],[100,50]]);
  assert.equal(frameAt({...r,textVisible:false},1).opacity,0);
  assert.equal(frameAt({...r,frame:{...r.frame,enabled:false}},1).opacity,0);
  for(const animation of ['draw','fade','none'] as const) {
    const recipe={...r,frame:{...r.frame,animation,duration:0}};
    assert.equal(frameAt(recipe,0).progress,1);
    assert.ok(Object.values(frameAt(recipe,3.3)).every(Number.isFinite));
  }
  assert.equal(recipeSchema.safeParse({...r,frame:{...r.frame,width:-1}}).success,false);
});
