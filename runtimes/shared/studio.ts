import {
  duration,
  particlesAt,
  randomAt,
  defaultParticles,
  type ParticlePoint,
  type Recipe,
} from "./motion.js";
import { defaultParticleOptions } from "./particle-options.js";
import {
  defaultStudioQuality,
  type StudioData,
  type StudioNode,
  type StudioQuality,
  type StudioWidgetState,
  type StudioWidgetStyle,
  type StudioCurvePoint,
} from "./studio-types.js";
export interface StudioFrame extends StudioNode {
  visible: boolean;
  value: number;
  state: StudioWidgetState;
  style?: StudioWidgetStyle;
  localTime: number;
  points: ParticlePoint[];
}
export interface StudioSignal {
  id: string;
  name: string;
  time: number;
  loop: number;
  payload: StudioData;
  nodeId?: string;
}
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v));
const ease = (t: number, mode: string) =>
  mode === "in"
    ? t * t
    : mode === "out"
      ? 1 - (1 - t) ** 2
      : mode === "smooth"
        ? t * t * (3 - 2 * t)
        : t;
export function curveAt(
  points: StudioCurvePoint[] | undefined,
  t: number,
  fallback = 1,
) {
  if (!points?.length) return fallback;
  if (t <= points[0].t) return points[0].value;
  for (let i = 1; i < points.length; i++)
    if (t <= points[i].t) {
      const a = points[i - 1],
        b = points[i];
      return (
        a.value +
        (b.value - a.value) * clamp((t - a.t) / Math.max(0.000001, b.t - a.t))
      );
    }
  return points[points.length - 1].value;
}
export function curveAverage(
  points: StudioCurvePoint[] | undefined,
  t: number,
) {
  if (!points?.length) return 1;
  if (t <= 0) return curveAt(points, 0);
  const stops = [0, ...points.map((p) => p.t).filter((x) => x > 0 && x < t), t];
  let area = 0;
  for (let i = 1; i < stops.length; i++)
    area +=
      (curveAt(points, stops[i - 1]) + curveAt(points, stops[i])) *
      0.5 *
      (stops[i] - stops[i - 1]);
  return area / t;
}
function colorMix(a: string, b: string, t: number) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - t) +
            parseInt(b.slice(i, i + 2), 16) * t,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
