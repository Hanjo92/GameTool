import {
  defaultFrame,
  frameAt,
  traceRectangle,
  type Recipe,
} from "./motion.js";
import { defaultLayout } from "./options.js";
export interface TextBounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  fit: number;
  subEdge: number | null;
}
export function paintDecoration(
  ctx: CanvasRenderingContext2D,
  r: Recipe,
  seconds: number,
  b: TextBounds,
) {
  const c = { ...defaultFrame, ...r.frame },
    s = frameAt(r, seconds),
    l = { ...defaultLayout, ...r.layout };
  if (!s.opacity) return;
  const vertical = r.typography?.vertical === true,
    pad = c.padding * r.fontSize,
    ext = c.extend * r.fontSize,
    g = s.progress;
  let x0 = b.x0 - pad,
    x1 = b.x1 + pad,
    y0 = b.y0 - pad,
    y1 = b.y1 + pad;
  if (c.style !== "title" && b.subEdge !== null) {
    const size = r.typography?.subSize ?? 0;
    if (vertical) {
      if (r.typography?.subPosition === "above")
        x1 = Math.max(x1, b.subEdge + size + pad);
      else x0 = Math.min(x0, b.subEdge - size - pad);
    } else if (r.typography?.subPosition === "above")
      y0 = Math.min(y0, b.subEdge - size - pad);
    else y1 = Math.max(y1, b.subEdge + size + pad);
  }
  if (c.style === "title") {
    if (vertical) {
      y0 -= ext;
      y1 += ext;
    } else {
      x0 -= ext;
      x1 += ext;
    }
    if (b.subEdge !== null) {
      if (vertical) {
        if (r.typography?.subPosition === "above")
          x1 = Math.min(x1, (b.x1 + b.subEdge) / 2);
        else x0 = Math.max(x0, (b.x0 + b.subEdge) / 2);
      } else if (r.typography?.subPosition === "above")
        y0 = Math.max(y0, (b.y0 + b.subEdge) / 2);
      else y1 = Math.min(y1, (b.y1 + b.subEdge) / 2);
    }
  }
  const inset = Math.max(c.inset, c.width / 2);
  x0 = Math.max(x0, (inset - b.cx) / b.fit);
  x1 = Math.min(x1, (r.width - inset - b.cx) / b.fit);
  y0 = Math.max(y0, (inset - b.cy) / b.fit);
  y1 = Math.min(y1, (r.height - inset - b.cy) / b.fit);
  if (x1 <= x0 || y1 <= y0) return;
  ctx.save();
  ctx.globalAlpha = s.opacity;
  const path = new Path2D(),
    line = (a: number, d: number, e: number, f: number) => {
      path.moveTo(a, d);
      path.lineTo(e, f);
    };
  if (c.style === "band") {
    const w = vertical ? x1 - x0 : r.width / b.fit,
      h = vertical ? r.height / b.fit : y1 - y0,
      x = vertical ? x0 : -b.cx / b.fit,
      y = vertical ? -b.cy / b.fit : y0;
    ctx.save();
    ctx.scale(vertical ? 1 : g, vertical ? g : 1);
    const layer = document.createElement("canvas");
    layer.width = Math.max(1, Math.ceil(w));
    layer.height = Math.max(1, Math.ceil(h));
    const ink = layer.getContext("2d")!;
    const gradient = ink.createLinearGradient(
        0,
        0,
        vertical ? w : 0,
        vertical ? 0 : h,
      ),
      softness = Math.min(0.49, (c.softness ?? 0.5) * 0.49);
    gradient.addColorStop(0, `${c.fillColor}00`);
    gradient.addColorStop(softness, c.fillColor);
    gradient.addColorStop(1 - softness, c.fillColor);
    gradient.addColorStop(1, `${c.fillColor}00`);
    ink.fillStyle = gradient;
    ink.fillRect(0, 0, w, h);
    if ((c.sideFade ?? 0) > 0) {
      ink.globalCompositeOperation = "destination-in";
      const fade = ink.createLinearGradient(
          0,
          0,
          vertical ? 0 : w,
          vertical ? h : 0,
        ),
        k = Math.min(0.49, (c.sideFade ?? 0) * 0.49);
      fade.addColorStop(0, "#00000000");
      fade.addColorStop(k, "#000000");
      fade.addColorStop(1 - k, "#000000");
      fade.addColorStop(1, "#00000000");
      ink.fillStyle = fade;
      ink.fillRect(0, 0, w, h);
    }
    ctx.globalAlpha *= c.fillOpacity;
    ctx.drawImage(layer, x, y, w, h);
    ctx.restore();
    ctx.restore();
    return;
  }
  if (c.style === "tape") {
    const tw = c.tapeSize ?? 40,
      len = (vertical ? r.height : r.width) / b.fit;
    for (const [side, position] of [
      [1, vertical ? x1 : y0 - tw],
      [-1, vertical ? x0 - tw : y1],
    ]) {
      ctx.save();
      if (vertical) {
        ctx.rotate(Math.PI / 2);
        ctx.translate(0, -position - tw);
      } else ctx.translate(0, position);
      const start = -len / 2 + (side === 1 ? len * (1 - g) : 0);
      ctx.beginPath();
      ctx.rect(start, 0, len * g, tw);
      ctx.clip();
      ctx.globalAlpha *=
        1 - (c.tapeBlink ?? 0.5) * (0.5 + 0.5 * Math.sin(seconds * 6 + side));
      ctx.fillStyle = c.tapeColor ?? "#f5c400";
      ctx.fillRect(-len / 2, 0, len, tw);
      ctx.fillStyle = c.tapeStripe ?? "#151515";
      const period = tw * 1.3,
        shift = (seconds * (c.tapeSpeed ?? 90) * side) % period;
      for (
        let x = -len / 2 - period + shift;
        x < len / 2 + period;
        x += period
      ) {
        ctx.beginPath();
        ctx.moveTo(x, tw);
        ctx.lineTo(x + period / 2, tw);
        ctx.lineTo(x + period / 2 + tw, 0);
        ctx.lineTo(x + tw, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
    return;
  }
  if (c.style === "box") {
    const mx = (x0 + x1) / 2,
      my = (y0 + y1) / 2,
      w = (x1 - x0) * (vertical ? 1 : g),
      h = (y1 - y0) * (vertical ? g : 1);
    path.roundRect(
      mx - w / 2,
      my - h / 2,
      w,
      h,
      Math.min(w / 2, h / 2, (c.radius ?? 0.2) * r.fontSize),
    );
  } else if (c.style === "corners") {
    const arm = Math.min(x1 - x0, y1 - y0) * 0.28 * g,
      inset = (1 - g) * r.fontSize * 0.4;
    for (const [x, y, sx, sy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x1, y1, -1, -1],
      [x0, y1, 1, -1],
    ]) {
      const a = x - sx * inset,
        d = y - sy * inset;
      path.moveTo(a + sx * arm, d);
      path.lineTo(a, d);
      path.lineTo(a, d + sy * arm);
    }
  } else if (c.style === "lines") {
    if (vertical) {
      line(x0, b.y0 - ext * g, x0, b.y1 + ext * g);
      line(x1, b.y0 - ext * g, x1, b.y1 + ext * g);
    } else {
      line((b.x0 - ext) * g, y0, (b.x1 + ext) * g, y0);
      line((b.x0 - ext) * g, y1, (b.x1 + ext) * g, y1);
    }
  } else if (c.style === "underline") {
    if (vertical)
      line(x0, b.y0 - ext, x0, b.y0 - ext + (b.y1 - b.y0 + 2 * ext) * g);
    else line(b.x0 - ext, y1, b.x0 - ext + (b.x1 - b.x0 + 2 * ext) * g, y1);
  } else if (c.style === "sides") {
    if (vertical) {
      line(0, y0 - ext * g, 0, y0);
      line(0, y1, 0, y1 + ext * g);
    } else {
      line(x0 - ext * g, 0, x0, 0);
      line(x1, 0, x1 + ext * g, 0);
    }
  } else if (c.style === "bar") {
    if (vertical) line(x1, y0, x1 - (x1 - x0) * g, y0);
    else line(x0, y0, x0, y0 + (y1 - y0) * g);
  } else {
    const points = traceRectangle(x0, y0, x1, y1, g, vertical);
    path.moveTo(...(points[0] as [number, number]));
    for (const p of points.slice(1)) path.lineTo(...(p as [number, number]));
    if (g === 1) path.closePath();
  }
  if (c.style === "title" || c.style === "box") {
    ctx.save();
    ctx.globalAlpha *= c.fillOpacity * Math.min(1, g * 1.5);
    ctx.fillStyle = c.fillColor;
    if (c.style === "box") ctx.fill(path);
    else ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
  }
  ctx.lineJoin = "miter";
  ctx.lineCap = "butt";
  if (c.outline && c.width > 0) {
    for (const [extra, color] of [
      [l.stroke2Width + (r.typography?.strokeWidth ?? 0), l.stroke2Color],
      [r.typography?.strokeWidth ?? 0, r.typography?.strokeColor ?? "#000000"],
    ] as const) {
      if (extra > 0) {
        ctx.lineWidth = c.width + extra * 2;
        ctx.strokeStyle = color;
        ctx.stroke(path);
      }
    }
  }
  if (c.width > 0) {
    ctx.lineWidth = c.width;
    ctx.strokeStyle = c.color;
    ctx.stroke(path);
  }
  ctx.restore();
}
