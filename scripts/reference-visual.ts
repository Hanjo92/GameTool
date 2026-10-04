import { particleStyles, defaultParticleOptions } from "../runtimes/shared/particle-options.js";
/** Render audited recipes through the actual Phaser and Three components, offline. */
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join, resolve, dirname, extname } from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import sharp from "sharp";
import { referencePresets } from "../packages/core/reference-presets.js";
import { recipeSchema, defaultRecipe } from "../packages/core/model.js";
import {
  defaultBackground,
  backgroundMotions,
  imageFilters,
  defaultParticles,
  defaultFrame,
  defaultTypography,
} from "../runtimes/shared/motion.js";
import { timelineFor } from "../runtimes/shared/sequence.js";
import { bundleFonts } from "../packages/generators/fonts.js";
const particleOnly = process.argv.includes("--particles-only");
const root = resolve("."),
  out = join(root, particleOnly ? "output/validation/particle-gallery" : "output/validation/reference-gallery");
await mkdir(out, { recursive: true });
const cases = referencePresets.map((p) => ({
  id: p.id,
  name: p.name,
  recipe: recipeSchema.parse({ ...p.recipe, loop: false }),
}));
for (const motion of backgroundMotions)
  cases.push({
    id: "background-" + motion,
    name: motion,
    recipe: recipeSchema.parse({
      ...defaultRecipe,
      loop: false,
      textVisible: false,
      background: {
        ...defaultBackground,
        enabled: true,
        assetId: "00000000-0000-4000-8000-000000000001",
        assetIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        profile: "reference",
        motion,
      },
    }),
  });
for (const filter of imageFilters)
  cases.push({
    id: "filter-" + filter,
    name: filter,
    recipe: recipeSchema.parse({
      ...defaultRecipe,
      loop: false,
      textVisible: false,
      background: {
        ...defaultBackground,
        enabled: true,
        assetId: "00000000-0000-4000-8000-000000000001",
        filter,
        motion: "none",
        profile: "reference",
      },
    }),
  });
for (const style of [
  "title",
  "box",
  "corners",
  "band",
  "tape",
  "lines",
  "underline",
  "sides",
  "bar",
] as const)
  cases.push({
    id: "decoration-" + style,
    name: style,
    recipe: recipeSchema.parse({
      ...referencePresets[0].recipe,
      text: "GAME TOOL",
      loop: false,
      frame: {
        ...defaultFrame,
        enabled: true,
        style,
        fillOpacity: 0.6,
        extend: 1,
      },
    }),
  });
for (const preset of ["snow", "sparks", "confetti"] as const)
  cases.push({
    id: "particles-" + preset,
    name: preset,
    recipe: recipeSchema.parse({
      ...defaultRecipe,
      textVisible: false,
      loop: false,
      particles: { ...defaultParticles, enabled: true, preset },
    }),
  });
if (particleOnly) cases.splice(0);
for (const style of particleStyles) cases.push({
  id: 'advanced-' + style.id, name: style.name,
  recipe: recipeSchema.parse({ ...defaultRecipe, textVisible: false, loop: false,
    enter: 0, hold: 4, exit: .6, width: 960, height: 540,
    particles: { ...defaultParticles, ...defaultParticleOptions, ...style.settings, enabled: true, advanced: true },
  }),
});
if (particleOnly) cases.push({ id: 'advanced-circle', name: '발광 구체', recipe: recipeSchema.parse({
  ...cases[5].recipe, particles: { ...cases[5].recipe.particles, shape: 'circle' },
}) });
await writeFile(join(out, "recipes.json"), JSON.stringify(cases));
let css = "";
const registrations = new Map<string, any>();
for (const c of cases) {
  const fonts = await bundleFonts(c.recipe);
  for (const [p, data] of Object.entries(fonts.files)) {
    const path = join(out, p);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }
  for (const f of fonts.registrations) registrations.set(f.path, f);
}
for (const f of registrations.values())
  css += `@font-face{font-family:${f.family};src:url("${f.path}");font-weight:${f.variable ? "100 900" : f.weight || 400};font-style:${f.italic ? "italic" : "normal"}}\n`;
