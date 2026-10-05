import { defaultParticleOptions } from "./particle-options.js";
import { defaultBackdrop } from "./options.js";
import { paintTypography } from "./typography.js";
import { filterImage } from "./filters.js";
import {
  assetIds,
  backgroundAssetIds,
  backgroundAt,
  duration,
  evaluate,
  particlesAt,
  defaultBackground,
  defaultImage,
  defaultParticles,
  type Recipe,
} from "./motion.js";
export async function loadImages(
  recipe: Recipe,
  baseUrl = "assets/images/",
): Promise<Map<string, HTMLImageElement | HTMLCanvasElement>> {
  const entries = await Promise.all(
    assetIds(recipe).map(async (id) => {
      const image = new Image();
      image.src = `${baseUrl}${id}.png`;
      await image.decode();
      return [id, image] as const;
    }),
  );
  const images: Map<string, HTMLImageElement | HTMLCanvasElement> = new Map(
    entries,
  );
  if (recipe.background?.filter && recipe.background.filter !== "none")
    for (const id of backgroundAssetIds(recipe))
      images.set(
        id + ":background",
        filterImage(
          images.get(id) as HTMLImageElement,
          recipe.background.filter,
        ),
      );
  return images;
}
function drawImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | HTMLCanvasElement,
  w: number,
  h: number,
  fit: string,
) {
  const scale =
    fit === "cover"
      ? Math.max(w / image.width, h / image.height)
      : Math.min(w / image.width, h / image.height);
  ctx.drawImage(
    image,
    (-image.width * scale) / 2,
    (-image.height * scale) / 2,
    image.width * scale,
    image.height * scale,
  );
}
/** Draws procedural layers at absolute time. No captured animation frames. */
export function paintLayers(
  ctx: CanvasRenderingContext2D,
  r: Recipe,
  seconds: number,
  images: Map<string, HTMLImageElement | HTMLCanvasElement>,
) {
  ctx.clearRect(0, 0, r.width, r.height);
  const b = r.background ?? defaultBackground,
    s = backgroundAt(r, seconds);
  if (b.enabled) {
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.translate(r.width / 2 + s.x, r.height / 2 + s.y);
    ctx.rotate(s.rotation);
    ctx.scale(s.scale, s.scale);
    const gradient = ctx.createLinearGradient(
      -r.width / 2,
      -r.height / 2,
      r.width / 2,
      r.height / 2,
    );
    gradient.addColorStop(0, b.color);
    gradient.addColorStop(1, b.endColor);
    ctx.fillStyle = gradient;
    ctx.fillRect(-r.width / 2, -r.height / 2, r.width, r.height);
    const ids = backgroundAssetIds(r),
      transition = ["crossfade", "hard-cut", "wipe"].includes(b.motion);
    const draw = (id: string | undefined, original = false) => {
      if (!id) return;
      const img = original
        ? images.get(id)
        : (images.get(id + ":background") ?? images.get(id));
      if (!img) return;
      if (s.wave > 0) {
        for (let y = 0; y < r.height; y += 4) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(-r.width / 2, y - r.height / 2, r.width, 4);
          ctx.clip();
          ctx.translate(
            Math.sin(
              (y / r.height) * Math.PI * 6 +
                (evaluate(r, seconds).time / duration(r)) * Math.PI * 2,
            ) * s.wave,
            0,
          );
          drawImage(ctx, img, r.width, r.height, b.fit);
          ctx.restore();
        }
      } else drawImage(ctx, img, r.width, r.height, b.fit);
    };
    const single =
      transition &&
      (b.transitionSource === "original-filter" || ids.length === 1);
    draw(ids[transition ? s.index : 0], single);
    if (transition && (ids.length > 1 || single)) {
      ctx.save();
      if (b.motion === "crossfade") ctx.globalAlpha *= s.mix;
      if (b.motion === "wipe") {
        ctx.beginPath();
        ctx.rect(-r.width / 2, -r.height / 2, r.width * s.mix, r.height);
        ctx.clip();
      }
      if (b.motion !== "hard-cut" || s.mix >= 0.5)
        draw(ids[single ? 0 : s.next]);
      ctx.restore();
    }
    ctx.restore();
    if (s.overlay > 0) {
      ctx.save();
      ctx.globalAlpha = s.overlay * s.opacity;
      ctx.fillStyle = s.white ? "#ffffff" : "#000000";
      ctx.fillRect(0, 0, r.width, r.height);
      ctx.restore();
    }
  }
  const im = r.image ?? defaultImage;
  if (im.enabled && im.assetId) {
    const img = images.get(im.assetId);
    if (img) {
      ctx.save();
      ctx.translate(r.width / 2 + im.x, r.height / 2 + im.y);
      ctx.rotate((im.rotation * Math.PI) / 180);
      ctx.scale(im.scale, im.scale);
      ctx.globalAlpha = im.opacity;
      drawImage(ctx, img, r.width, r.height, im.fit);
      ctx.restore();
    }
  }
  const p = r.particles ?? defaultParticles;
  if (p.advanced) paintAdvancedParticles(ctx, r, seconds);
  else particlesAt(r, seconds).forEach((point, i) => {
    if (point.opacity <= 0) return;
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(point.rotation);
    ctx.globalAlpha = point.opacity;
    ctx.fillStyle =
      p.preset === "confetti"
        ? [p.color, "#ff79b0", "#7fdfff", "#ffe38b"][i % 4]
        : p.color;
    if (p.preset === "snow") {
      ctx.beginPath();
      ctx.arc(0, 0, point.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else
      ctx.fillRect(
        -point.size / 2,
        -point.size / 2,
        point.size,
        p.preset === "sparks" ? point.size * 0.3 : point.size * 0.6,
      );
    ctx.restore();
  });
  const backdrop = { ...defaultBackdrop, ...r.backdrop };
  if (backdrop.type !== "none") {
    ctx.save();
    ctx.globalAlpha =
      backdrop.opacity * (backdrop.sync ? evaluate(r, seconds).opacity : 1);
    if (backdrop.type === "solid") ctx.fillStyle = backdrop.color;
    else {
      const gradient =
        backdrop.type === "vignette"
          ? ctx.createRadialGradient(
              r.width / 2,
              r.height / 2,
              0,
              r.width / 2,
              r.height / 2,
              Math.max(r.width, r.height) * 0.7,
            )
          : ctx.createLinearGradient(0, 0, 0, r.height);
      gradient.addColorStop(
        0,
        backdrop.type === "top" ? backdrop.color : backdrop.color + "00",
      );
      gradient.addColorStop(
        1,
        backdrop.type === "top" ? backdrop.color + "00" : backdrop.color,
      );
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.restore();
  }
  paintTypography(ctx, r, seconds);
}

/** Draw procedural shapes and analytic trails without image assets. */
function paintAdvancedParticles(ctx: CanvasRenderingContext2D, r: Recipe, seconds: number) {
  const p = { ...defaultParticleOptions, ...r.particles };
  ctx.save();
  ctx.globalCompositeOperation = p.blend === 'add' ? 'lighter' : 'source-over';
  for (const point of particlesAt(r, seconds)) {
    if (point.opacity <= 0 || point.size <= .01) continue;
    const d = point.size, rgb = `${point.red},${point.green},${point.blue}`;
    const color = `rgb(${rgb})`;
    ctx.globalAlpha = point.opacity;
    if (p.trail > 0 && Math.hypot(point.x - point.tailX!, point.y - point.tailY!) > .01) {
      const gradient = ctx.createLinearGradient(point.tailX!, point.tailY!, point.x, point.y);
      gradient.addColorStop(0, `rgba(${rgb},0)`); gradient.addColorStop(1, color);
      ctx.strokeStyle = gradient; ctx.lineWidth = Math.max(1, d * .35); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(point.tailX!, point.tailY!); ctx.lineTo(point.x, point.y); ctx.stroke();
    }
    ctx.save(); ctx.translate(point.x, point.y); ctx.rotate(point.rotation);
    if (p.glow > 0) {
      const radius = d / 2 + p.glow;
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      gradient.addColorStop(0, `rgba(${rgb},.45)`); gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient; ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    }
    ctx.fillStyle = color; ctx.strokeStyle = color;
    ctx.beginPath();
    if (p.shape === 'smoke') {
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, d / 2);
      gradient.addColorStop(0, color); gradient.addColorStop(.45, `rgba(${rgb},.65)`); gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient; ctx.arc(0, 0, d / 2, 0, Math.PI * 2); ctx.fill();
    } else if (p.shape === 'ring') {
      ctx.lineWidth = Math.max(1, d * .035); ctx.arc(0, 0, d / 2, 0, Math.PI * 2); ctx.stroke();
    } else if (p.shape === 'star' || p.shape === 'diamond' || p.shape === 'spark') {
      const n = p.shape === 'star' ? 10 : 4;
      for (let i = 0; i < n; i++) {
        const a = i * Math.PI * 2 / n - Math.PI / 2;
        const radius = d * (p.shape === 'star' && i % 2 ? .2 : .5);
        const x = Math.cos(a) * radius * (p.shape === 'spark' ? 3 : 1), y = Math.sin(a) * radius * (p.shape === 'spark' ? .5 : 1);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.closePath(); ctx.fill();
    } else if (p.shape === 'petal') {
      ctx.moveTo(0, -d / 2); ctx.bezierCurveTo(d * .75, -d * .15, d * .25, d * .5, 0, d / 2);
      ctx.bezierCurveTo(-d * .5, d * .1, -d * .3, -d * .25, 0, -d / 2); ctx.fill();
    } else { ctx.arc(0, 0, d / 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
  }
  ctx.restore();
}
