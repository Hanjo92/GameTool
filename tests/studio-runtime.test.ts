import { pageAt, timelineFor } from "../runtimes/shared/sequence.js";
import { defaultMotion } from "../runtimes/shared/options.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultRecipe } from "../packages/core/model.js";
import {
  createStudioNode,
  defaultStudio,
  defaultStudioQuality,
} from "../runtimes/shared/studio-types.js";
import {
  StudioRuntime,
  studioFrames,
  curveAt,
} from "../runtimes/shared/studio.js";
import {
  Playback,
  duration,
  evaluate,
  assetIds,
  defaultParticles,
  type Recipe,
} from "../runtimes/shared/motion.js";
const make = (): Recipe => ({
  ...structuredClone(defaultRecipe),
  loop: false,
  studio: structuredClone(defaultStudio),
});
test("studio nested transform, bindings, keyframes and lifetime do not mutate recipe", () => {
  const r = make(),
    group = createStudioNode("group", "g"),
    node = createStudioNode("text", "t");
  group.x = 100;
  group.y = 80;
  group.rotation = 90;
  group.scale = 2;
  node.parentId = "g";
  node.x = 10;
  node.y = 0;
  node.tracks = [
    {
      property: "opacity",
      keys: [
        { time: 0, value: 0, easing: "linear" },
        { time: 2, value: 1, easing: "linear" },
      ],
    },
  ];
  r.studio!.nodes = [group, node];
  r.studio!.bindings = [
    {
      nodeId: "t",
      property: "text",
      key: "damage",
      format: "-{value}",
      scale: 1,
      offset: 0,
      min: 0,
      max: 1000,
    },
  ];
  const before = JSON.stringify(r),
    f = studioFrames(r, 1, { damage: 35 })[1];
  assert.equal(f.x, 100);
  assert.equal(f.y, 100);
  assert.equal(f.scale, 2);
  assert.equal(f.opacity, 0.5);
  assert.equal(f.text, "-35");
  assert.equal(studioFrames(r, 4)[1].visible, false);
  assert.equal(JSON.stringify(r), before);
});
test("studio duration extends transport without extending legacy text fade", () => {
  const r = make();
  r.enter = 0.5;
  r.hold = 1;
  r.exit = 0.5;
  r.studio!.duration = 6;
  assert.equal(duration(r), 6);
  assert.equal(evaluate(r, 3).opacity, 0);
  r.studio!.nodes = [{ ...createStudioNode("image", "i"), assetId: "asset" }];
  assert.deepEqual(assetIds(r), ["asset"]);
});
test("events cross only advancing playback, seek silent, restart resets and loops remain ordered", () => {
  const r = make();
  r.studio!.events = [
    { id: "start", name: "start", time: 0, payload: {} },
    { id: "hit", name: "hit", time: 0.5, payload: { amount: 3 } },
  ];
  const p = new Playback(r),
    s = new StudioRuntime(r),
    events: string[] = [];
  const stop = s.onEvent((e) => events.push(e.name));
  p.onTransport((...a) => s.transport(...a));
  p.seek(1);
  assert.deepEqual(events, []);
  p.restart();
  p.advance(0.1);
  p.advance(0.5);
  p.advance(0.1);
  assert.deepEqual(events, ["start", "hit"]);
  p.seek(0);
  assert.equal(events.length, 2);
  p.play();
  p.advance(0.6);
  assert.deepEqual(events, ["start", "hit", "start", "hit"]);
  stop();
  p.restart();
  p.advance(0.6);
  assert.equal(events.length, 4);
});
test("widget hit tests respect transforms/disabled and state transitions tick while playback paused", () => {
  const r = make(),
    node = createStudioNode("ui", "button");
  node.x = 100;
  node.y = 100;
  node.rotation = 90;
  r.studio!.nodes = [node];
  const s = new StudioRuntime(r),
    events: string[] = [];
  s.onEvent((e) => events.push(e.name));
  s.frames(1);
  assert.equal(s.hitTest(100, 100), "button");
  s.pointer("down", 100, 100);
  assert.equal(s.frames(1)[0].style!.scale, 1);
  s.advanceUI(0.2);
  assert.equal(s.frames(1)[0].style!.scale, 0.94);
  s.pointer("up", 100, 100);
  assert.deepEqual(events, ["ui.click"]);
  s.setNodeState("button", "disabled");
  assert.equal(s.hitTest(100, 100), null);
});
test("particle emitters support curves, follow and total instance quality budget deterministically", () => {
  const r = make(),
    node = createStudioNode("particles", "p");
  node.particles = { ...defaultParticles, advanced: true, count: 100 };
  node.follow = { xKey: "x", yKey: "y", offsetX: 4, offsetY: -3 };
  node.curves = {
    size: [
      { t: 0, value: 2 },
      { t: 1, value: 2 },
    ],
    opacity: [
      { t: 0, value: 0.5 },
      { t: 1, value: 0.5 },
    ],
    speed: [
      { t: 0, value: 0.5 },
      { t: 1, value: 0.5 },
    ],
  };
  r.studio!.nodes = [node, { ...node, id: "p2" }];
  const q = { ...defaultStudioQuality, particleBudget: 30, instances: 3 };
  const a = studioFrames(r, 0.6, { x: 10, y: 20 }, {}, q);
  assert.equal(a[0].x, 14);
  assert.equal(a[0].y, 17);
  assert.equal(
    a.reduce((n, f) => n + f.points.length, 0),
    10,
  );
  assert.deepEqual(a, studioFrames(r, 0.6, { x: 10, y: 20 }, {}, q));
  assert.equal(
    curveAt(
      [
        { t: 0, value: 2 },
        { t: 1, value: 4 },
      ],
      0.5,
    ),
    3,
  );
});