for (const f of ["Sans", "Serif"]) {
  await copyFile(
    join(root, `assets/fonts/Noto${f}KR.ttf`),
    join(out, `Noto${f}KR.ttf`),
  );
  css += `@font-face{font-family:GameTool${f};src:url(Noto${f}KR.ttf);font-weight:100 900}`;
}
await writeFile(
  join(out, "index.html"),
  `<!doctype html><meta charset="utf-8"><style>${css}html,body{margin:0;background:#0b0e13}canvas{display:block;width:960px!important;height:540px!important}</style><div id="host"></div><script type="module" src="app.js"></script>`,
);
const entry = `import Phaser from 'phaser';import * as THREE from 'three';import {SceneEffect as PhaserEffect} from '../../../runtimes/phaser/scene.ts';import {SceneEffect as ThreeEffect} from '../../../runtimes/three/scene.ts';import {filterImage} from '../../../runtimes/shared/filters.ts';import {fontFallback} from '../../../runtimes/shared/font-fallback.ts';import cases from './recipes.json';
const host=document.getElementById('host');const target=new URL(location.href).searchParams.get('target');let phaserScene,effect,renderer,scene,camera;
const first=document.createElement('canvas');first.width=960;first.height=540;const c=first.getContext('2d');const gradient=c.createLinearGradient(0,0,960,540);gradient.addColorStop(0,'#163250');gradient.addColorStop(1,'#db8550');c.fillStyle=gradient;c.fillRect(0,0,960,540);c.fillStyle='#efd375';c.beginPath();c.arc(740,140,72,0,Math.PI*2);c.fill();c.fillStyle='#365279';c.beginPath();c.moveTo(0,500);c.lineTo(200,150);c.lineTo(490,470);c.lineTo(650,200);c.lineTo(960,520);c.closePath();c.fill();const second=filterImage(first,'night');const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002'];
if(target==='phaser')await new Promise(resolve=>{class Preview extends Phaser.Scene{create(){phaserScene=this;resolve();}}new Phaser.Game({type:Phaser.WEBGL,parent:host,width:1280,height:720,transparent:true,scene:Preview,banner:false,audio:{noAudio:true}});});else{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});renderer.setSize(1280,720);host.appendChild(renderer.domElement);scene=new THREE.Scene();camera=new THREE.OrthographicCamera(-640,640,360,-360,.1,100);camera.position.z=10;}
window.audit={async render(index,time){const r=cases[index].recipe;if(effect)effect.dispose();const layout=r.layout;const fonts=[['GameToolSans',700],['GameToolSerif',700],[layout.font,layout.weight],[layout.subFont==='same'?layout.font:layout.subFont,layout.subWeight]];for(const [id,w]of [...fonts])if(fontFallback[id])fonts.push([fontFallback[id],w]);await Promise.all(fonts.map(([id,w])=>document.fonts.load(w+' 64px '+(id.startsWith('GameTool')?id:'GameToolFont_'+id))));const images=new Map([[ids[0],first],[ids[1],second]]);if(r.background.filter!=='none')for(const[id,image]of [...images])images.set(id+':background',filterImage(image,r.background.filter));if(target==='phaser'){phaserScene.scale.resize(r.width,r.height);effect=new PhaserEffect(phaserScene,r,images);}else{camera.left=-r.width/2;camera.right=r.width/2;camera.top=r.height/2;camera.bottom=-r.height/2;camera.updateProjectionMatrix();effect=new ThreeEffect(r,images);scene.add(effect.object);}effect.seek(time);if(renderer)renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return effect.snapshot();}};
`;
await writeFile(join(out, "entry.ts"), entry);
await build({
  entryPoints: [join(out, "entry.ts")],
  outfile: join(out, "app.js"),
  bundle: true,
  format: "esm",
  target: "es2022",
});
const server = createServer(async (req, res) => {
  try {
    const p = resolve(
      out,
      "." + decodeURIComponent((req.url ?? "/").split("?")[0]),
    );
    if (!p.startsWith(out + "/") && p !== out) throw 0;
    const file = p === out ? join(out, "index.html") : p;
    res.setHeader(
      "Content-Type",
      (
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".ttf": "font/ttf",
          ".json": "application/json",
        } as any
      )[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report: any = { cases: cases.length, targets: {} };
try {
  for (const target of ["phaser", "three"]) {
    const page = await browser.newPage({
        viewport: { width: 960, height: 540 },
        deviceScaleFactor: 1,
      }),
      errors: string[] = [],
      external: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === origin)
        return route.continue();
      external.push(route.request().url());
      return route.abort();
    });
    await page.goto(origin + "/?target=" + target);
    await page
      .waitForFunction(() => !!(window as any).audit, {}, { timeout: 60000 })
      .catch((e) => {
        throw new Error(JSON.stringify({ errors, external, cause: e.message }));
      });
    const captures = [];
    for (let i = 0; i < cases.length; i++) {
      const r = cases[i].recipe,
        tl = timelineFor(r),
        t =
          particleOnly ? .6 : r.sequence?.reveal === "scroll"
            ? tl.duration / 2
            : r.motion.enabled || r.sequence.mode === "trailer"
              ? tl.pages[0].inEnd + Math.min(0.2, r.hold / 2)
              : r.enter + r.hold / 2;
      await page.evaluate(
        async ({ i, t }) => (window as any).audit.render(i, t),
        { i, t },
      );
      const png = await page
        .locator("canvas")
        .first()
        .screenshot({ path: join(out, `${target}-${i}.png`) });
      const stats = await sharp(png).stats();
      assert.ok(
        stats.channels.some((c) => c.stdev > 1),
        `${target} ${cases[i].id}: blank image`,
      );
      captures.push({ id: cases[i].id, time: t });
      if (particleOnly || (i < 80 && i % 5 === 0)) {
        await page.evaluate(
          async (i) => (window as any).audit.render(i, 0.25),
          i,
        );
        const before = await page.locator("canvas").first().screenshot();
        await page.evaluate(
          async (i) => (window as any).audit.render(i, 1.8),
          i,
        );
        await page.evaluate(
          async (i) => (window as any).audit.render(i, 0.25),
          i,
        );
        assert.deepEqual(
          await page.locator("canvas").first().screenshot(),
          before,
          `${target} ${cases[i].id}: reverse seek pixels`,
        );
      }
      if (particleOnly) for (const time of [.15, 1.2, 2.7]) {
        await page.evaluate(async ({i,t}) => (window as any).audit.render(i,t), {i,t:time});
        await page.locator('canvas').first().screenshot({path:join(out,`${target}-${i}-${time}.png`)});
      }
      if (i % 20 === 0) console.log(target, i, cases.length);
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    report.targets[target] = {
      captures,
      errors,
      external,
      reverseSeekChecks: particleOnly ? cases.length : 16,
    };
    await page.close();
  }
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  console.log("reference visuals passed", cases.length, "x 2 engines");
} finally {
  await browser.close();
  await new Promise<void>((r) => server.close(() => r()));
}
