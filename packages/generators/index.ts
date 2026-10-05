import {
  particleStyles,
  defaultParticleOptions,
} from "../../runtimes/shared/particle-options.js";
import { referencePresets } from "../core/reference-presets.js";
import { timelineFor } from "../../runtimes/shared/sequence.js";
import {
  defaultMotion,
  defaultSequence,
} from "../../runtimes/shared/options.js";
import { bundleFonts } from "./fonts.js";
import { filterPixels } from "../../runtimes/shared/filters.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Project, Target } from "../core/model.js";
import {
  evaluate,
  sceneSnapshot,
  assetIds,
  defaultBackground,
  defaultParticles,
  backgroundMotions,
  imageFilters,
  textMotions,
  holdMotions,
  defaultTypography,
  defaultFrame,
  type Recipe,
} from "../../runtimes/shared/motion.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const versions = {
  flutter: "3.38.7",
  phaser: "3.90.0",
  three: "0.186.1",
};
const template = (path: string) =>
  readFile(join(root, "runtimes", path), "utf8");
/** Serialize literal text, including Dart interpolation markers, without emitting code. */
export const dartString = (value: string) =>
  JSON.stringify(value).replace(/\$/g, "\\$");
const dartLiteral = (value: unknown): string => {
  if (typeof value === "string") return dartString(value);
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(dartLiteral).join(",")}]`;
  if (typeof value === "object")
    return `{${Object.entries(value!)
      .map(([k, v]) => `${dartString(k)}:${dartLiteral(v)}`)
      .join(",")}}`;
  return String(value);
};
const dartRecipe = (r: Recipe) =>
  `EffectRecipe(${Object.entries(r)
    .filter(([k]) => k !== "schemaVersion")
    .map(([k, v]) => `${k}: ${dartLiteral(v)},`)
    .join("\n")})`;
const bridge = `
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent) return;
  const m = event.data;
  if(m?.type === 'backdrop' && ['transparent','dark','white','gray','image'].includes(m.value)) {
    const background=m.value==='image'&&typeof m.image==='string'&&new RegExp('^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$').test(m.image)?'center / contain no-repeat url("'+m.image+'") #333':m.value==='gray'?'#777777':m.value==='transparent'?'repeating-conic-gradient(#d7dce4 0% 25%,#f5f7fa 0% 50%) 0 / 24px 24px':m.value==='white'?'#ffffff':'#11171b';
    document.documentElement.style.background=background;document.body.style.background='transparent';
    return;
  }
  if(!window.gametool)return;
  if (m?.type === 'seek' && Number.isFinite(m.time) && m.time >= 0) window.gametool.seek(m.time);
  if (m?.type === 'play') window.gametool.play();
  if (m?.type === 'pause') window.gametool.pause();
  if (m?.type === 'restart') window.gametool.restart();
  if (m?.type === 'set-data' && m.data && typeof m.data === 'object') window.gametool.setData(m.data);
  if (m?.type === 'set-node-state') window.gametool.setNodeState(m.nodeId,m.state);
  if (m?.type === 'set-quality') window.gametool.setQuality(m.quality);
});
setInterval(() => { if (window.gametool) { parent.postMessage({ type: 'gametool-state', state: JSON.parse(window.gametool.snapshot()) }, location.origin); if(window.gametool.events)for(const event of JSON.parse(window.gametool.events()))parent.postMessage({type:'gametool-event',event},location.origin); } }, 100);
`;
const previewCss =
  "@font-face{font-family:GameToolSerif;src:url(assets/NotoSerifKR.ttf);font-weight:100 900;}@font-face{font-family:GameToolSans;src:url(assets/NotoSansKR.ttf);font-weight:100 900;}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}html{background:repeating-conic-gradient(#d7dce4 0% 25%,#f5f7fa 0% 50%) 0 / 24px 24px}body{display:flex;align-items:center;justify-content:center}canvas{display:block}";

/** Produce complete source files. No user supplied source is evaluated. */
export async function generate(
  project: Project,
  target: Target,
): Promise<Record<string, string | Uint8Array>> {
  const r = project.recipe;
  const fonts = await bundleFonts(r);
  const extraCss = fonts.registrations
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url("${f.path}");font-weight:${f.variable ? "100 900" : f.weight || 400};font-style:${f.italic ? "italic" : "normal"};}`,
    )
    .join("");
  const files: Record<string, string | Uint8Array> = {
    ...fonts.files,
    "recipe.json": JSON.stringify(r, null, 2) + "\n",
    "assets/NotoSansKR.ttf": await readFile(
      join(root, "assets/fonts/NotoSansKR.ttf"),
    ),
    "assets/NotoSerifKR.ttf": await readFile(
      join(root, "assets/fonts/NotoSerifKR.ttf"),
    ),
    "assets/OFL-Serif.txt": await readFile(
      join(root, "assets/fonts/OFL-Serif.txt"),
      "utf8",
    ),
    "assets/OFL.txt": await readFile(
      join(root, "assets/fonts/OFL.txt"),
      "utf8",
    ),
    "README.md": `# GameTool ${target} layered effect\n\nGenerated from revision ${project.revision}. Target SDK: ${versions[target]}.\n\nThis effect runs without GameTool, MCP, an API key or a server connection.\n\n${
      target === "flutter"
        ? "Copy all lib files except lib/main.dart into your Flutter app. Create EffectController(recipe), pass it to TextEffect, and call play/pause/seek/restart. The widget owns its ticker. Dispose the controller from its parent. Change text/color via widget properties. lib/main.dart is a web preview example, not required by native apps.\n\nStandalone example: flutter pub get; flutter run -d chrome.\n"
        : target === "phaser"
          ? "Copy all src files and assets. Await loadImages(recipe), then construct new SceneEffect(scene, recipe, images); call effect.playback.play(), pause(), restart() or effect.seek(seconds). The component subscribes to Scene update and cleans up on shutdown; dispose() is idempotent. effect.setText(text, color) changes content.\n"
          : "Copy all src files and assets. Await loadImages(recipe), then construct new SceneEffect(recipe, images). Add effect.object to your scene and call effect.update(deltaSeconds) exactly once per host frame. Call effect.playback.play()/pause()/restart(), effect.seek(seconds), and effect.setText(text, color). Use an orthographic camera spanning the logical viewport. dispose() releases only effect-owned resources.\n"
    }
${target !== "flutter" ? "\nStandalone example: npm install; npm run build; npm start. Open localhost:8080. Dependencies are needed at installation only.\n" : ""}\nThe bundled Noto Sans KR font is distributed under SIL OFL (assets/OFL.txt). Keep the font registration from the example or supply your own local font. Font metrics can differ by platform. No fonts or images are downloaded at runtime. Preserve hand edits outside generated files; regeneration writes a new artifact.\n`,
  };
  if (target === "flutter") {
    const pixelFixture = Uint8ClampedArray.from(
      Array.from({ length: 4 * 4 * 4 }, (_, i) =>
        i % 4 === 3 ? 255 : (i * 37) % 256,
      ),
    );
    const fixtures: Recipe[] = [
      ...referencePresets.map((p) => p.recipe),
      ...[
        "linear",
        "in",
        "out",
        "smooth",
        "strong",
        "back",
        "elastic",
        "bounce",
      ].map((ease) => ({
        ...r,
        motion: {
          ...defaultMotion,
          enabled: true,
          inEase: ease,
          outEase: ease,
          inStagger: 0.06,
          outStagger: 0.08,
        },
        typography: { ...defaultTypography, enabled: true, subText: "SUB" },
      })),
      ...["lr", "rl", "tb", "bt", "center", "v", "h"].map((direction) => ({
        ...r,
        motion: {
          ...defaultMotion,
          enabled: true,
          inDirection: direction,
          outDirection: direction,
        },
        typography: {
          ...defaultTypography,
          enabled: true,
          entrance: "wipe" as const,
          departure: "unfold" as const,
        },
      })),
      ...["char", "line", "sweep", "all", "solo", "spread", "scroll"].map(
        (reveal) => ({
          ...r,
          text: "A,B\nC\n\nNEXT",
          sequence: { ...defaultSequence, mode: "trailer", reveal },
          motion: { ...defaultMotion, enabled: true },
          typography: { ...defaultTypography, enabled: true },
        }),
      ),
      ...backgroundMotions.map((motion) => ({
        ...r,
        background: {
          ...defaultBackground,
          enabled: true,
          motion,
          profile: "reference" as const,
          fadeDirection: "in" as const,
        },
      })),
      ...(["draw", "fade", "none"] as const).flatMap((animation) =>
        [0, 0.05, 0.2, 0.6, 1, 3.3, 3.6].map((time) => ({
          ...r,
          enter: 1,
          hold: 2,
          exit: 0.6,
          loop: false,
          frame: { ...defaultFrame, enabled: true, animation, duration: time },
        })),
      ),
      ...textMotions.map((entrance) => ({
        ...r,
        typography: { ...defaultTypography, enabled: true, entrance },
      })),
      ...holdMotions.map((holdMotion) => ({
        ...r,
        enter: 0,
        hold: 3,
        typography: { ...defaultTypography, enabled: true, holdMotion },
      })),
      ...backgroundMotions.map((motion) => ({
        ...r,
        background: {
          ...defaultBackground,
          enabled: true,
          motion,
          amount: 0.7,
          fade: true,
        },
        particles: { ...defaultParticles, enabled: false },
      })),
      ...particleStyles.map((style) => ({
        ...r,
        particles: {
          ...defaultParticles,
          ...defaultParticleOptions,
          ...style.settings,
          advanced: true,
          enabled: true,
          count: 8,
          seed: 2147483645,
        },
      })),
      ...(["snow", "sparks", "confetti"] as const).flatMap((preset) =>
        (["continuous", "burst"] as const).map((emission) => ({
          ...r,
          particles: {
            ...defaultParticles,
            enabled: true,
            preset,
            emission,
            count: 8,
            seed: 2147483645,
          },
        })),
      ),
    ];
    files["lib/font_fallback.dart"] = await template(
      "flutter/font_fallback.dart",
    );
    files["lib/decoration.dart"] = await template("flutter/decoration.dart");
    files["lib/options.dart"] = await template("flutter/options.dart");
    files["lib/sequence.dart"] = await template("flutter/sequence.dart");
    files["lib/typography.dart"] = await template("flutter/typography.dart");
    files["lib/filters.dart"] = await template("flutter/filters.dart");
    files["lib/motion.dart"] = await template("flutter/motion.dart");
    files["lib/layers.dart"] = await template("flutter/layers.dart");
    files["lib/effect.dart"] = await template("flutter/effect.dart");
    files["lib/studio.dart"] = await template("flutter/studio.dart");
    files["analysis_options.yaml"] =
      "analyzer:\n  exclude:\n    - adapters/**\n";
    files["adapters/flame/lib/gametool_flame.dart"] = await template(
      "flutter/flame_effect.dart",
    );
    files["adapters/flame/pubspec.yaml"] =
      "name: gametool_flame\npublish_to: none\nenvironment:\n  sdk: '>=3.10.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\n  flame: 1.35.0\n  gametool_effect:\n    path: ../..\n";
    files["adapters/flame/analysis_options.yaml"] =
      "analyzer:\n  exclude: []\n";
    files["adapters/flame/pubspec.yaml"] +=
      "dev_dependencies:\n  flutter_test:\n    sdk: flutter\n";
    files["adapters/flame/test/component_test.dart"] =
      "import 'dart:ui' as ui;\nimport 'package:flutter_test/flutter_test.dart';\nimport 'package:gametool_effect/motion.dart';\nimport 'package:gametool_effect/recipe.dart';\nimport 'package:gametool_flame/gametool_flame.dart';\nvoid main(){test('Flame component advances and paints independently',(){final c=EffectController(recipe)..play();final component=GameToolEffectComponent(controller:c);component.update(.25);expect(c.time,.25);final recorder=ui.PictureRecorder();component.render(ui.Canvas(recorder));recorder.endRecording().dispose();c.dispose();});}\n";
    files["adapters/flame/README.md"] =
      "# Optional Flame component\n\nAdd this adapter as a path dependency to your Flame game. The ordinary generated Flutter package has no Flame dependency. Await loadSceneImages(recipe), construct EffectController(recipe), then add GameToolEffectComponent(controller: controller, images: images). Do not mount TextEffect using the same controller simultaneously: the component owns frame advancement. The host owns controller and image disposal. Forward tap events in component-local coordinates via component.pointer('down'/'up'/'cancel', localPosition); subscribe with controller.onEvent. Validate independently with flutter pub get and flutter analyze from this directory.\n";

    files["lib/recipe.dart"] =
      `import 'motion.dart';\nconst recipe = EffectRecipe(\n${Object.entries(r)
        .filter(([k]) => k !== "schemaVersion")
        .map(([k, v]) => `  ${k}: ${dartLiteral(v)},`)
        .join("\n")}\n);\n`;
    files["pubspec.yaml"] =
      `name: gametool_effect\npublish_to: none\nversion: 1.0.0\nenvironment:\n  sdk: '>=3.10.0 <4.0.0'\ndependencies:\n  flutter:\n    sdk: flutter\ndev_dependencies:\n  flutter_test:\n    sdk: flutter\nflutter:\n  uses-material-design: false\n${assetIds(r).length ? "  assets:\n    - assets/images/\n" : ""}  fonts:\n    - family: GameToolSerif\n      fonts:\n        - asset: assets/NotoSerifKR.ttf\n    - family: GameToolSans\n      fonts:\n        - asset: assets/NotoSansKR.ttf\n    # CanvasKit requires this fallback family; reuse the bundled OFL font.\n    - family: Roboto\n      fonts:\n        - asset: assets/NotoSansKR.ttf\n`;
    files["pubspec.yaml"] += [
      ...new Set(fonts.registrations.map((f) => f.family)),
    ]
      .map(
        (family) =>
          `    - family: ${family}\n      fonts:\n${fonts.registrations
            .filter((f) => f.family === family)
            .map(
              (f) =>
                `        - asset: ${f.path}\n${f.weight ? `          weight: ${f.weight}\n` : ""}${f.italic ? "          style: italic\n" : ""}`,
            )
            .join("")}`,
      )
      .join("");
    files["web/index.html"] =
      `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${previewCss}${extraCss}</style></head><body><script>${bridge}</script><script src="flutter_bootstrap.js" async></script></body></html>`;
    files["web/flutter_bootstrap.js"] =
      `{{flutter_js}}\n{{flutter_build_config}}\n_flutter.loader.load({config:{canvasKitBaseUrl:"canvaskit/",fontFallbackBaseUrl:"fonts/"}});`;
    files["lib/main.dart"] = `import 'dart:convert';
import 'dart:js_interop';
import 'dart:js_interop_unsafe';
import 'package:flutter/material.dart';
import 'effect.dart';
import 'motion.dart';
import 'recipe.dart';
import 'layers.dart';
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final images=await loadSceneImages(recipe);
  final controller = EffectController(recipe)..seek(recipe.enter);
  final events=<Map<String,dynamic>>[];
  controller.onEvent((event){events.add(event);if(events.length>256)events.removeAt(0);});
  globalContext.setProperty('gametool'.toJS, <String, Object>{
    'seek': ((JSNumber t) => controller.seek(t.toDartDouble)).toJS,
    'play': (() => controller.play()).toJS,
    'pause': (() => controller.pause()).toJS,
    'events': (() {final pending=jsonEncode(events);events.clear();return pending.toJS;}).toJS,
    'restart': (() => controller.restart()).toJS,
    'setData': ((JSObject data) => controller.setData(Map<String,dynamic>.from(data.dartify() as Map))).toJS,
    'setNodeState': ((JSString id, JSString state) => controller.setNodeState(id.toDart,state.toDart)).toJS,
    'setQuality': ((JSObject quality) => controller.setQuality(Map<String,dynamic>.from(quality.dartify() as Map))).toJS,
    'hitTest': ((JSNumber x,JSNumber y)=>controller.hitTest(x.toDartDouble,y.toDartDouble)?.toJS).toJS,
    'pointer': ((JSString type,JSNumber x,JSNumber y)=>controller.pointer(type.toDart,x.toDartDouble,y.toDartDouble)?.toJS).toJS,
    'profile': (() => jsonEncode(controller.profile()).toJS).toJS,
    'snapshot': (() => jsonEncode({...sceneSnapshot(recipe,controller.time),'studio':controller.studio.snapshot(controller.time)}).toJS).toJS,
  }.jsify());
  runApp(Directionality(textDirection: TextDirection.ltr, child: ColoredBox(color: const Color(0x00000000),
    child: Center(child: TextEffect(controller: controller,images:images)))));
}
`;
    files["test/effect_test.dart"] = `import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:gametool_effect/effect.dart';
import 'package:gametool_effect/motion.dart';
import 'package:gametool_effect/recipe.dart';
import 'package:gametool_effect/layers.dart';
import 'dart:convert';
import 'dart:typed_data';
import 'package:gametool_effect/filters.dart' as filters;
void main() {
  void compare(dynamic actual,dynamic expected) {
    if(expected is num) {expect(actual,closeTo(expected,0.00001));}
    else if(expected is List) {expect(actual.length,expected.length);for(var i=0;i<expected.length;i++){compare(actual[i],expected[i]);}}
    else {for(final key in (expected as Map).keys){compare(actual[key],expected[key]);}}
  }
  test('absolute scene fixture', () {
    final expected=jsonDecode(${dartString(JSON.stringify(sceneSnapshot(r, r.enter + r.hold / 2)))}) as Map<String,dynamic>;
    compare(sceneSnapshot(recipe,recipe.enter+recipe.hold/2),expected);
  });
  ${[0, 0.05, 0.2, 0.6, 1, 3.7, 4.2].map((time) => `test('frame and glyph timeline ${time}', () { compare(sceneSnapshot(recipe,${time}),jsonDecode(${dartString(JSON.stringify(sceneSnapshot(r, time)))})); });`).join("\n")}
  ${fixtures.map((fixture, i) => `test('cross-language background/particle mode ${i}', () { const r=${dartRecipe(fixture)}; compare(sceneSnapshot(r,0.9),jsonDecode(${dartString(JSON.stringify(sceneSnapshot(fixture, 0.9)))})); });`).join("\n")}
  ${particleStyles
    .map((style) => {
      const f: Recipe = {
        ...r,
        textVisible: false,
        loop: false,
        enter: 0,
        hold: 4,
        exit: 0.6,
        motion: { ...defaultMotion, enabled: false },
        sequence: { ...r.sequence!, mode: "message" },
        typography: { ...defaultTypography, enabled: false },
        particles: {
          ...defaultParticles,
          ...defaultParticleOptions,
          ...style.settings,
          enabled: true,
          advanced: true,
          count: 12,
        },
      };
      return `testWidgets('advanced particles ${style.id}: timeline and painter', (tester) async {const r=${dartRecipe(f)};final c=EffectController(r);await tester.pumpWidget(Directionality(textDirection:TextDirection.ltr,child:TextEffect(controller:c)));${[0, 0.15, 0.6, 1.2, 2.6, 4.6, 0.15].map((t) => `c.seek(${t});await tester.pump();compare(sceneSnapshot(r,${t}),jsonDecode(${dartString(JSON.stringify(sceneSnapshot(f, t)))}));expect(tester.takeException(),isNull);`).join("")}await tester.pumpWidget(const SizedBox());c.dispose();});`;
    })
    .join("\n")}
  ${imageFilters.map((filter) => `test('pixel filter ${filter}', () {final bytes=Uint8List.fromList(${JSON.stringify(Array.from(pixelFixture))});final expected=${JSON.stringify(Array.from(filterPixels(pixelFixture, 4, 4, filter)))};final actual=filters.filterPixels(bytes,4,4,'${filter}');for(var i=0;i<expected.length;i++){expect(actual[i],closeTo(expected[i],1));}});`).join("\n")}
  ${referencePresets
    .map((p, i) => {
      const f = { ...p.recipe, loop: false },
        timeline = timelineFor(f),
        times = [
          0,
          timeline.pages[0].textStart + 0.2,
          timeline.pages[0].inEnd + 0.1,
          timeline.pages[0].outStart + 0.2,
          timeline.duration,
        ];
      return `testWidgets('reference composition ${i}: numeric timeline and painter', (tester) async {const r=${dartRecipe(f)};expect(r.duration,closeTo(${timeline.duration},.00001));${times.map((t) => `compare(sceneSnapshot(r,${t}),jsonDecode(${dartString(JSON.stringify(sceneSnapshot(f, t)))}));`).join("")}final c=EffectController(r)..seek(${timeline.pages[0].inEnd + 0.1});await tester.pumpWidget(Directionality(textDirection:TextDirection.ltr,child:TextEffect(controller:c)));expect(tester.takeException(),isNull);await tester.pumpWidget(const SizedBox());c.dispose();});`;
    })
    .join("\n")}
  testWidgets('generated widget renders, seeks and unmounts', (tester) async {
    final c = EffectController(recipe)..seek(recipe.enter);
    await tester.pumpWidget(Directionality(textDirection: TextDirection.ltr, child: TextEffect(controller: c)));
    expect(find.text(recipe.text), recipe.textVisible && recipe.typography['enabled']!=true ? findsOneWidget : findsNothing);
    if(recipe.textVisible && recipe.typography['enabled']!=true) expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, closeTo(${evaluate(r, r.enter).opacity}, 0.00001));
    c.seek(recipe.enter / 2); await tester.pump();
    if(recipe.textVisible && recipe.typography['enabled']!=true) expect(tester.widget<Opacity>(find.byType(Opacity)).opacity, closeTo(${evaluate(r, r.enter / 2).opacity}, 0.00001));
    await tester.pumpWidget(const SizedBox()); c.dispose();
    expect(tester.takeException(), isNull);
  });
}
`;
  } else {
    if (target === "three")
      files["src/world-particles.ts"] = (
        await template("three/world-particles.ts")
      ).replaceAll("../shared/", "./");
    files["src/studio-types.ts"] = await template("shared/studio-types.ts");
    files["src/studio.ts"] = await template("shared/studio.ts");
    files["src/studio-painter.ts"] = await template("shared/studio-painter.ts");
    files["src/decoration.ts"] = await template("shared/decoration.ts");
    files["src/font-fallback.ts"] = await template("shared/font-fallback.ts");
    files["src/particle-options.ts"] = await template(
      "shared/particle-options.ts",
    );
    files["src/options.ts"] = await template("shared/options.ts");
    files["src/sequence.ts"] = await template("shared/sequence.ts");
    files["src/typography.ts"] = await template("shared/typography.ts");
    files["src/filters.ts"] = await template("shared/filters.ts");
    files["src/layers.ts"] = await template("shared/layers.ts");
    files["src/scene.ts"] = (await template(`${target}/scene.ts`)).replaceAll(
      "../shared/",
      "./",
    );
    files["src/motion.ts"] = await template("shared/motion.ts");
    files["src/effect.ts"] = (await template(`${target}/effect.ts`)).replace(
      "../shared/motion.js",
      "./motion.js",
    );
    files["src/recipe.ts"] =
      `import type { Recipe } from './motion.js';\nexport const recipe: Recipe = ${JSON.stringify(r, null, 2)};\n`;
    const shared = `
const api = { seek: (t: number) => effect.seek(t), play: () => effect.playback.play(), pause: () => effect.playback.pause(), restart:()=>{effect.playback.restart();effect.render();}, setData:(data:Record<string,string|number|boolean>)=>effect.setData(data),setNodeState:(id:string,state:'normal'|'pressed'|'selected'|'disabled')=>effect.setNodeState(id,state),setQuality:(quality:Parameters<typeof effect.setQuality>[0])=>effect.setQuality(quality),hitTest:(x:number,y:number)=>effect.hitTest(x,y),pointer:(type:'down'|'up'|'cancel',x:number,y:number)=>effect.pointer(type,x,y),profile:()=>JSON.stringify(effect.profile()),snapshot: () => JSON.stringify(effect.snapshot()) };
effect.onEvent(event=>parent.postMessage({type:'gametool-event',event},location.origin));
(window as any).gametool = api;
effect.seek(recipe.enter);
`;
    files["src/main.ts"] =
      target === "phaser"
        ? `import Phaser from 'phaser';
import { SceneEffect } from './scene.js';
import { loadImages } from './layers.js';
import { recipe } from './recipe.js';
const images = await loadImages(recipe);
class Preview extends Phaser.Scene {
  create() { const effect = new SceneEffect(this, recipe, images); ${shared} }
}
new Phaser.Game({type: Phaser.AUTO, width:recipe.width, height:recipe.height, transparent:true, scene:Preview,
 scale:{mode:Phaser.Scale.FIT, autoCenter:Phaser.Scale.CENTER_BOTH}, banner:false, audio:{noAudio:true}});
`
        : `import * as THREE from 'three';
import { SceneEffect } from './scene.js';
import { loadImages } from './layers.js';
import { recipe } from './recipe.js';
const images = await loadImages(recipe);
const renderer = new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x000000,0); document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-recipe.width/2,recipe.width/2,recipe.height/2,-recipe.height/2,0.1,100);
camera.position.z=10;
if(recipe.studio?.space==='world'){const scale=recipe.studio.worldScale;camera.left*=scale;camera.right*=scale;camera.top*=scale;camera.bottom*=scale;camera.updateProjectionMatrix();}
const effect = new SceneEffect(recipe, images); scene.add(effect.object);effect.setCamera(camera);
const raycaster=new THREE.Raycaster();
for(const type of ['pointerdown','pointerup','pointercancel'] as const) renderer.domElement.addEventListener(type,(event)=>{const rect=renderer.domElement.getBoundingClientRect(),pointer=new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(effect.object,true)[0];if(hit)effect.pointerWorld(type==='pointerdown'?'down':type==='pointerup'?'up':'cancel',hit.point);else if(type!=='pointerdown')effect.pointer('cancel',-1,-1);});
${shared}
function resize() { const s=Math.min(innerWidth/recipe.width,innerHeight/recipe.height); renderer.setSize(recipe.width*s,recipe.height*s); }
resize(); addEventListener('resize',resize);
let last=performance.now(); renderer.setAnimationLoop((now:number)=>{effect.update(Math.max(0,(now-last)/1000));last=now;renderer.render(scene,camera);});
addEventListener('pagehide',()=>{renderer.setAnimationLoop(null);effect.dispose();renderer.dispose();});
`;
    files["index.html"] =
      `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GameTool effect preview</title><style>${previewCss}${extraCss}</style></head><body><script>${bridge}</script><script src="app.js"></script></body></html>`;
    files["package.json"] = JSON.stringify(
      {
        name: `gametool-${target}-effect`,
        private: true,
        type: "module",
        scripts: {
          build:
            "tsc --noEmit && esbuild src/main.ts --bundle --outfile=app.js",
          start: "esbuild --servedir=. --serve=127.0.0.1:8080",
        },
        dependencies: {
          [target === "three" ? "three" : "phaser"]: versions[target],
        },
        devDependencies: {
          typescript: "5.9.3",
          esbuild: "0.28.2",
          ...(target === "three" ? { "@types/three": "0.183.1" } : {}),
        },
      },
      null,
      2,
    );
    files["tsconfig.json"] = JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          noEmit: true,
          types: [],
          lib: ["ES2022", "DOM"],
        },
        include: ["src"],
      },
      null,
      2,
    );
  }
  if (target !== "flutter") {
    const main = String(files["src/main.ts"]);
    const imports = main
      .split("\n")
      .filter((line) => line.startsWith("import "));
    const body = main
      .split("\n")
      .filter((line) => !line.startsWith("import "))
      .join("\n");
    files["src/main.ts"] =
      imports.join("\n") +
      `\nvoid (async () => { await Promise.all([document.fonts.load("bold 64px GameToolSans"),document.fonts.load("bold 64px GameToolSerif"),${fonts.registrations.map((f) => `document.fonts.load(${JSON.stringify(`${f.italic ? "italic " : ""}${f.weight || 700} 64px ${f.family}`)})`).join(",")}]);\n` +
      body +
      "\n})();\n";
  }
  files["README.md"] +=
    `\n## Scene layers\n\nLayer order: background, image, particles, text. Time and particle seeds use logical pixels and absolute seconds. Images are bundled under assets/images; no URLs or server calls are used.\n\n${target === "flutter" ? "Copy lib/layers.dart too. Await loadSceneImages(recipe) and pass images to TextEffect. The caller must dispose every ui.Image after unmounting; preserve the pubspec assets and font declarations." : "Use SceneEffect (src/scene.ts) with await loadImages(recipe) from src/layers.ts. Copy all src files and assets. Phaser owns its update listener; Three.js requires update(deltaSeconds) from the host. Call dispose() before removal. Images are immutable and may be shared between instances."}\n\nThe procedural background, transformations and particles are generated source code, not baked animation frames. Canvas2D layers are uploaded to a native Phaser/Three texture each frame; Flutter uses CustomPainter. This is a 2D screen-space effect, not a volumetric 3D emitter.\n`;
  files["README.md"] +=
    "\n## Studio composition and host integration\n\nOptional recipe.studio composes layers, nested group transforms, keyframes, scalar data bindings, five UI widgets and multiple particle emitters. setData({hp:40}) and setNodeState(id, state) update in place. onEvent(callback) returns an unsubscribe function; scheduled events fire only when playback crosses their timestamp, never on seek. UI clicks emit ui.click with nodeId. restart resets event traversal. Host pointer coordinates are logical pixels. Curves modulate particle displacement, size and opacity over lifetime; sprite frame clocks use node-local time. setQuality({level:'low',reducedMotion:true,particleBudget:200,instances:1}) changes runtime quality. Repeated instances are a stress test and draw over one another. profile() measures CPU composition submission and reports analytic particle/texture estimates, not GPU/display FPS.\n\nFlutter uses EffectController APIs; TS uses SceneEffect. Three world mode scales the canvas plane by worldScale, supports raycast pointerWorld and camera-facing billboard via setCamera(camera). The optional constructor option {particleRenderer: 'instanced'} batches Studio sprite particles with per-instance alpha/color/atlas cells; procedural shapes become circular sprites and glow/trails stay on the default canvas fidelity path. It is a planar world-space effect; no volumetric simulation. Phaser batches each composed scene into one uploaded canvas texture. Image assets remain bundled locally.\n";
  const installed = [
    ...new Set(
      [r.layout?.font, r.layout?.subFont].filter(
        (f): f is string => !!f?.startsWith("local:"),
      ),
    ),
  ];
  if (installed.length)
    files["README.md"] +=
      `\n## Installed font requirement\n\nThis recipe explicitly uses these system font families: ${installed.map((f) => f.slice(6)).join(", ")}. Install them on the target device or import the font files into GameTool and regenerate to bundle portable assets.\n`;
  return files;
}
