import { glyphAt, defaultTypography, type Recipe } from "./motion.js";
import { defaultLayout, defaultMotion, defaultSequence } from "./options.js";
export interface TextPage {
  text: string;
  start: number;
  textStart: number;
  mainEnd: number;
  inEnd: number;
  outStart: number;
  end: number;
  starts: number[];
  rows: number[];
  columns: number[];
  subStart: number;
  soloEnd: number;
  scrollDuration: number;
}
const cache = new WeakMap<Recipe, { pages: TextPage[]; duration: number }>();
export const precise = (r: Recipe) =>
  r.motion?.enabled === true ||
  r.sequence?.mode === "trailer" ||
  r.typography?.departure === "none";
export function timelineFor(r: Recipe) {
  const known = cache.get(r);
  if (known) return known;
  const m = { ...defaultMotion, ...r.motion },
    q = { ...defaultSequence, ...r.sequence },
    l = { ...defaultLayout, ...r.layout };
  const trailer = q.mode === "trailer";
  const raw =
    trailer && q.pageSplit && q.reveal !== "scroll"
      ? r.text.split(/\n\s*\n/)
      : [r.text];
  const pages: TextPage[] = [];
  let cursor = m.startDelay;
  for (const source of raw) {
    const text = source
      .split("\n")
      .flatMap((line) =>
        q.wrapChars > 0
          ? Array.from(
              {
                length: Math.max(
                  1,
                  Math.ceil(Array.from(line).length / q.wrapChars),
                ),
              },
              (_, i) =>
                Array.from(line)
                  .slice(i * q.wrapChars, (i + 1) * q.wrapChars)
                  .join(""),
            )
          : [line],
      )
      .join("\n");
    const chars = Array.from(text),
      lead = r.frame?.enabled ? r.frame.textDelay : 0,
      textStart = cursor + lead;
    const starts: number[] = [],
      rows: number[] = [],
      columns: number[] = [];
    let row = 0,
      col = 0,
      tick = 0;
    const lineLengths = text.split("\n").map((line) => Array.from(line).length);
    const visible = chars.filter((ch) => ch !== "\n").length;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      rows.push(row);
      columns.push(col);
      let delay = i * m.inStagger;
      if (trailer) {
        if (q.reveal === "char") delay = tick;
        else if (q.reveal === "line") delay = row * q.lineInterval;
        else if (q.reveal === "sweep")
          delay =
            row * q.lineInterval +
            (col / Math.max(1, lineLengths[row] - 1)) * q.sweepDuration;
        else delay = 0;
      } else {
        const order = r.typography?.order ?? "forward";
        let rank = i;
        if (order === "reverse") rank = chars.length - 1 - i;
        if (order === "center") rank = Math.abs(i - (chars.length - 1) / 2);
        if (order === "edges")
          rank = (chars.length - 1) / 2 - Math.abs(i - (chars.length - 1) / 2);
        if (order === "random")
          rank =
            (i * 7919 + (r.typography?.seed ?? 42) * 1013) %
            Math.max(1, chars.length);
        delay = [
          "slam",
          "approach",
          "recede",
          "wipe",
          "unfold",
          "glitch",
          "flash",
        ].includes(r.typography?.entrance ?? "")
          ? 0
          : rank * m.inStagger;
      }
      starts.push(textStart + delay);
      if (ch === "\n") {
        row++;
        col = 0;
        tick += q.linePause;
      } else {
        col++;
        tick += 1 / q.cps;
        if (/[、。，．,.!?！？:：;；]/u.test(ch)) tick += q.punctPause;
      }
    }
    const glyphDuration = trailer ? q.glyphDuration : r.enter;
    let mainEnd = Math.max(textStart, ...starts.map((s) => s + glyphDuration));
    const soloEnd = textStart + visible / q.cps + q.soloPause;
    let scrollDuration = 0;
    if (trailer && q.reveal === "solo") {
      mainEnd = soloEnd + r.enter;
      starts.fill(soloEnd);
    }
    if (trailer && q.reveal === "spread")
      mainEnd = textStart + q.spreadHold + q.spreadDuration;
    if (trailer && q.reveal === "scroll") {
      const extent =
        (r.typography?.vertical ? r.width : r.height) +
        lineLengths.length * r.fontSize * l.lineHeight;
      scrollDuration = extent / q.scrollSpeed;
      mainEnd = textStart + scrollDuration;
    }
    const subStart = Math.max(textStart, mainEnd + m.subDelay);
    const inEnd =
      trailer || !r.typography?.subText
        ? mainEnd
        : Math.max(mainEnd, subStart + r.enter);
    const outStart = inEnd + (trailer && q.reveal === "scroll" ? 0 : r.hold);
    const outDuration =
      m.outEnabled && r.typography?.departure !== "none"
        ? r.exit + Math.max(0, visible - 1) * m.outStagger
        : 0;
    const end =
      outStart +
      Math.max(
        outDuration,
        r.frame?.enabled && m.outEnabled ? r.frame.duration : 0,
      );
    pages.push({
      text,
      start: cursor,
      textStart,
      mainEnd,
      inEnd,
      outStart,
      end,
      starts,
      rows,
      columns,
      subStart,
      soloEnd,
      scrollDuration,
    });
    cursor = end + q.pageGap;
  }
  const result = {
    pages,
    duration: Math.max(0.001, (pages.at(-1)?.end ?? 0) + m.endDelay),
  };
  cache.set(r, result);
  return result;
}
export function pageAt(r: Recipe, seconds: number) {
  const timeline = timelineFor(r),
    loopDuration = Math.max(
      timeline.duration,
      r.studio?.enabled ? r.studio.duration : 0,
    ),
    t =
      r.loop &&
      (!(r.loopCount ?? 0) || seconds < loopDuration * (r.loopCount ?? 0))
        ? seconds % loopDuration
        : Math.min(seconds, loopDuration);
  let index = timeline.pages.findIndex((p) => t >= p.start && t <= p.end);
  const keep =
    r.motion?.outEnabled === false || r.typography?.departure === "none";
  if (index < 0 && keep && t >= (timeline.pages.at(-1)?.start ?? 0))
    index = timeline.pages.length - 1;
  const page = timeline.pages[Math.max(0, index)];
  return { page, index: Math.max(0, index), time: t, active: index >= 0 };
}
export function currentText(r: Recipe, seconds: number) {
  return precise(r) ? pageAt(r, seconds).page.text : r.text;
}
export function easing(name: string, p: number) {
  p = Math.max(0, Math.min(1, p));
  if (p === 0 || p === 1) return p;
  if (name === "linear") return p;
  if (name === "in") return p * p * p;
  if (name === "smooth")
    return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  if (name === "strong") return p === 1 ? 1 : 1 - 2 ** (-10 * p);
  if (name === "back") {
    const q = p - 1;
    return 1 + 2.70158 * q * q * q + 1.70158 * q * q;
  }
  if (name === "elastic")
    return p === 0 || p === 1
      ? p
      : 1 - Math.pow(2, -10 * p) * Math.cos((p * Math.PI * 2) / 0.3);
  if (name === "bounce") {
    let q = p;
    const n = 7.5625,
      d = 2.75;
    if (q < 1 / d) return n * q * q;
    if (q < 2 / d) {
      q -= 1.5 / d;
      return n * q * q + 0.75;
    }
    if (q < 2.5 / d) {
      q -= 2.25 / d;
      return n * q * q + 0.9375;
    }
    q -= 2.625 / d;
    return n * q * q + 0.984375;
  }
  return 1 - (1 - p) ** 3;
}
const subtitleRecipes = new WeakMap<Recipe, Recipe>();
export function subtitleAt(r: Recipe, seconds: number, index = 0, count = 1) {
  const m = { ...defaultMotion, ...r.motion },
    p = pageAt(r, seconds);
  let sub = subtitleRecipes.get(r);
  if (!sub) {
    const c = { ...defaultTypography, ...r.typography };
    sub = {
      ...r,
      loop: false,
      frame: undefined,
      sequence: defaultSequence,
      motion: { ...m, enabled: false },
      typography: {
        ...c,
        subText: "",
        entrance: (m.subMotion === "same"
          ? c.entrance
          : m.subMotion) as typeof c.entrance,
        departure: c.departure === "none" ? "fade" : c.departure,
        stagger: 0,
      },
    };
    subtitleRecipes.set(r, sub);
  }
  const leaving =
    p.time >= p.page.outStart &&
    m.outEnabled &&
    r.typography?.departure !== "none";
  const time = leaving
    ? r.enter + r.hold + p.time - p.page.outStart
    : Math.max(
        0,
        Math.min(
          r.enter + r.hold - 0.000001,
          Math.max(0, p.time - p.page.subStart),
        ),
      );
  const s = glyphAt(sub, time, index, count);
  if (!p.active || p.time < p.page.subStart) s.opacity = 0;
  return { ...s, spacing: 0 };
}