function mixStyle(
  a: StudioWidgetStyle,
  b: StudioWidgetStyle,
  t: number,
): StudioWidgetStyle {
  return {
    color: colorMix(a.color, b.color, t),
    background: colorMix(a.background, b.background, t),
    scale: a.scale + (b.scale - a.scale) * t,
    opacity: a.opacity + (b.opacity - a.opacity) * t,
  };
}
/** Pure absolute-time composition. Data and UI state are supplied by the host-owned runtime. */
export function studioFrames(
  recipe: Recipe,
  seconds: number,
  data: StudioData = {},
  states: Record<string, StudioWidgetState> = {},
  quality?: StudioQuality,
): StudioFrame[] {
  const studio = recipe.studio;
  if (!studio?.enabled) return [];
  const q = quality ?? studio.quality,
    d = duration(recipe),
    loops = recipe.loopCount ?? 0;
  const t =
    recipe.loop && (!loops || seconds < d * loops)
      ? seconds % d
      : Math.min(d, seconds);
  const values: StudioData = Object.assign(
      Object.create(null),
      studio.data,
      data,
    ),
    byId = new Map<string, StudioFrame>();
  let remaining = Math.floor(q.particleBudget / Math.max(1, q.instances));
  const sample = (node: StudioNode): StudioFrame => {
    const cached = byId.get(node.id);
    if (cached) return cached;
    const localTime = Math.max(0, t - node.start),
      f: StudioFrame = {
        ...node,
        visible:
          node.enabled &&
          t >= node.start &&
          t < node.start + node.duration &&
          t < studio.duration,
        value: node.widget?.value ?? 0,
        state:
          (Object.hasOwn(states, node.id) ? states[node.id] : undefined) ??
          node.widget?.state ??
          "normal",
        localTime,
        points: [],
      };
    byId.set(node.id, f);
    for (const track of node.tracks) {
      if (!track.keys.length) continue;
      const time =
        q.reducedMotion &&
        track.property !== "value" &&
        track.property !== "opacity"
          ? 0
          : localTime;
      let v = track.keys[0].value;
      for (let i = 1; i < track.keys.length; i++) {
        const a = track.keys[i - 1],
          b = track.keys[i];
        if (time >= b.time) {
          v = b.value;
          continue;
        }
        v =
          a.value +
          (b.value - a.value) *
            ease(
              clamp((time - a.time) / Math.max(0.000001, b.time - a.time)),
              b.easing,
            );
        break;
      }
      f[track.property] = v;
    }
    for (const binding of studio.bindings.filter((b) => b.nodeId === node.id)) {
      const raw = values[binding.key];
      if (raw === undefined) continue;
      if (binding.property === "text") {
        f.text = binding.format.replaceAll("{value}", String(raw));
        if (f.widget) f.widget = { ...f.widget, label: f.text };
      } else if (binding.property === "visible")
        f.visible = f.visible && Boolean(raw);
      else if (
        binding.property === "color" &&
        typeof raw === "string" &&
        /^#[0-9a-f]{6}$/i.test(raw)
      )
        f.color = raw;
      else if (
        binding.property === "state" &&
        ["normal", "pressed", "selected", "disabled"].includes(String(raw))
      )
        f.state = raw as StudioWidgetState;
      else if (
        ["x", "y", "value", "opacity"].includes(binding.property) &&
        typeof raw === "number"
      )
        (f as unknown as Record<string, unknown>)[binding.property] = clamp(
          raw * binding.scale + binding.offset,
          binding.min,
          binding.max,
        );
    }
    if (node.follow) {
      const x = values[node.follow.xKey],
        y = values[node.follow.yKey];
      if (typeof x === "number") f.x = x + node.follow.offsetX;
      if (typeof y === "number") f.y = y + node.follow.offsetY;
    }
    if (node.widget) {
      f.style = { ...node.widget.states[f.state] };
      if (
        studio.bindings.some(
          (b) =>
            b.nodeId === node.id &&
            b.property === "color" &&
            values[b.key] !== undefined,
        )
      )
        f.style.color = f.color;
    }
    if (node.parentId) {
      const parentNode = studio.nodes.find((n) => n.id === node.parentId);
      if (parentNode) {
        const p = sample(parentNode),
          a = (p.rotation * Math.PI) / 180,
          x = f.x * p.scale,
          y = f.y * p.scale;
        f.x = p.x + x * Math.cos(a) - y * Math.sin(a);
        f.y = p.y + x * Math.sin(a) + y * Math.cos(a);
        f.rotation += p.rotation;
        f.scale *= p.scale;
        f.opacity *= p.opacity;
        f.visible = f.visible && p.visible;
      }
    }
    f.opacity = clamp(f.opacity);
    return f;
  };
  const frames = studio.nodes.map(sample).sort((a, b) => a.zIndex - b.zIndex);
  for (const f of frames)
    if (f.kind === "particles" && f.visible) {
      const p = {
        ...defaultParticles,
        ...defaultParticleOptions,
        ...f.particles,
        enabled: true,
        sync: false,
      };
      const factor = q.reducedMotion
        ? 0.1
        : q.level === "low"
          ? 0.25
          : q.level === "medium"
            ? 0.5
            : 1;
      p.count = Math.max(0, Math.min(remaining, Math.ceil(p.count * factor)));
      remaining -= p.count;
      const particleTime = q.reducedMotion
        ? Math.min(0.2, f.localTime)
        : f.localTime;
      const particleRecipe: Recipe = {
        ...recipe,
        studio: undefined,
        width: f.width,
        height: f.height,
        loop: false,
        enter: 0,
        hold: Math.max(f.duration, particleTime + 1),
        exit: 0,
        motion: undefined,
        typography: undefined,
        particles: p,
      };
      f.points = particlesAt(particleRecipe, particleTime).map(
        (point, index) => {
          const life = particleLife(p, particleTime, index),
            speed = curveAverage(f.curves?.speed, life),
            cx = f.width * p.x,
            cy = f.height * p.y;
          return {
            ...point,
            x: cx + (point.x - cx) * speed - f.width / 2,
            y: cy + (point.y - cy) * speed - f.height / 2,
            tailX:
              point.tailX === undefined
                ? undefined
                : cx + (point.tailX - cx) * speed - f.width / 2,
            tailY:
              point.tailY === undefined
                ? undefined
                : cy + (point.tailY - cy) * speed - f.height / 2,
            size: point.size * curveAt(f.curves?.size, life),
            opacity: point.opacity * curveAt(f.curves?.opacity, life),
          };
        },
      );
    }
  return frames;
}
function particleLife(
  p: ReturnType<typeof particleDefaults>,
  t: number,
  index: number,
) {
  const lifetime =
      p.lifetime *
      (p.advanced
        ? 1 + (randomAt(p.seed, index, 6) * 2 - 1) * p.lifeVariation
        : 1),
    clock = Math.max(0, t - (p.advanced ? p.delay : 0));
  const start =
    p.advanced && p.emission === "continuous" && !p.prewarm
      ? randomAt(p.seed, index, 0) * lifetime
      : 0;
  const age =
    p.emission === "burst"
      ? p.advanced && p.burstInterval > 0
        ? clock % p.burstInterval
        : clock
      : Math.max(
          0,
          clock -
            start +
            (!p.advanced || p.prewarm
              ? randomAt(p.seed, index, 0) * lifetime
              : 0),
        ) % lifetime;
  return clamp(age / lifetime);
}
function particleDefaults() {
  return { ...defaultParticles, ...defaultParticleOptions };
}
/** Playback emits events; evaluation/seek never does. No DOM or engine dependency. */
export class StudioRuntime {
  readonly data: StudioData;
  readonly states: Record<string, StudioWidgetState> = Object.create(null);
  quality: StudioQuality;
  private listeners = new Set<(event: StudioSignal) => void>();
  private transitions = new Map<
    string,
    {
      from: StudioWidgetStyle;
      to: StudioWidgetStyle;
      elapsed: number;
      duration: number;
    }
  >();
  private lastTime = 0;
  private pressed: string | null = null;
  private samples: number[] = [];
  private framesRendered = 0;
  constructor(readonly recipe: Recipe) {
    this.data = Object.assign(Object.create(null), recipe.studio?.data);
    this.quality = { ...(recipe.studio?.quality ?? defaultStudioQuality) };
  }
  setData(values: StudioData) {
    for (const [key, value] of Object.entries(values))
      if (
        ["string", "boolean"].includes(typeof value) ||
        (typeof value === "number" && Number.isFinite(value))
      )
        this.data[key] = value;
  }
  setQuality(values: Partial<StudioQuality>) {
    const q = { ...this.quality, ...values };
    if (
      !["low", "medium", "high"].includes(q.level) ||
      !Number.isInteger(q.instances) ||
      q.instances < 1 ||
      q.instances > 32 ||
      !Number.isInteger(q.particleBudget) ||
      q.particleBudget < 0 ||
      q.particleBudget > 5000 ||
      !Number.isFinite(q.fpsTarget) ||
      q.fpsTarget < 1 ||
      q.fpsTarget > 240 ||
      typeof q.reducedMotion !== "boolean"
    )
      throw new Error("Invalid studio quality");
    this.quality = q;
  }
  setNodeState(id: string, state: StudioWidgetState) {
    const node = this.recipe.studio?.nodes.find((n) => n.id === id);
    if (
      !node?.widget ||
      !["normal", "pressed", "selected", "disabled"].includes(state)
    )
      throw new Error("Unknown widget or state");
    const frame = this.frames(this.lastTime).find((n) => n.id === id)!;
    this.states[id] = state;
    this.transitions.set(id, {
      from: frame.style!,
      to: node.widget.states[state],
      elapsed: 0,
      duration: this.quality.reducedMotion ? 0 : node.widget.transition,
    });
  }
  advanceUI(delta: number) {
    let changed = false;
    for (const value of this.transitions.values()) {
      if (value.elapsed < value.duration) {
        value.elapsed += delta;
        changed = true;
      }
    }
    return changed;
  }
  onEvent(listener: (event: StudioSignal) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  transport(
    kind: "advance" | "seek" | "restart",
    previous: number,
    seconds: number,
  ) {
    this.lastTime = seconds;
    if (kind !== "advance") {
      this.transitions.clear();
      return;
    }

    const studio = this.recipe.studio;
    if (!studio?.enabled || seconds <= previous) return;
    const d = duration(this.recipe),
      maxLoop = this.recipe.loop
        ? this.recipe.loopCount
          ? this.recipe.loopCount - 1
          : Math.floor(seconds / d)
        : 0;
    for (
      let loop = Math.max(
        Math.floor(previous / d),
        Math.floor(seconds / d) - 255,
      );
      loop <= Math.min(maxLoop, Math.floor(seconds / d));
      loop++
    )
      for (const event of [...studio.events].sort((a, b) => a.time - b.time)) {
        const time = loop * d + event.time;
        if (
          (time > previous && time <= seconds) ||
          (previous === 0 && event.time === 0 && loop === 0)
        )
          this.emit({ ...event, time, loop });
      }
  }
  private emit(event: StudioSignal) {
    for (const listener of this.listeners)
      listener({ ...event, payload: { ...event.payload } });
  }
  frames(time: number) {
    this.lastTime = time;
    const frames = studioFrames(
      this.recipe,
      time,
      this.data,
      this.states,
      this.quality,
    );
    for (const f of frames) {
      const transition = this.transitions.get(f.id);
      if (transition && f.style && f.state === this.states[f.id])
        f.style = mixStyle(
          transition.from,
          transition.to,
          transition.duration
            ? clamp(transition.elapsed / transition.duration)
            : 1,
        );
    }
    return frames;
  }
  hitTest(x: number, y: number, time = this.lastTime) {
    return (
      this.frames(time)
        .reverse()
        .find((f) => {
          if (
            !f.visible ||
            f.opacity <= 0 ||
            !f.widget ||
            f.state === "disabled" ||
            f.scale === 0
          )
            return false;
          const a = (-f.rotation * Math.PI) / 180,
            dx = x - f.x,
            dy = y - f.y,
            s = f.scale * (f.style?.scale ?? 1);
          return (
            Math.abs((dx * Math.cos(a) - dy * Math.sin(a)) / s) <=
              f.width / 2 &&
            Math.abs((dx * Math.sin(a) + dy * Math.cos(a)) / s) <= f.height / 2
          );
        })?.id ?? null
    );
  }
  pointer(type: "down" | "up" | "cancel", x: number, y: number) {
    const id = this.hitTest(x, y);
    if (type === "down" && id) {
      this.pressed = id;
      this.setNodeState(id, "pressed");
    } else if (type !== "down" && this.pressed) {
      const pressed = this.pressed;
      this.pressed = null;
      this.setNodeState(pressed, "normal");
      if (type === "up" && pressed === id)
        this.emit({
          id: `click:${id}`,
          name: "ui.click",
          time: this.lastTime,
          loop: 0,
          nodeId: id!,
          payload: { nodeId: id! },
        });
    }
    return id;
  }
  recordFrame(milliseconds: number) {
    this.framesRendered++;
    this.samples.push(milliseconds);
    if (this.samples.length > 120) this.samples.shift();
  }
  profile() {
    const frames = this.frames(this.lastTime),
      sorted = [...this.samples].sort((a, b) => a - b),
      mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
    return {
      measurement:
        "measured CPU composition time; excludes GPU and display scheduling",
      samples: sorted.length,
      framesRendered: this.framesRendered,
      meanFrameMs: mean,
      p95FrameMs: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0,
      targetFrameMs: 1000 / this.quality.fpsTarget,
      estimatedParticles:
        frames.reduce((n, f) => n + f.points.length, 0) *
        this.quality.instances,
      estimatedTextureBytes: this.recipe.width * this.recipe.height * 4,
      instances: this.quality.instances,
      quality: { ...this.quality },
    };
  }
  snapshot(time = this.lastTime) {
    return {
      time,
      data: { ...this.data },
      quality: { ...this.quality },
      nodes: this.frames(time),
    };
  }
  dispose() {
    this.listeners.clear();
    this.transitions.clear();
  }
}

export const evaluateStudio = studioFrames;
