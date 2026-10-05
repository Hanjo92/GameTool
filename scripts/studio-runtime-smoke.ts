import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { chromium } from "playwright";
import sharp from "sharp";
import { build } from "esbuild";
import { mkdir, writeFile, readFile, symlink } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { generate } from "../packages/generators/index.js";
import { defaultRecipe } from "../packages/core/model.js";
import {
  defaultStudio,
  createStudioNode,
} from "../runtimes/shared/studio-types.js";
import { defaultParticles, type Recipe } from "../runtimes/shared/motion.js";
import { studioFrames } from "../runtimes/shared/studio.js";
const output = resolve("output/validation/studio-runtime");
const group = createStudioNode("group", "group");
group.x = 240;
group.y = 180;
group.rotation = 12;
const hp = createStudioNode("ui", "health", "health-bar");
hp.parentId = "group";
hp.x = 0;
hp.y = 0;
hp.widget!.label = "HP {value}/{max}";
hp.tracks = [
  {
    property: "value",
    keys: [
      { time: 0, value: 100, easing: "linear" },
      { time: 2, value: 20, easing: "smooth" },
    ],
  },
];
const particles = createStudioNode("particles", "sparks");
particles.x = 600;
particles.y = 300;
particles.particles = {
  ...defaultParticles,
  enabled: true,
  advanced: true,
  preset: "sparks",
  count: 12,
};
particles.curves = {
  size: [
    { t: 0, value: 1 },
    { t: 1, value: 0.2 },
  ],
  opacity: [
    { t: 0, value: 1 },
    { t: 1, value: 0 },
  ],
  speed: [
    { t: 0, value: 1 },
    { t: 1, value: 0.5 },
  ],
};
particles.follow = { xKey: "targetX", yKey: "targetY", offsetX: 0, offsetY: 0 };
particles.assetId = "studio-sprite";
particles.sprite = { columns: 2, rows: 1, frames: 2, fps: 4, loop: true };
const imageNode = {
  ...createStudioNode("image", "image"),
  assetId: "studio-sprite",
  x: 750,
  y: 160,
  width: 90,
  height: 90,
};
const nodes = [
  imageNode,
  group,
  hp,
  particles,
  ...(["button", "cooldown", "toast", "item-card"] as const).map((kind, i) => ({
    ...createStudioNode("ui", kind, kind),
    x: 120 + i * 230,
    y: 450,
    width: 190,
    height: 70,
  })),
];
const recipe: Recipe = {
  ...defaultRecipe,
  loop: false,
  text: "STUDIO",
  studio: {
    ...structuredClone(defaultStudio),
    duration: 5,
    nodes,
    events: [{ id: "hit", name: "damage", time: 0.5, payload: { damage: 20 } }],
    data: { targetX: 600, targetY: 260, label: "READY", tint: "#ffbb44" },
    bindings: [
      {
        nodeId: "button",
        property: "text",
        key: "label",
        scale: 1,
        offset: 0,
        min: 0,
        max: 100,
        format: "{value}",
      },
      {
        nodeId: "button",
        property: "color",
        key: "tint",
        scale: 1,
        offset: 0,
        min: 0,
        max: 100,
        format: "{value}",
      },
    ],
  },
};
if (!process.argv.includes("--skip-build"))
  for (const target of ["phaser", "three", "flutter"] as const) {
    const dir = join(output, target),
      files = await generate(
        {
          id: "00000000-0000-4000-8000-000000000001",
          name: "Studio runtime validation",
          revision: 1,
          recipe,
          updatedAt: new Date().toISOString(),
        },
        target,
      );
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(dir, file)), { recursive: true });
      await writeFile(join(dir, file), content);
    }
    await mkdir(join(dir, "assets/images"), { recursive: true });
    await writeFile(
      join(dir, "assets/images/studio-sprite.png"),
      await sharp({
        create: { width: 32, height: 16, channels: 4, background: "#ffbb44" },
      })
        .composite([
          {
            input: Buffer.from(
              '<svg width="16" height="16"><rect width="16" height="16" fill="#4bdfff"/></svg>',
            ),
            left: 16,
            top: 0,
          },
        ])
        .png()
        .toBuffer(),
    );
    if (target === "flutter") {
      const literal = (v: unknown): string =>
        typeof v === "string"
          ? JSON.stringify(v).replace(/\$/g, "\\$")
          : v === null
            ? "null"
            : Array.isArray(v)
              ? `[${v.map(literal)}]`
              : typeof v === "object"
                ? `{${Object.entries(v!)
                    .map(([k, x]) => `${literal(k)}:${literal(x)}`)
                    .join(",")}}`
                : String(v);
      await writeFile(
        join(dir, "test/studio_test.dart"),
        `import 'package:flutter/material.dart';\nimport 'package:flutter_test/flutter_test.dart';\nimport 'package:gametool_effect/studio.dart';\nimport 'package:gametool_effect/effect.dart';\nimport 'package:gametool_effect/motion.dart';\nimport 'package:gametool_effect/recipe.dart';\nimport 'package:gametool_effect/sequence.dart';\nvoid main(){void compare(dynamic a,dynamic b){if(b is num){expect(a,closeTo(b,.00001));}else if(b is Map){for(final key in b.keys){compare(a[key],b[key]);}}else if(b is List){expect(a.length,b.length);for(var i=0;i<b.length;i++){compare(a[i],b[i]);}}else{expect(a,b);}}\n${[0, 0.2, 0.8, 2, 4.9, 5, 0.2].map((t) => `test('studio parity ${t}',(){compare(studioFrames(recipe,${t}),${literal(JSON.parse(JSON.stringify(studioFrames(recipe, t))))});});`).join("\n")}\ntest('precise text shares extended Studio cycle',(){const r=EffectRecipe(text:'X',color:'#ffffff',effect:'fade',fontSize:32,width:960,height:540,enter:.5,hold:1,exit:.5,distance:20,loop:true,motion:{'enabled':true},studio:{'enabled':true,'duration':20});final legacy=timelineFor(r).duration;expect(pageAt(r,legacy+.5).active,false);expect(evaluate(r,legacy+.5)['opacity'],0);expect(pageAt(r,20.1).active,pageAt(r,.1).active);});\ntestWidgets('studio widgets, interactions and events',(tester)async{final c=EffectController(recipe);final events=<String>[];c.onEvent((e)=>events.add(e['name']));c.seek(1);expect(events,isEmpty);await tester.pumpWidget(Directionality(textDirection:TextDirection.ltr,child:TextEffect(controller:c)));c.setData({'targetX':500,'label':'GO','tint':'#ffaa00'});expect(c.studio.frames(c.time).firstWhere((f)=>f['id']=='button')['widget']['label'],'GO');expect(c.studio.frames(c.time).firstWhere((f)=>f['id']=='button')['style']['color'],'#ffaa00');expect(c.studio.frames(c.time).firstWhere((f)=>f['id']=='sparks')['x'],500);c.setNodeState('button','pressed');c.advance(.2);expect(c.studio.frames(c.time).firstWhere((f)=>f['id']=='button')['style']['scale'],.94);c.restart();c.advance(.6);expect(events,['damage']);await tester.pump();expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox());c.dispose();});}`,
      );
    }
    console.log(target, dir);
  }

