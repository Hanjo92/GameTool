import type { Studio } from "./studio-types.js";
import { defaultParticleOptions, type ParticleOptions } from "./particle-options.js";
import {
  precise,
  timelineFor,
  pageAt,
  currentText,
  easing,
} from "./sequence.js";
import {
  defaultLayout,
  defaultMotion,
  defaultSequence,
  type LayoutOptions,
  type MotionOptions,
  type SequenceOptions,
  type BackdropOptions,
} from "./options.js";
/** Portable logical-pixel timeline. Exported verbatim with generated TypeScript. */
export interface Recipe {
  schemaVersion: 1;
  studio?: Studio;
  textVisible?: boolean;
  typography?: Typography;
  layout?: LayoutOptions;
  motion?: MotionOptions;
  sequence?: SequenceOptions;
  backdrop?: BackdropOptions;
  frame?: Frame;
  background?: Background;
  image?: ImageLayer;
  particles?: Particles;
  text: string;
  color: string;
  fontSize: number;
  width: number;
  height: number;
  enter: number;
  hold: number;
  exit: number;
  effect: "fade" | "slide" | "pop";
  distance: number;
  loop: boolean;
  loopCount?: number;
}
export const legacyDuration = (r: Recipe) => precise(r) ? timelineFor(r).duration : r.enter + r.hold + r.exit;
export const duration = (r: Recipe) => Math.max(legacyDuration(r), r.studio?.enabled ? r.studio.duration : 0);
export function evaluate(r: Recipe, seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error("Time must be finite and non-negative");
  const d = duration(r);
  const t =
    r.loop && (!(r.loopCount ?? 0) || seconds < d * (r.loopCount ?? 0))
      ? seconds % d
      : Math.min(seconds, d);
  let a =
    r.enter > 0 && t < r.enter
      ? t / r.enter
      : t < r.enter + r.hold
        ? 1
        : r.exit > 0
          ? Math.max(0, (legacyDuration(r) - t) / r.exit)
          : 0;
  if (precise(r)) {
    const { page, active } = pageAt(r, seconds),
      m = { ...defaultMotion, ...r.motion };
    a = !active
      ? 0
      : t < page.inEnd
        ? Math.max(
            0,
            Math.min(
              1,
              (t - page.textStart) /
                Math.max(0.001, page.inEnd - page.textStart),
            ),
          )
        : !m.outEnabled || r.typography?.departure === "none"
          ? 1
          : Math.max(
              0,
              1 -
                (t - page.outStart) / Math.max(0.001, page.end - page.outStart),
            );
  }
  const eased = 1 - (1 - a) ** 3;
  return {
    opacity: a,
    y: r.effect === "slide" ? (1 - eased) * r.distance : 0,
    scale: r.effect === "pop" ? 0.72 + 0.28 * eased : 1,
    time: t,
  };
}
/** Host drives advance once per frame; seek is independent of refresh rate. */
export class Playback {
  time = 0;
  playing = false;
  private rate = 1;
  private transportListeners = new Set<(kind: 'advance' | 'seek' | 'restart', previous: number, time: number) => void>();
  onTransport(listener: (kind: 'advance' | 'seek' | 'restart', previous: number, time: number) => void) { this.transportListeners.add(listener); return () => this.transportListeners.delete(listener); }
  private emitTransport(kind: 'advance' | 'seek' | 'restart', previous: number) { for (const listener of this.transportListeners) listener(kind, previous, this.time); }
  constructor(public recipe: Recipe) {}
  get speed() {
    return this.rate;
  }
  set speed(value: number) {
    if (!Number.isFinite(value) || value <= 0 || value > 8)
      throw new Error("Speed must be in (0, 8]");
    this.rate = value;
  }
  seek(seconds: number) {
    evaluate(this.recipe, seconds);
    const previous = this.time;
    this.time = seconds;
    this.emitTransport('seek', previous);
    return this.state;
  }
  play() {
    this.playing = true;
  }
  pause() {
    this.playing = false;
  }
  restart() {
    const previous = this.time;
    this.time = 0;
    this.emitTransport('restart', previous);
    this.play();
  }
  advance(deltaSeconds: number) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error("Invalid delta");
    if (this.playing) {
      const previous = this.time;
      this.time += deltaSeconds * this.rate;
      if (
        (!this.recipe.loop || !!this.recipe.loopCount) &&
        this.time >=
          duration(this.recipe) *
            (this.recipe.loop ? (this.recipe.loopCount ?? 1) : 1)
      ) {
        this.time =
          duration(this.recipe) *
          (this.recipe.loop ? (this.recipe.loopCount ?? 1) : 1);
        this.pause();
      }
      this.emitTransport('advance', previous);
    }
    return this.state;
  }
  get state() {
    return evaluate(this.recipe, this.time);
  }
}

