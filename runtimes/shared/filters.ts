import { randomAt, type ImageFilter } from "./motion.js";
/** Local pixel transforms, evaluated once on image load. Does not modify the input image. */
export function filterPixels(
  source: Uint8ClampedArray,
  w: number,
  h: number,
  filter: ImageFilter,
) {
  const grades: Record<string, number[]> = {
    morning: [1.08, 1.01, 0.94, 8],
    day: [1.05, 1.05, 1.02, 5],
    evening: [1.18, 0.86, 0.66, 0],
    night: [0.45, 0.55, 0.85, 0],
    midnight: [0.2, 0.27, 0.45, 0],
    moonlight: [0.55, 0.7, 1.05, 0],
    horror: [0.65, 0.78, 0.62, -14],
    fog: [0.65, 0.7, 0.75, 65],
    cyber: [0.9, 0.6, 1.25, 5],
    underwater: [0.5, 0.9, 1.04, 0],
    dream: [1.05, 0.94, 1.08, 12],
    "old-photo": [0.9, 0.85, 0.7, 12],
  };
  const out = new Uint8ClampedArray(source);
  const sample = (x: number, y: number, c: number) =>
    source[
      (Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))) *
        4 +
        c
    ];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      let r = source[i],
        g = source[i + 1],
        b = source[i + 2];
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      if (filter === "grayscale") r = g = b = l;
      if (filter === "sepia" || filter === "old-photo") {
        r = 0.393 * source[i] + 0.769 * g + 0.189 * b;
        g = 0.349 * source[i] + 0.686 * source[i + 1] + 0.168 * b;
        b = 0.272 * source[i] + 0.534 * source[i + 1] + 0.131 * b;
      }
      if (filter === "posterize") {
        r = Math.round(r / 64) * 64;
        g = Math.round(g / 64) * 64;
        b = Math.round(b / 64) * 64;
      }
      if (filter === "contrast") {
        r = (r - 128) * 1.35 + 128;
        g = (g - 128) * 1.35 + 128;
        b = (b - 128) * 1.35 + 128;
      }
      if (["soft-focus", "dream", "sharp"].includes(filter)) {
        const blur = [0, 1, 2].map(
          (c) =>
            (sample(x - 2, y, c) +
              sample(x + 2, y, c) +
              sample(x, y - 2, c) +
              sample(x, y + 2, c) +
              sample(x, y, c) * 4) /
            8,
        );
        if (filter === "sharp") {
          r = r * 2 - blur[0];
          g = g * 2 - blur[1];
          b = b * 2 - blur[2];
        } else {
          r = blur[0] * 1.1 + 8;
          g = blur[1] * 1.1 + 8;
          b = blur[2] * 1.1 + 12;
        }
      }
      if (["edges", "white-edges", "ink"].includes(filter)) {
        const edge = Math.min(
          255,
          [0, 1, 2].reduce(
            (a, c) =>
              a +
              Math.abs(sample(x + 1, y, c) - sample(x - 1, y, c)) +
              Math.abs(sample(x, y + 1, c) - sample(x, y - 1, c)),
            0,
          ),
        );
        r =
          g =
          b =
            filter === "white-edges"
              ? edge
              : filter === "ink"
                ? Math.max(0, l * 1.15 - edge)
                : 255 - edge;
      }
      if (filter === "pixelate") {
        const px = Math.floor(x / 8) * 8,
          py = Math.floor(y / 8) * 8;
        r = sample(px, py, 0);
        g = sample(px, py, 1);
        b = sample(px, py, 2);
      }
      if (filter === "noise" || filter === "old-photo") {
        const n = (randomAt(71, y * w + x, 0) - 0.5) * 36;
        r += n;
        g += n;
        b += n;
      }
      if (filter === "chromatic" || filter === "crt") {
        r = sample(x - 3, y, 0);
        b = sample(x + 3, y, 2);
        if (filter === "crt" && y % 4 < 2) {
          r *= 0.7;
          g *= 0.7;
          b *= 0.7;
        }
      }
      if (filter === "vignette" || filter === "horror") {
        const d = ((x / w - 0.5) ** 2 + (y / h - 0.5) ** 2) * 2,
          k = Math.max(0.15, 1 - d * 0.95);
        r *= k;
        g *= k;
        b *= k;
      }
      const grade = grades[filter];
      if (grade) {
        r = r * grade[0] + grade[3];
        g = g * grade[1] + grade[3];
        b = b * grade[2] + grade[3];
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
    }
  return out;
}
export function filterImage(image: HTMLImageElement, filter: ImageFilter) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  data.data.set(filterPixels(data.data, canvas.width, canvas.height, filter));
  ctx.putImageData(data, 0, 0);
  return canvas;
}