if (!process.argv.includes("--generate-only")) {
  const run = async (
    command: string,
    args: string[],
    cwd: string,
    label: string,
  ) => {
    try {
      const result = await promisify(execFile)(command, args, {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
        timeout: 600000,
      });
      await writeFile(
        join(output, label + ".log"),
        result.stdout + "\n" + result.stderr,
      );
      console.log(label, "passed");
    } catch (error: any) {
      await writeFile(
        join(output, label + ".log"),
        (error.stdout ?? "") + "\n" + (error.stderr ?? ""),
      );
      throw error;
    }
  };
  if (!process.argv.includes("--skip-build")) {
    for (const target of ["phaser", "three"]) {
      const dir = join(output, target);
      try {
        await symlink(
          resolve("node_modules"),
          join(dir, "node_modules"),
          "dir",
        );
      } catch (error: any) {
        if (error.code !== "EEXIST") throw error;
      }
      await run("npm", ["run", "build"], dir, target + "-build");
    }
    const flutter = join(output, "flutter");
    await run("flutter", ["pub", "get", "--offline"], flutter, "flutter-pub");
    await run("flutter", ["analyze", "--no-pub"], flutter, "flutter-analyze");
    await run(
      "flutter",
      ["test", "--no-pub", "test/studio_test.dart", "--reporter", "expanded"],
      flutter,
      "flutter-studio-test",
    );
    await run(
      "flutter",
      [
        "build",
        "web",
        "--no-pub",
        "--no-web-resources-cdn",
        "--no-wasm-dry-run",
      ],
      flutter,
      "flutter-build",
    );
    await run(
      "flutter",
      ["pub", "get", "--offline"],
      join(flutter, "adapters/flame"),
      "flame-pub",
    );
    await run(
      "flutter",
      ["analyze", "--no-pub"],
      join(flutter, "adapters/flame"),
      "flame-analyze",
    );
    await run(
      "flutter",
      ["test", "--no-pub", "--reporter", "expanded"],
      join(flutter, "adapters/flame"),
      "flame-test",
    );
  }
  const threeDir = join(output, "three");
  let instancedMain = await readFile(join(threeDir, "src/main.ts"), "utf8");
  instancedMain = instancedMain
    .replace(
      "new SceneEffect(recipe, images)",
      'new SceneEffect(recipe, images, {particleRenderer:"instanced"})',
    )
    .replace(
      "const scene = new THREE.Scene();",
      'recipe.studio!.space="world"; const scene = new THREE.Scene();',
    );
  assert(instancedMain.includes('particleRenderer:"instanced"'));
  await writeFile(join(threeDir, "src/instanced.ts"), instancedMain);
  await build({
    entryPoints: [join(threeDir, "src/instanced.ts")],
    bundle: true,
    outfile: join(threeDir, "instanced.js"),
  });
  await writeFile(
    join(threeDir, "instanced.html"),
    (await readFile(join(threeDir, "index.html"), "utf8")).replace(
      'src="app.js"',
      'src="instanced.js"',
    ),
  );
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".png": "image/png",
    ".ttf": "font/ttf",
  };
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(
        new URL(req.url!, "http://localhost").pathname,
      );
      const file = resolve(
        output,
        "." + (path.endsWith("/") ? path + "index.html" : path),
      );
      if (!file.startsWith(output + "/")) {
        res.writeHead(403).end();
        return;
      }
      const ext = file.slice(file.lastIndexOf("."));
      res.setHeader("Content-Type", mime[ext] ?? "application/octet-stream");
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number },
    base = "http://127.0.0.1:" + address.port;
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const report: Record<string, unknown> = {};
  try {
    for (const target of ["phaser", "three", "flutter", "three-instanced"]) {
      const page = await browser.newPage({
          viewport: { width: 960, height: 540 },
        }),
        errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error" && /THREE|WebGL|shader|ERROR/.test(m.text()))
          errors.push(m.text());
      });
      await page.route("**/*", (route) =>
        route.request().url().startsWith(base)
          ? route.continue()
          : route.abort(),
      );
      await page.goto(
        target === "three-instanced"
          ? base + "/three/instanced.html"
          : base + "/" + target + (target === "flutter" ? "/build/web/" : "/"),
      );
      await page.waitForFunction(() => !!(window as any).gametool, undefined, {
        timeout: 180000,
      });
      await page.evaluate(() => {
        const api = (window as any).gametool;
        api.pause();
        api.seek(1);
        api.setData({ targetX: 510, label: "GO" });
        api.setQuality({ instances: 3, particleBudget: 30 });
      });
      await page.waitForTimeout(250);
      const state = await page.evaluate(() =>
        JSON.parse((window as any).gametool.snapshot()),
      );
      assert.equal(
        state.studio.nodes.find((n: any) => n.id === "button").widget.label,
        "GO",
      );
      assert.equal(
        state.studio.nodes.find((n: any) => n.id === "sparks").x,
        510,
      );
      assert.equal(state.studio.quality.instances, 3);
      await page.screenshot({ path: join(output, target + ".png") });
      const profile = await page.evaluate(() =>
        JSON.parse((window as any).gametool.profile()),
      );
      assert.equal(profile.instances, 3);
      assert.equal(profile.estimatedParticles, 30);
      assert.deepEqual(errors, []);
      report[target] = { nodes: state.studio.nodes.length, profile, errors };
      await page.close();
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  }
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log("Studio runtime build / parity / browser smoke passed");
}
