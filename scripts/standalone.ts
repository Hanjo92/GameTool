import sharp from "sharp";
import { evaluate, frameAt } from "../runtimes/shared/motion.js";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { chromium } from "playwright";
import assert from "node:assert/strict";
/** Serve built examples with a plain static host after the GameTool service exits. */
export async function standalone(report: any) {
  const mime: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".wasm": "application/wasm",
    ".json": "application/json",
    ".ttf": "font/ttf",
  };
  const server = createServer(async (req, res) => {
    try {
      const [target, ...rest] = decodeURIComponent(
        (req.url ?? "/").split("?")[0],
      )
        .split("/")
        .slice(1);
      const a = report.targets[target];
      if (!a) throw new Error("not found");
      const dir = join(
        a.directory,
        target === "flutter" ? "build/web" : ".preview",
      );
      const file = resolve(dir, rest.join("/") || "index.html");
      if (!file.startsWith(resolve(dir) + "/")) throw new Error("path");
      res.setHeader(
        "Content-Type",
        mime[extname(file)] ?? "application/octet-stream",
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
  try {
    for (const target of Object.keys(report.targets)) {
      const page = await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
      const external: string[] = [];
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) => {
        if (new URL(route.request().url()).origin === origin)
          return route.continue();
        external.push(route.request().url());
        return route.abort();
      });
      await page.goto(`${origin}/${target}/`);
      await page.waitForFunction(
        () => !!(window as any).gametool,
        {},
        { timeout: 60000 },
      );
      const state = await page.evaluate(() => {
        const api = (window as any).gametool;
        api.seek(0.3);
        return JSON.parse(api.snapshot());
      });
      const recipe = JSON.parse(
        await readFile(
          join(report.targets[target].directory, "recipe.json"),
          "utf8",
        ),
      );
      assert.ok(Math.abs(state.opacity - evaluate(recipe, 0.3).opacity) < 1e-6);
      if(recipe.frame?.enabled) {
        // A dark preview excludes white checkerboard cells from edge measurement.
        await page.evaluate(()=>window.postMessage({type:"backdrop",value:"dark"},location.origin));
        const captures: {time:number;topPixels:number}[]=[];
        for(const time of [0,.05,.2,.6,1,recipe.enter+recipe.hold+.3,0.2]) {
          const snapshot=await page.evaluate(time=>{const api=(window as any).gametool;api.pause();api.seek(time);return JSON.parse(api.snapshot());},time);
          assert.ok(Math.abs(snapshot.frame.progress-frameAt(recipe,time).progress)<1e-6);
          await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const png=await page.screenshot({path:join(report.targets[target].directory,`frame-${captures.length}-${time.toFixed(2)}.png`)});
          const {data,info}=await sharp(png).removeAlpha().raw().toBuffer({resolveWithObject:true});
          const top=recipe.height/2-recipe.fontSize/2-recipe.frame.padding*recipe.fontSize;
          let topPixels=0;
          for(let x=recipe.frame.inset+2;x<recipe.width-recipe.frame.inset-2;x++) {
            let white=false;
            for(let y=Math.floor(top)-2;y<=Math.ceil(top)+2;y++) {
              const offset=(y*info.width+x)*info.channels;
              if(data[offset]>230 && data[offset+1]>230 && data[offset+2]>230) white=true;
            }
            if(white) topPixels++;
          }
          captures.push({time,topPixels});
        }
        assert.ok(captures[1].topPixels>captures[0].topPixels+100,`${target}: early top edge must visibly grow`);
        assert.ok(captures[3].topPixels>captures[1].topPixels+100,`${target}: completed top edge must be longer`);
        assert.equal(captures[2].topPixels,captures[6].topPixels,`${target}: reverse seek must reproduce pixels`);
        report.targets[target].frameCaptures=captures;
      }
      assert.deepEqual(external, []);
      assert.deepEqual(errors, []);
      await page.close();
      report.targets[target].standalone =
        "passed: GameTool service stopped; static host only; external network blocked";
    }
  } finally {
    await browser.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}