export interface Background {
  enabled: boolean;
  assetId: string | null;
  fit: "cover" | "contain";
  color: string;
  endColor: string;
  motion: BackgroundMotion;
  assetIds?: string[];
  filter?: ImageFilter;
  fadeDirection?: "out" | "in";
  transitionSource?: "images" | "original-filter";
  profile?: "legacy" | "reference";
  amount: number;
  fade: boolean;
}
export interface ImageLayer {
  enabled: boolean;
  assetId: string | null;
  fit: "cover" | "contain";
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}
export interface Particles extends Partial<ParticleOptions> {
  enabled: boolean;
  preset: "snow" | "sparks" | "confetti";
  emission: "continuous" | "burst";
  seed: number;
  count: number;
  size: number;
  speed: number;
  lifetime: number;
  gravity: number;
  spread: number;
  x: number;
  y: number;
  color: string;
}
export const defaultBackground: Background = {
  enabled: false,
  assetId: null,
  fit: "cover",
  color: "#132b3c",
  endColor: "#3d5466",
  motion: "zoom-in",
  amount: 0.15,
  fade: false,
  fadeDirection: "out",
  transitionSource: "images",
  profile: "legacy",
};
export const defaultImage: ImageLayer = {
  enabled: false,
  assetId: null,
  fit: "contain",
  x: 0,
  y: 0,
  scale: 0.5,
  rotation: 0,
  opacity: 1,
};
export const defaultParticles: Particles = {
  ...defaultParticleOptions,
  enabled: false,
  preset: "snow",
  emission: "continuous",
  seed: 42,
  count: 80,
  size: 4,
  speed: 90,
  lifetime: 3,
  gravity: 20,
  spread: 180,
  x: 0.5,
  y: 0.5,
  color: "#c6fa73",
};
// Nonlinear integer mixing stays below 2^53 and matches Dart JS/native exactly.
export function randomAt(seed: number, index: number, channel: number) {
  let n = ((seed + index * 1013 + channel * 7919) % 2147483646) + 1;
  n = (n * ((n % 65521) + 1) + 12345) % 2147483647;
  n = (n * ((n % 65521) + 1) + 12345) % 2147483647;
  return n / 2147483647;
}
export const backgroundMotions = [
  "none",
  "zoom-in",
  "zoom-out",
  "pan-left",
  "pan-right",
  "pan-up",
  "pan-down",
  "shake",
  "shake-x",
  "shake-y",
  "stagger",
  "breathing",
  "slow-pan",
  "spin-fall",
  "suck-in-white",
  "suck-in-black",
  "wave",
  "rise",
  "descend",
  "zoom-in-white",
  "zoom-in-black",
  "zoom-out-white",
  "zoom-out-black",
  "fade-black",
  "fade-white",
  "fade-transparent",
  "crossfade",
  "hard-cut",
  "wipe",
] as const;
export type BackgroundMotion = (typeof backgroundMotions)[number];
export const imageFilters = [
  "none",
  "grayscale",
  "sepia",
  "posterize",
  "contrast",
  "soft-focus",
  "sharp",
  "edges",
  "white-edges",
  "ink",
  "pixelate",
  "noise",
  "crt",
  "vignette",
  "chromatic",
  "morning",
  "day",
  "evening",
  "night",
  "midnight",
  "moonlight",
  "horror",
  "fog",
  "cyber",
  "underwater",
  "dream",
  "old-photo",
] as const;
export type ImageFilter = (typeof imageFilters)[number];
export function backgroundAt(r: Recipe, seconds: number) {
  const b = r.background ?? defaultBackground,
    s = evaluate(r, seconds);
  const p = s.time / duration(r),
    travel = b.amount,
    phase = p * Math.PI * 2,
    motion = b.motion;
  let x = 0,
    y = 0,
    scale = 1,
    rotation = 0,
    overlay = 0,
    white = 0,
    wave = 0;
  let opacity = b.enabled ? (b.fade ? s.opacity : 1) : 0;
  if (motion.startsWith("zoom-in")) scale = 1 + travel * p;
  if (motion.startsWith("zoom-out")) scale = 1 + travel * (1 - p);
  if (motion.startsWith("pan-")) {
    scale = 1 + travel * 2;
    const sign = motion === "pan-left" || motion === "pan-up" ? -1 : 1;
    if (motion === "pan-left" || motion === "pan-right")
      x = sign * (p - 0.5) * travel * r.width;
    else y = sign * (p - 0.5) * travel * r.height;
  }
  if (["shake", "shake-x", "shake-y"].includes(motion)) {
    if (motion !== "shake-y") x = Math.sin(phase * 7) * travel * r.width * 0.1;
    if (motion !== "shake-x") y = Math.sin(phase * 9) * travel * r.height * 0.1;
  }
  if (motion === "stagger") {
    x = Math.sin(phase) * travel * r.width * 0.15;
    y = Math.sin(phase * 2) * travel * r.height * 0.1;
    rotation = Math.sin(phase) * travel * 0.3;
  }
  if (motion === "breathing")
    scale = 1 + travel * (0.5 - 0.5 * Math.cos(phase));
  if (motion === "slow-pan") {
    scale = 1 + travel;
    x = Math.sin(phase) * travel * r.width * 0.4;
  }
  if (motion === "spin-fall") {
    rotation = p * Math.PI * 2;
    scale = 1 - 0.8 * p;
    y = p * p * r.height;
    overlay = p * p;
  }
  if (motion.startsWith("suck-in")) {
    scale = 1 + 8 * p * p;
    rotation = p * p * travel * 2;
    overlay = p * p;
  }
  if (motion === "rise" || motion === "descend") {
    y = (motion === "rise" ? -1 : 1) * p * r.height * travel;
  }
  if (motion === "wave") wave = travel * r.width * 0.15;
  if (motion.includes("-white")) white = 1;
  if (motion.endsWith("-white") || motion.endsWith("-black")) overlay = p;
  if (motion === "fade-transparent") opacity *= 1 - p;
  const smooth = (v: number) => v * v * v * (v * (v * 6 - 15) + 10);
  if (b.profile === "reference") {
    const a = travel / 0.15,
      e = p * p * (3 - 2 * p),
      fadeEnd = smooth(Math.max(0, Math.min(1, (p - 0.55) / 0.45)));
    if (["shake", "shake-x", "shake-y"].includes(motion)) {
      x =
        motion === "shake-y"
          ? 0
          : (Math.sin(phase) * 16 + Math.sin(phase * 10) * 5) * a;
      y =
        motion === "shake-x"
          ? 0
          : (Math.sin(phase) * 14 + Math.sin(phase * 9) * 4) * a;
      if (motion === "shake") {
        x = (Math.sin(phase * 4) * 10 + Math.sin(phase * 9) * 4) * a;
        y = (Math.cos(phase * 3) * 8 + Math.sin(phase * 7) * 3) * a;
        rotation = Math.sin(phase * 3) * 0.012 * a;
      }
    }
    if (motion === "stagger") {
      x = (Math.sin(phase) * 7 + Math.sin(phase * 2 + 0.6) * 2.5) * a;
      y = (Math.cos(phase - 0.4) * 5 + Math.sin(phase * 3) * 1.8) * a;
      rotation = Math.sin(phase - 0.8) * 0.018 * a;
    }
    if (motion === "breathing") {
      scale = 1 + (1 - Math.cos(phase)) * 0.02 * a;
      y = -(1 - Math.cos(phase)) * a;
    }
    if (motion === "slow-pan") {
      scale = 1;
      x = Math.sin(phase) * 54 * a;
    }
    if (motion === "spin-fall") {
      scale = 1.02 * (1 - e * 0.78);
      rotation = e * 1.18;
      y = e * 52;
      overlay = fadeEnd;
    }
    if (motion.startsWith("suck-in")) {
      scale = 1 + e * 0.52;
      rotation = e * 0.2;
      overlay = fadeEnd;
    }
    if (motion === "rise" || motion === "descend") {
      y = (motion === "rise" ? -1 : 1) * e * 130 * a;
      overlay = fadeEnd;
    }
    if (motion === "wave") {
      scale = 1.05;
      wave = 8 * a;
    }
    if (motion.startsWith("zoom-in")) scale = 1 + e * travel;
    if (motion.startsWith("zoom-out")) scale = 1 + (1 - e) * travel;
    if (
      motion.startsWith("zoom-") &&
      (motion.endsWith("-white") || motion.endsWith("-black"))
    )
      overlay = fadeEnd;
  }
  if (motion.startsWith("fade-")) {
    const fade = b.fadeDirection === "in" ? 1 - smooth(p) : smooth(p);
    if (motion === "fade-transparent")
      opacity = (b.enabled ? (b.fade ? s.opacity : 1) : 0) * (1 - fade);
    else overlay = fade;
  }
  const ids = backgroundAssetIds(r),
    count =
      b.transitionSource === "original-filter"
        ? Math.min(1, ids.length)
        : ids.length;
  const position = p * Math.max(0, count - 1);
  const index = Math.min(Math.floor(position), Math.max(0, count - 1));
  const next = count > 0 ? Math.min(index + 1, count - 1) : 0,
    mix = smooth(
      b.transitionSource === "original-filter" || count === 1
        ? p
        : position - index,
    );
  return {
    x,
    y,
    scale,
    rotation,
    opacity,
    overlay,
    white,
    wave,
    index,
    next,
    mix,
  };
}
export function backgroundAssetIds(r: Recipe) {
  return r.background?.assetIds?.length
    ? r.background.assetIds
    : r.background?.assetId
      ? [r.background.assetId]
      : [];
}
export interface ParticlePoint {
  x: number; y: number; size: number; rotation: number; opacity: number;
  tailX?: number; tailY?: number; red?: number; green?: number; blue?: number;
}
/** Absolute-time sampling: seeks never depend on prior frames or trail buffers. */
export function particlesAt(r: Recipe, seconds: number): ParticlePoint[] {
  const p = r.particles ?? defaultParticles,
    s = evaluate(r, seconds);
  if (!p.enabled) return [];
  if (p.advanced) return advancedParticles(r, s.time, s.opacity);
  return Array.from({ length: p.count }, (_, i) => {
    const rnd = (c: number) => randomAt(p.seed, i, c);
    const age =
      p.emission === "burst"
        ? s.time
        : (s.time + rnd(0) * p.lifetime) % p.lifetime;
    const life = age / p.lifetime;
    const angle = ((-90 + (rnd(1) - 0.5) * p.spread) * Math.PI) / 180;
    const speed = p.speed * (0.5 + rnd(2));
    let x = r.width * p.x + Math.cos(angle) * speed * age;
    let y =
      r.height * p.y +
      Math.sin(angle) * speed * age +
      0.5 * p.gravity * age * age;
    if (p.preset === "snow") {
      x = rnd(1) * r.width + Math.sin(age * 2 + rnd(2) * 6.28) * p.spread * 0.1;
      y = -p.size + age * p.speed + 0.5 * p.gravity * age * age;
    }
    return {
      x,
      y,
      size: p.size * (0.5 + rnd(3)),
      rotation: rnd(4) * Math.PI * 2 + age * (rnd(5) - 0.5) * 6,
      opacity:
        life >= 1 ? 0 : Math.max(0, Math.min(1, (1 - life) * 4)) * s.opacity,
    };
  });
}
function advancedParticles(r: Recipe, time: number, alpha: number): ParticlePoint[] {
  const p = { ...defaultParticles, ...defaultParticleOptions, ...r.particles };
  const clock = time - p.delay;
  if (clock < 0) return [];
  const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const startColor = channels(p.color), endColor = channels(p.colorEnd);
  return Array.from({ length: p.count }, (_, i) => {
    const rnd = (c: number) => randomAt(p.seed, i, c);
    const lifetime = p.lifetime * (1 + (rnd(6) * 2 - 1) * p.lifeVariation);
    const start = p.emission === 'continuous' && !p.prewarm ? rnd(0) * lifetime : 0;
    const age = p.emission === 'burst'
      ? (p.burstInterval > 0 ? clock % p.burstInterval : clock)
      : Math.max(0, clock - start + (p.prewarm ? rnd(0) * lifetime : 0)) % lifetime;
    const life = Math.min(1, age / lifetime);
    const angle = (p.direction + (rnd(1) - .5) * p.spread) * Math.PI / 180;
    const speed = p.speed * (1 + (rnd(2) * 2 - 1) * p.speedVariation);
    const radius = p.radius * Math.min(r.width, r.height) * (p.emitter === 'circle' ? Math.sqrt(rnd(8)) : 1);
    const phi = rnd(7) * Math.PI * 2;
    let ox = 0, oy = 0;
    if (p.emitter === 'box') { ox = (rnd(7) - .5) * p.areaWidth * r.width; oy = (rnd(8) - .5) * p.areaHeight * r.height; }
    if (p.emitter === 'circle' || p.emitter === 'ring') { ox = Math.cos(phi) * radius; oy = Math.sin(phi) * radius; }
    const position = (t: number) => {
      const travel = p.drag > 0 ? (1 - Math.exp(-p.drag * t)) / p.drag : t;
      let x = ox + Math.cos(angle) * speed * travel, y = oy + Math.sin(angle) * speed * travel + .5 * p.gravity * t * t;
      if (p.path !== 'ballistic') {
        const orbitRadius = p.emitter === 'point' ? radius : Math.hypot(ox, oy);
        const theta = (p.emitter === 'point' ? phi : Math.atan2(oy, ox)) + p.orbitSpeed * t * Math.PI / 180;
        const shrink = p.path === 'vortex' ? Math.pow(Math.max(0, 1 - t / lifetime), 2) : 1;
        x = Math.cos(theta) * orbitRadius * shrink; y = Math.sin(theta) * orbitRadius * shrink;
      }
      const phase = rnd(9) * Math.PI * 2;
      return { x: r.width * p.x + x + p.wind * t + p.turbulence * (Math.sin(t * 3 + phase) - Math.sin(phase)),
        y: r.height * p.y + y + p.turbulence * .35 * (Math.cos(t * 2 + phase) - Math.cos(phase)) };
    };
    const head = position(age), tail = position(Math.max(0, age - p.trail)), previous = position(Math.max(0, age - .01));
    const fadeIn = p.fadeIn > 0 ? Math.min(1, life / p.fadeIn) : 1;
    const fadeOut = p.fadeOut > 0 ? Math.min(1, (1 - life) / p.fadeOut) : 1;
    return { ...head, tailX: tail.x, tailY: tail.y,
      size: p.size * (1 + (rnd(3) * 2 - 1) * p.sizeVariation) * (1 + (p.sizeEnd - 1) * life),
      rotation: p.shape === "spark" ? Math.atan2(head.y - previous.y, head.x - previous.x) : rnd(4) * Math.PI * 2 + p.spin * age * Math.PI / 180,
      opacity: clock < start || age >= lifetime ? 0 : Math.max(0, fadeIn * fadeOut) * p.opacity * (p.sync ? alpha : 1),
      red: Math.round(startColor[0] + (endColor[0] - startColor[0]) * life),
      green: Math.round(startColor[1] + (endColor[1] - startColor[1]) * life),
      blue: Math.round(startColor[2] + (endColor[2] - startColor[2]) * life),
    };
  });
}
export function sceneSnapshot(r: Recipe, seconds: number) {
  return {
    ...evaluate(r, seconds),
    background: backgroundAt(r, seconds),
    frame: frameAt(r, seconds),
    glyphs: r.typography?.enabled
      ? Array.from(currentText(r, seconds)).map((_, i) =>
          glyphAt(r, seconds, i, Array.from(currentText(r, seconds)).length),
        )
      : [],
    particles: particlesAt(r, seconds),
  };
}
export function assetIds(r: Recipe) {
  return [
    ...new Set(
      [
        ...backgroundAssetIds(r),
        r.background?.assetId,
        r.image?.assetId,
        ...(r.studio?.nodes.map(n => n.assetId) ?? []),
      ].filter((id): id is string => !!id),
    ),
  ];
}

