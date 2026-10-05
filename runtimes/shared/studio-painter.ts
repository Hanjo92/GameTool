import type { StudioFrame, StudioRuntime } from "./studio.js";
type Images = Map<string, HTMLImageElement | HTMLCanvasElement>;
/** One overlay draw per stress instance; profile reports CPU submission, not GPU timings. */
export function paintStudio(
  ctx: CanvasRenderingContext2D,
  runtime: StudioRuntime,
  time: number,
  images: Images,
  skipParticles = false,
) {
  const started = performance.now(),
    frames = runtime.frames(time),
    count = runtime.quality.instances;
  for (let instance = 0; instance < count; instance++)
    for (const f of frames) {
      if (
        !f.visible ||
        f.kind === "group" ||
        f.opacity <= 0 ||
        (skipParticles && f.kind === "particles")
      )
        continue;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate((f.rotation * Math.PI) / 180);
      const scale = f.scale * (f.style?.scale ?? 1);
      ctx.scale(scale, scale);
      ctx.globalAlpha = f.opacity * (f.style?.opacity ?? 1);
      if (f.kind === "particles") paintParticles(ctx, f, images);
      else if (f.kind === "image") {
        const image = f.assetId && images.get(f.assetId);
        if (image)
          sprite(ctx, image, f, -f.width / 2, -f.height / 2, f.width, f.height);
      } else if (f.kind === "ui" && f.widget) paintWidget(ctx, f, images);
      else text(ctx, f.text, f.fontSize, f.color, f.width);
      ctx.restore();
    }
  runtime.recordFrame(performance.now() - started);
}
function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  size: number,
  color: string,
  width: number,
) {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px GameToolSans, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = value.split("\n");
  lines.forEach((line, i) =>
    ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * size * 1.2, width),
  );
}
function sprite(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  f: StudioFrame,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const s = f.sprite;
  if (!s) {
    ctx.drawImage(image, x, y, width, height);
    return;
  }
  const current = Math.floor(f.localTime * s.fps),
    frame = s.loop ? current % s.frames : Math.min(s.frames - 1, current),
    w = image.width / s.columns,
    h = image.height / s.rows;
  ctx.drawImage(
    image,
    (frame % s.columns) * w,
    Math.floor(frame / s.columns) * h,
    w,
    h,
    x,
    y,
    width,
    height,
  );
}
function paintWidget(
  ctx: CanvasRenderingContext2D,
  f: StudioFrame,
  images: Images,
) {
  const w = f.widget!,
    ratio = Math.max(0, Math.min(1, f.value / Math.max(0.0001, w.max))),
    r = Math.min(w.radius, f.width / 2, f.height / 2),
    background = f.style?.background ?? w.background;
  ctx.fillStyle = background;
  ctx.strokeStyle = w.border;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-f.width / 2, -f.height / 2, f.width, f.height, r);
  ctx.fill();
  ctx.stroke();
  if (w.kind === "health-bar") {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = w.fill;
    ctx.fillRect(-f.width / 2, -f.height / 2, f.width * ratio, f.height);
    ctx.restore();
  }
  if (w.kind === "cooldown") {
    const radius = Math.max(1, Math.min(f.width, f.height) / 2 - 5);
    ctx.beginPath();
    ctx.strokeStyle = w.fill;
    ctx.lineWidth = 6;
    ctx.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
    ctx.stroke();
  }
  if (w.kind === "item-card" && f.assetId && images.has(f.assetId)) {
    const size = Math.min(f.width * 0.65, f.height * 0.5);
    sprite(
      ctx,
      images.get(f.assetId)!,
      f,
      -size / 2,
      -f.height * 0.4,
      size,
      size,
    );
    ctx.translate(0, f.height * 0.3);
  }
  const label = (w.label || f.text)
    .replaceAll("{value}", String(Math.round(f.value)))
    .replaceAll("{max}", String(w.max));
  text(
    ctx,
    f.text !== f.name && f.text !== "NEW LAYER" && !w.label ? f.text : label,
    Math.min(f.fontSize, f.height * 0.45),
    f.style?.color ?? f.color,
    Math.max(1, f.width - 16),
  );
}
function paintParticles(
  ctx: CanvasRenderingContext2D,
  f: StudioFrame,
  images: Images,
) {
  const p = f.particles,
    image = f.assetId && images.get(f.assetId),
    alpha = ctx.globalAlpha;
  ctx.globalCompositeOperation = p?.blend === "add" ? "lighter" : "source-over";
  for (const point of f.points) {
    if (point.opacity <= 0 || point.size <= 0) continue;
    ctx.save();
    ctx.globalAlpha = alpha * point.opacity;
    const color =
      point.red === undefined
        ? (p?.color ?? f.color)
        : `rgb(${point.red},${point.green},${point.blue})`;
    if (p?.trail && point.tailX !== undefined && point.tailY !== undefined) {
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, point.size * 0.3);
      ctx.beginPath();
      ctx.moveTo(point.tailX, point.tailY);
      ctx.lineTo(point.x, point.y);
      ctx.stroke();
    }
    ctx.translate(point.x, point.y);
    ctx.rotate(point.rotation);
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    if (p?.glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = p.glow;
    }
    const d = point.size;
    if (image) sprite(ctx, image, f, -d / 2, -d / 2, d, d);
    else if (p?.shape === "ring") {
      ctx.lineWidth = Math.max(1, d * 0.035);
      ctx.beginPath();
      ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (["star", "diamond", "spark"].includes(p?.shape ?? "")) {
      const n = p?.shape === "star" ? 10 : 4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const a = (i * Math.PI * 2) / n - Math.PI / 2,
          r = d * (p?.shape === "star" && i % 2 ? 0.2 : 0.5),
          x = Math.cos(a) * r * (p?.shape === "spark" ? 3 : 1),
          y = Math.sin(a) * r * (p?.shape === "spark" ? 0.5 : 1);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    } else if (p?.shape === "petal") {
      ctx.beginPath();
      ctx.ellipse(0, 0, d * 0.3, d * 0.5, 0.4, 0, Math.PI * 2);
      ctx.fill();
    } else if (p?.shape === "smoke") {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, d / 2);
      g.addColorStop(0, color);
      g.addColorStop(
        1,
        color.startsWith("#")
          ? color + "00"
          : color.replace("rgb(", "rgba(").replace(")", ",0)"),
      );
      ctx.fillStyle = g;
      ctx.fillRect(-d / 2, -d / 2, d, d);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, d / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
