import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { createFont, woff2 } from "fonteditor-core";
import { deflateSync } from "node:zlib";
import {
  presets,
  recipeSchema,
  defaultRecipe,
} from "../packages/core/model.js";
import { referencePresets } from "../packages/core/reference-presets.js";
import {
  defaultTypography,
  defaultFrame,
  glyphAt,
  duration,
  Playback,
  backgroundAt,
  defaultBackground,
} from "../runtimes/shared/motion.js";
import {
  defaultMotion,
  defaultSequence,
  defaultLayout,
} from "../runtimes/shared/options.js";
import {
  timelineFor,
  pageAt,
  subtitleAt,
  easing,
} from "../runtimes/shared/sequence.js";
import { LocalAssets } from "../apps/local-service/assets.js";
import { normalizeFont } from "../apps/local-service/font-import.js";
import { bundleFonts } from "../packages/generators/fonts.js";
import catalog from "../assets/fonts/catalog.json" with { type: "json" };
const preciseRecipe = () =>
  recipeSchema.parse({
    ...defaultRecipe,
    loop: false,
    text: "A,B\nC",
    typography: { ...defaultTypography, enabled: true },
    motion: { ...defaultMotion, enabled: true },
    sequence: defaultSequence,
  });
test("all 80 audited compositions have valid independent timings, layouts and decoration settings", () => {
  assert.equal(referencePresets.length, 80);
  assert.equal(presets.length, 90);
  assert.equal(new Set(referencePresets.map((p) => p.id)).size, 80);
  for (const p of referencePresets) {
    const r = recipeSchema.parse(p.recipe);
    assert.ok(duration(r) > 0);
    for (const t of [
      0,
      0.1,
      0.6,
      duration(r) / 2,
      duration(r) - 0.01,
      duration(r) + 0.1,
    ]) {
      for (let i = 0; i < pageAt(r, t).page.text.length; i++) {
        const state = glyphAt(r, t, i, pageAt(r, t).page.text.length);
        for (const value of Object.values(state))
          assert.ok(Number.isFinite(value), `${p.id} ${t}`);
        assert.ok(state.opacity >= 0 && state.opacity <= 1);
      }
    }
  }
  assert.equal(
    referencePresets.find((p) => p.id === "ref-message-battle")!.recipe.frame!
      .extend,
    12,
  );
  assert.equal(
    referencePresets.find((p) => p.id === "ref-caption-vertical")!.recipe
      .layout!.anchor,
    "tr",
  );
});
test("trailer scheduling separates punctuation, line pauses, blank pages and all seven reveals", () => {
  for (const reveal of [
    "char",
    "line",
    "sweep",
    "all",
    "solo",
    "spread",
    "scroll",
  ]) {
    const r = {
      ...preciseRecipe(),
      text: "A,B\nC\n\nNEXT",
      sequence: {
        ...defaultSequence,
        mode: "trailer",
        reveal,
        cps: 10,
        punctPause: 0.5,
        linePause: 0.8,
      },
    };
    const tl = timelineFor(r);
    assert.equal(tl.pages.length, reveal === "scroll" ? 1 : 2);
    if (reveal === "char") {
      assert.ok(
        Math.abs(tl.pages[0].starts[2] - tl.pages[0].starts[1] - 0.6) < 1e-8,
      );
      assert.ok(
        Math.abs(tl.pages[0].starts[4] - tl.pages[0].starts[2] - 0.9) < 1e-8,
      );
    }
    if (reveal === "line")
      assert.equal(tl.pages[0].starts[0], tl.pages[0].starts[2]);
    if (reveal === "all") assert.equal(new Set(tl.pages[0].starts).size, 1);
    if (reveal === "solo") {
      assert.equal(tl.pages[0].starts[0], tl.pages[0].soloEnd);
      assert.equal(glyphAt(r, tl.pages[0].textStart + 0.01, 0, 5).center, 1);
    }
    if (reveal !== "scroll") {
      assert.equal(pageAt(r, tl.pages[0].end + 0.1).active, false);
      assert.equal(pageAt(r, tl.pages[1].textStart + 0.1).index, 1);
    }
  }
});
test("finite loops end exactly, keep mode persists, seek and subtitle order are deterministic", () => {
  const r = { ...preciseRecipe(), loop: true, loopCount: 2 };
  const p = new Playback(r);
  p.play();
  p.advance(duration(r) * 3);
  assert.equal(p.playing, false);
  assert.equal(p.time, duration(r) * 2);
  assert.equal(p.state.time, duration(r));
  const keep = {
    ...preciseRecipe(),
    typography: {
      ...defaultTypography,
      enabled: true,
      departure: "none" as const,
    },
  };
  assert.equal(glyphAt(keep, duration(keep) + 10, 0, 5).opacity, 1);
  const sub = {
    ...preciseRecipe(),
    typography: {
      ...defaultTypography,
      enabled: true,
      entrance: "pop" as const,
      subText: "SUB",
    },
    motion: {
      ...defaultMotion,
      enabled: true,
      subDelay: 0.4,
      subMotion: "same",
    },
  };
  const pg = timelineFor(sub).pages[0];
  assert.equal(subtitleAt(sub, pg.subStart - 0.1).opacity, 0);
  assert.ok(subtitleAt(sub, pg.subStart + 0.1).scale < 1);
  for (const ease of [
    "linear",
    "in",
    "smooth",
    "strong",
    "back",
    "elastic",
    "bounce",
    "out",
    "auto",
  ]) {
    assert.equal(easing(ease, 0), 0);
    assert.ok(Math.abs(easing(ease, 1) - 1) < 1e-9);
  }
});
test("block effects ignore glyph stagger and wipe directions preserve center and vertical options", () => {
  for (const entrance of ["wipe", "unfold", "approach", "slam"] as const) {
    const r = {
      ...preciseRecipe(),
      typography: { ...defaultTypography, enabled: true, entrance },
      motion: {
        ...defaultMotion,
        enabled: true,
        inStagger: 0.5,
        inDirection: "center",
      },
    };
    assert.equal(new Set(timelineFor(r).pages[0].starts).size, 1);
    assert.equal(glyphAt(r, 0.3, 0, 5).block, 1);
  }
  const r = {
    ...preciseRecipe(),
    typography: {
      ...defaultTypography,
      enabled: true,
      entrance: "unfold" as const,
    },
    motion: { ...defaultMotion, enabled: true, inDirection: "v" },
  };
  assert.ok(glyphAt(r, 0.3, 0, 5).scaleY < 1);
});
test("background fade order and original-to-filter transitions are independent of image list length", () => {
  const r = {
    ...defaultRecipe,
    loop: false,
    background: {
      ...defaultBackground,
      enabled: true,
      motion: "fade-black" as const,
      profile: "reference" as const,
    },
  };
  assert.equal(backgroundAt(r, 0).overlay, 0);
  assert.equal(
    backgroundAt(
      { ...r, background: { ...r.background, fadeDirection: "in" } },
      0,
    ).overlay,
    1,
  );
  const single = {
    ...r,
    background: {
      ...r.background,
      motion: "crossfade" as const,
      transitionSource: "original-filter" as const,
      assetIds: ["a", "b", "c"],
    },
  };
  assert.equal(backgroundAt(single, duration(single) / 2).index, 0);
  assert.equal(backgroundAt(single, duration(single) / 2).next, 0);
  assert.equal(backgroundAt(single, duration(single) / 2).mix, 0.5);
});
test("88 font families are cached with license and content hashes; selected variants alone are bundled", async () => {
  assert.equal(catalog.length, 88);
  for (const f of catalog) {
    assert.ok(
      (await readFile(join("assets/fonts/catalog", f.id, f.license))).length >
        100,
    );
    for (const file of f.files)
      assert.equal(
        createHash("sha256")
          .update(await readFile(join("assets/fonts/catalog", f.id, file.file)))
          .digest("hex"),
        file.sha256,
      );
  }
  const bundled = await bundleFonts({
    ...defaultRecipe,
    layout: {
      ...defaultLayout,
      font: "shippori-mincho-b1",
      subFont: "same",
      weight: 800,
      subWeight: 400,
    },
  });
  assert.ok(
    bundled.registrations.some(
      (f) => f.family === "GameToolFont_noto-serif-kr",
    ),
  );
  assert.ok(bundled.registrations.length < 10);
});
test("TTF, WOFF and WOFF2 imports preserve original bytes and create valid local font payloads", async () => {
  const f = catalog.find((f) => f.id === "press-start-2p")!;
  const bytes = await readFile(
    join("assets/fonts/catalog", f.id, f.files[0].file),
  );
  const font = createFont(bytes, { type: "ttf" });
  await woff2.init();
  const sources = [
    bytes,
    Buffer.from(
      font.write({
        type: "woff",
        deflate: (data) => Array.from(deflateSync(Buffer.from(data))),
      }) as Uint8Array,
    ),
    Buffer.from(woff2.encode(bytes)),
  ];
  const root = await mkdtemp(join(tmpdir(), "gametool-font-test-"));
  try {
    const assets = new LocalAssets(root);
    for (const source of sources) {
      const a = await assets.import("local-font", source.toString("base64"));
      assert.equal(a.kind, "font");
      assert.deepEqual(
        await readFile(join(root, "assets", a.id, "original")),
        source,
      );
      assert.ok(
        (await normalizeFont(await assets.bytes(a.id))).bytes.length > 100,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  await assert.rejects(
    () => normalizeFont(Buffer.from("wOFFinvalid")),
    /폰트를 읽을 수 없습니다/,
  );
});

test("flash brightens glyphs, slam has an impact, and vertical text uses its cross axis", () => {
  const base = preciseRecipe();
  const flash = {
    ...base,
    typography: { ...base.typography, entrance: "flash" as const },
  };
  assert.ok(glyphAt(flash, 0.3, 0, 5).bright > 0);
  assert.equal(glyphAt(flash, 1.5, 0, 5).bright, 0);
  const slam = {
    ...base,
    typography: { ...base.typography, entrance: "slam" as const },
  };
  assert.ok(glyphAt(slam, 0.2, 0, 5).scale > 1.5);
  const vertical = {
    ...base,
    typography: {
      ...base.typography,
      entrance: "rise" as const,
      vertical: true,
    },
  };
  const state = glyphAt(vertical, 0.2, 0, 5);
  assert.ok(state.x > 0);
  assert.equal(state.y, 0);
});