export const textMotions = [
  "fade",
  "rise",
  "drop",
  "split",
  "slide",
  "tracking",
  "spread",
  "blur",
  "pop",
  "shrink",
  "rotate",
  "flip",
  "bounce",
  "gather",
  "typewriter",
  "flicker",
  "slam",
  "approach",
  "recede",
  "wipe",
  "unfold",
  "glitch",
  "flash",
  "none",
  "sink",
  "diverge",
  "grow-out",
  "erase",
  "zoom-through",
] as const;
export const holdMotions = [
  "none",
  "float",
  "wave",
  "pulse",
  "shake",
  "glow",
  "blink",
  "flash",
  "noise",
] as const;
export interface Typography {
  enabled: boolean;
  subText: string;
  subSize: number;
  subColor: string;
  serif: boolean;
  spacing: number;
  subSpacing: number;
  subPosition: "above" | "below";
  align: "left" | "center" | "right";
  vertical: boolean;
  x: number;
  y: number;
  strokeWidth: number;
  strokeColor: string;
  glow: number;
  glowColor: string;
  shadow: boolean;
  gradient: boolean;
  gradientColor: string;
  fillOpacity: number;
  plate: "none" | "band" | "card";
  plateColor: string;
  plateOpacity: number;
  entrance: (typeof textMotions)[number];
  departure: (typeof textMotions)[number];
  holdMotion: (typeof holdMotions)[number];
  stagger: number;
  order: "forward" | "reverse" | "center" | "edges" | "random";
  seed: number;
}
export const defaultTypography: Typography = {
  enabled: false,
  subText: "BATTLE START",
  subSize: 20,
  subColor: "#ffffff",
  serif: true,
  spacing: 14,
  subSpacing: 8,
  subPosition: "below",
  align: "center",
  vertical: false,
  x: 0,
  y: 0,
  strokeWidth: 0,
  strokeColor: "#000000",
  glow: 0,
  glowColor: "#88ccff",
  shadow: true,
  gradient: false,
  gradientColor: "#ffb347",
  fillOpacity: 1,
  plate: "none",
  plateColor: "#111111",
  plateOpacity: 0.6,
  entrance: "drop",
  departure: "fade",
  holdMotion: "none",
  stagger: 0.4,
  order: "forward",
  seed: 42,
};
export function glyphAt(
  r: Recipe,
  seconds: number,
  index: number,
  count: number,
) {
  const c = r.typography ?? defaultTypography,
    m = { ...defaultMotion, ...r.motion },
    q = { ...defaultSequence, ...r.sequence },
    s = evaluate(r, seconds),
    t = s.time;
  let rank = count <= 1 ? 0 : index / (count - 1);
  if (c.order === "reverse") rank = 1 - rank;
  if (c.order === "center") rank = Math.abs(rank - 0.5) * 2;
  if (c.order === "edges") rank = 1 - Math.abs(rank - 0.5) * 2;
  if (c.order === "random") rank = randomAt(c.seed, index, 7);
  const delay = r.frame?.enabled ? Math.min(r.frame.textDelay, r.enter) : 0;
  let entering = t < r.enter,
    leaving = t >= r.enter + r.hold;
  let a = entering
    ? Math.max(
        0,
        Math.min(
          1,
          ((t - delay) / Math.max(0.000001, r.enter - delay) -
            rank * c.stagger) /
            (1 - c.stagger),
        ),
      )
    : leaving
      ? r.exit > 0
        ? Math.max(0, 1 - (t - r.enter - r.hold) / r.exit)
        : 0
      : 1;
  let center = 0,
    scroll = 0;
  if (precise(r)) {
    const { page, active } = pageAt(r, seconds);
    const start = page.starts[index] ?? page.textStart;
    entering = t < page.inEnd;
    leaving = t >= page.outStart;
    let outRank = index;
    if (m.outOrder === "reverse") outRank = count - 1 - index;
    if (m.outOrder === "center") outRank = Math.abs(index - (count - 1) / 2);
    if (m.outOrder === "edges")
      outRank = (count - 1) / 2 - Math.abs(index - (count - 1) / 2);
    if (m.outOrder === "random")
      outRank = (index * 7919 + c.seed * 1013) % Math.max(1, count);
    const gd = q.mode === "trailer" ? q.glyphDuration : r.enter;
    a = !active
      ? 0
      : leaving
        ? m.outEnabled && c.departure !== "none"
          ? 1 -
            Math.max(
              0,
              Math.min(
                1,
                (t - page.outStart - outRank * m.outStagger) /
                  Math.max(0.001, r.exit),
              ),
            )
          : 1
        : Math.max(0, Math.min(1, (t - start) / Math.max(0.001, gd)));
    if (q.mode === "trailer" && q.reveal === "solo" && t < page.soloEnd) {
      const chars = Array.from(page.text),
        visibleIndex = chars.slice(0, index).filter((ch) => ch !== "\n").length;
      a =
        active &&
        Math.floor((t - page.textStart) * q.cps) === visibleIndex &&
        chars[index] !== "\n"
          ? 1
          : 0;
      center = 1;
    }
    if (q.mode === "trailer" && q.reveal === "spread") {
      center =
        1 -
        easing("out", (t - page.textStart - q.spreadHold) / q.spreadDuration);
      a = active && t >= page.textStart ? 1 : 0;
    }
    if (q.mode === "trailer" && q.reveal === "scroll") {
      a = active ? 1 : 0;
      scroll = (t - page.textStart) * q.scrollSpeed;
      entering = false;
      leaving = false;
    }
  }
  const mode = leaving ? c.departure : c.entrance,
    remaining = 1 - a,
    e = 1 - easing(leaving ? m.outEase : m.inEase, a);
  const power = leaving ? m.outPower : m.inPower;
  const qOpacity = remaining;
  let x = 0,
    y = 0,
    scale = 1,
    rotation = 0,
    blur = 0,
    clip = 1,
    scaleX = 1,
    scaleY = 1,
    glow = 1,
    bright = 0;
  const direction = leaving ? m.outDirection : m.inDirection;
  const clipDirection =
    direction === "center"
      ? 4
      : ["left", "right", "up", "down"].indexOf(
          (
            { lr: "left", rl: "right", tb: "up", bt: "down" } as Record<
              string,
              string
            >
          )[direction] ?? direction,
        );
  const block = [
    "slam",
    "approach",
    "recede",
    "wipe",
    "unfold",
    "glitch",
    "flash",
    "zoom-through",
  ].includes(mode)
    ? 1
    : 0;
  if (mode === "rise") y = (leaving ? -1 : 1) * e * r.distance;
  if (mode === "sink") y = e * r.distance;
  if (mode === "diverge") y = (index % 2 ? 1 : -1) * e * r.distance;
  if (mode === "grow-out" || mode === "zoom-through") scale = 1 + e * 3;
  if (mode === "erase") a = a >= 1 ? 1 : 0;
  if (mode === "drop") y = -e * r.distance;
  if (mode === "split") y = (index % 2 ? 1 : -1) * e * r.distance;
  if (mode === "slide") {
    const direction = leaving ? m.outDirection : m.inDirection;
    if (direction === "up" || direction === "down")
      y = (direction === "up" ? -1 : 1) * e * r.distance;
    else x = (direction === "left" ? -1 : 1) * e * r.distance;
  }
  if (mode === "tracking") x = (index - (count - 1) / 2) * e * r.fontSize * 0.7;
  if (mode === "spread") x = -(index - (count - 1) / 2) * e * r.fontSize;
  if (mode === "blur") blur = qOpacity * 12;
  if (mode === "pop" || mode === "recede") scale = 1 - 0.8 * e;
  if (mode === "shrink" || mode === "approach") scale = 1 + 2 * e;
  if (mode === "rotate") rotation = -Math.PI * e;
  if (mode === "flip") scaleX = Math.max(0.01, a);
  if (mode === "bounce")
    y = -Math.abs(Math.cos(a * Math.PI * 2.5)) * qOpacity * r.distance;
  if (mode === "gather") {
    x = (randomAt(c.seed, index, 1) - 0.5) * r.distance * 4 * e;
    y = (randomAt(c.seed, index, 2) - 0.5) * r.distance * 4 * e;
  }
  if (mode === "typewriter") a = a > 0 ? 1 : 0;
  if (mode === "flicker") a *= a > 0.95 ? 1 : Math.sin(a * 42) > 0 ? 1 : 0.15;
  if (mode === "wipe") clip = a;
  if (mode === "unfold") {
    if (direction === "up" || direction === "down" || direction === "v")
      scaleY = Math.max(0.01, a);
    else scaleX = Math.max(0.01, a);
  }
  if (mode === "glitch") {
    x = Math.sin(a * 93 + index) * qOpacity * 20;
    a *= Math.sin(a * 50) > 0.2 ? 0.4 : 1;
  }
  if (mode === "approach") blur = e * r.fontSize * 0.1;
  if (mode === "slam") {
    if (a < 0.4) {
      const impact = a / 0.4;
      scale = 1 + (1 - impact * impact) * 2.4;
      blur = (1 - impact) * r.fontSize * 0.04;
      a = Math.min(1, impact * 2.2);
    } else {
      const settle = (a - 0.4) / 0.6,
        decay = (1 - settle) ** 2;
      scale = 1 + Math.sin(settle * Math.PI * 3) * 0.05 * decay;
      x = Math.sin(t * 43) * r.fontSize * 0.08 * decay;
      y = Math.sin(t * 61 + 0.7) * r.fontSize * 0.08 * decay;
      bright = (1 - settle) ** 3 * 0.85;
    }
  }
  if (mode === "flash") {
    bright = e;
    glow = 1 + e * 1.5;
    a = Math.min(1, a * 5);
  }
  if (
    c.vertical &&
    ["rise", "drop", "split", "sink", "diverge", "tracking", "spread"].includes(
      mode,
    )
  ) {
    const swap = x;
    x = y;
    y = swap;
  }
  x *= power;
  y *= power;
  rotation *= power;
  scale = 1 + (scale - 1) * power;
  blur *= power;
  if (!entering && !leaving) {
    const phase = (t - r.enter) * Math.PI * 2;
    if (c.holdMotion === "float") y = Math.sin(phase * 0.5) * 6;
    if (c.holdMotion === "wave") y = Math.sin(phase + index * 0.7) * 8;
    if (c.holdMotion === "pulse") scale = 1 + Math.sin(phase) * 0.05;
    if (c.holdMotion === "shake") {
      x = Math.sin(phase * 7 + index) * 3;
      y = Math.cos(phase * 9 + index) * 3;
    }
    if (c.holdMotion === "glow")
      glow = Math.max(0, 1 + 0.8 * Math.cos(phase) * m.holdPower);
    if (c.holdMotion === "blink") a = Math.sin(phase) > 0 ? 1 : 0.25;
    if (c.holdMotion === "flash") a = Math.sin(phase * 4) > 0 ? 1 : 0;
    if (c.holdMotion === "noise")
      x =
        Math.sin(phase * 12) > 0.95
          ? (randomAt(c.seed, index, 1) - 0.5) * 30
          : 0;
  }
  if (!entering && !leaving) {
    x *= m.holdPower;
    y *= m.holdPower;
    scale = 1 + (scale - 1) * m.holdPower;
  }
  if (precise(r)) {
    const p = pageAt(r, seconds);
    if (!p.active) a = 0;
    if (
      q.mode === "trailer" &&
      q.reveal === "solo" &&
      t >= p.page.soloEnd &&
      t < p.page.mainEnd
    )
      scale *=
        1 +
        0.25 *
          q.soloImpact *
          (1 - easing("out", (t - p.page.soloEnd) / Math.max(0.001, r.enter)));
  }
  return {
    opacity: a,
    x,
    y,
    scale,
    rotation,
    blur,
    clip,
    clipDirection,
    block,
    scaleX,
    scaleY,
    glow,
    bright,
    center,
    scroll,
  };
}