test("UI text and color bindings replace rendered widget label and state text color", () => {
  const recipe = make();
  const node = createStudioNode("ui", "button");
  recipe.studio!.nodes = [node];
  recipe.studio!.bindings = [
    {
      nodeId: "button",
      property: "text",
      key: "label",
      format: "GO {value}",
      scale: 1,
      offset: 0,
      min: 0,
      max: 100,
    },
    {
      nodeId: "button",
      property: "color",
      key: "tint",
      format: "{value}",
      scale: 1,
      offset: 0,
      min: 0,
      max: 100,
    },
  ];
  const frames = studioFrames(recipe, 1, { label: "NOW", tint: "#ffaa00" });
  assert.equal(frames[0].widget!.label, "GO NOW");
  assert.equal(frames[0].style!.color, "#ffaa00");
  assert.equal(node.widget!.label, "START");
});

test("object prototype names are safe node IDs and missing data keys stay missing", () => {
  const recipe = make();
  recipe.studio!.nodes = ["constructor", "toString", "hasOwnProperty"].map(
    (id) => createStudioNode("ui", id),
  );
  recipe.studio!.bindings = [
    {
      nodeId: "constructor",
      property: "text",
      key: "toString",
      scale: 1,
      offset: 0,
      min: 0,
      max: 100,
      format: "{value}",
    },
  ];
  const frames = studioFrames(recipe, 1);
  for (const frame of frames) assert.equal(frame.state, "normal");
  assert.equal(frames[0].widget!.label, "START");
  const runtime = new StudioRuntime(recipe);
  runtime.frames(1);
  runtime.setNodeState("constructor", "disabled");
  assert.equal(runtime.frames(1)[0].state, "disabled");
});

test("precise text and Studio share the extended loop boundary", () => {
  const r = make();
  r.loop = true;
  r.motion = { ...defaultMotion, enabled: true };
  r.studio!.duration = 20;
  const legacy = timelineFor(r).duration;
  assert(legacy < 20);
  assert.equal(pageAt(r, legacy + 0.5).active, false);
  assert.equal(pageAt(r, 20.1).active, pageAt(r, 0.1).active);
  assert.equal(evaluate(r, legacy + 0.5).opacity, 0);
});
