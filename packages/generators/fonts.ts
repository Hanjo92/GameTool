import { fontFallback } from "../../runtimes/shared/font-fallback.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import catalog from "../../assets/fonts/catalog.json" with { type: "json" };
import type { Recipe } from "../../runtimes/shared/motion.js";
import { defaultLayout } from "../../runtimes/shared/options.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
export const fontCatalog = () =>
  catalog.map((f) => ({
    id: f.id,
    family: f.family,
    category: f.category,
    weights: f.weights,
  }));
export async function bundleFonts(r: Recipe) {
  const l = { ...defaultLayout, ...r.layout },
    files: Record<string, Uint8Array> = {},
    registrations: {
      family: string;
      path: string;
      weight: number;
      italic: boolean;
      variable: boolean;
    }[] = [];
  const seen = new Set<string>();
  const selections: [string, number, boolean][] = [
    [l.font, l.weight, l.italic],
    [l.subFont === "same" ? l.font : l.subFont, l.subWeight, l.subItalic],
  ];
  for (const [id, w, i] of [...selections])
    if (fontFallback[id]) selections.push([fontFallback[id], w, i]);
  for (const [id, weight, italic] of selections) {
    if (["auto", "same", "serif", "sans"].includes(id)) continue;
    if (id.startsWith("local:")) {
      if (!/^local:[\p{L}\p{N} _-]{1,80}$/u.test(id))
        throw new Error("Invalid local font family");
      continue;
    }
    const family = `GameToolFont_${id}`;
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id)) {
      if (!seen.has(id)) {
        registrations.push({
          family,
          path: `assets/fonts/${id}.ttf`,
          weight: 0,
          italic: false,
          variable: true,
        });
        seen.add(id);
      }
      continue;
    }
    const font = catalog.find((f) => f.id === id) as any;
    if (!font?.files?.length)
      throw new Error(
        `Font unavailable: ${id}. Run npm run fonts:cache or import the font file.`,
      );
    const candidates = font.files.filter((f: any) => f.italic === italic),
      pool = candidates.length
        ? candidates
        : font.files.filter((f: any) => !f.italic);
    const variant = [...pool].sort(
      (a: any, b: any) =>
        (a.variable ? 0 : Math.abs(a.weight - weight)) -
        (b.variable ? 0 : Math.abs(b.weight - weight)),
    )[0];
    const path = `assets/fonts/${id}/${variant.file}`;
    if (seen.has(path)) continue;
    seen.add(path);
    files[path] = await readFile(
      join(root, "assets/fonts/catalog", id, variant.file),
    );
    files[`assets/fonts/${id}/${font.license}`] = await readFile(
      join(root, "assets/fonts/catalog", id, font.license),
    );
    registrations.push({
      family,
      path,
      weight: variant.weight,
      italic: variant.italic,
      variable: variant.variable,
    });
  }
  return { files, registrations };
}