/** Independent decoration timing: trace clockwise, retract on departure. */
export interface Frame {
  enabled: boolean;
  style:
    | "title"
    | "box"
    | "corners"
    | "band"
    | "tape"
    | "lines"
    | "underline"
    | "sides"
    | "bar";
  outline?: boolean;
  softness?: number;
  sideFade?: number;
  radius?: number;
  tapeColor?: string;
  tapeStripe?: string;
  tapeSize?: number;
  tapeSpeed?: number;
  tapeBlink?: number;

  animation: "draw" | "fade" | "none";
  duration: number;
  textDelay: number;
  color: string;
  width: number;
  fillColor: string;
  fillOpacity: number;
  padding: number;
  extend: number;
  inset: number;
}
export const defaultFrame: Frame = {
  enabled: false,
  style: "title",
  animation: "draw",
  duration: 0.6,
  textDelay: 0.3,
  color: "#ffffff",
  width: 3,
  fillColor: "#000000",
  fillOpacity: 0,
  padding: 0.28,
  extend: 12,
  inset: 32,
  outline: false,
  softness: 0.5,
  sideFade: 0.3,
  radius: 0.2,
  tapeColor: "#f5c400",
  tapeStripe: "#151515",
  tapeSize: 40,
  tapeSpeed: 90,
  tapeBlink: 0.5,
};
export function frameAt(r: Recipe, seconds: number) {
  const c = r.frame ?? defaultFrame;
  let t = evaluate(r, seconds).time;
  let outStart = r.enter + r.hold,
    exit = r.exit;
  if (precise(r)) {
    const p = pageAt(r, seconds);
    if (!p.active) return { progress: 0, opacity: 0 };
    t -= p.page.start;
    outStart = p.page.outStart - p.page.start;
    exit = p.page.end - p.page.outStart;
    if (r.motion?.outEnabled === false || r.typography?.departure === "none")
      outStart = Infinity;
  }
  if (!c.enabled || r.textVisible === false || t >= duration(r))
    return { progress: 0, opacity: 0 };
  const incoming = c.duration > 0 ? Math.min(1, t / c.duration) : 1;
  const outgoing =
    t < outStart
      ? 0
      : exit > 0
        ? Math.min(1, (t - outStart) / Math.min(c.duration || exit, exit))
        : 1;
  const a = (1 - (1 - incoming) ** 3) * (1 - outgoing ** 3);
  if (c.animation === "none") return { progress: 1, opacity: 1 };
  return {
    progress: c.animation === "draw" ? a : 1,
    opacity: c.animation === "draw" ? Math.min(1, a * 4) : a,
  };
}
/** A polyline prefix preserves constant stroke width and clockwise corner order. */
export function traceRectangle(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  progress: number,
  vertical = false,
) {
  const points = vertical
    ? [
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
        [x1, y0],
      ]
    : [
        [x0, y0],
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ];
  let remaining = Math.max(0, Math.min(1, progress)) * 2 * (x1 - x0 + y1 - y0);
  const result = [points[0]];
  for (let i = 1; i < points.length && remaining > 0; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const f = Math.min(1, remaining / length);
    result.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    remaining -= length;
  }
  return result;
}

export function fontAssetIds(r: Recipe) {
  return [
    ...new Set(
      [r.layout?.font, r.layout?.subFont].filter(
        (id): id is string => !!id && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id),
      ),
    ),
  ];
}
