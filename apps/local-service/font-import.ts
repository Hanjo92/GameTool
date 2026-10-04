import { createFont, woff2 } from "fonteditor-core";
import { inflateSync } from "node:zlib";
import { AppError } from "../../packages/core/model.js";
export function fontFormat(
  bytes: Buffer,
): "ttf" | "otf" | "woff" | "woff2" | undefined {
  const magic = bytes.toString("ascii", 0, 4);
  if (magic === "OTTO") return "otf";
  if (magic === "wOFF") return "woff";
  if (magic === "wOF2") return "woff2";
  if (bytes.length >= 12 && bytes.readUInt32BE(0) === 0x00010000) return "ttf";
  return undefined;
}
export async function normalizeFont(original: Buffer) {
  const type = fontFormat(original);
  if (!type)
    throw new AppError(
      "INVALID_FONT",
      "TTF / OTF / WOFF / WOFF2 파일을 선택하세요.",
    );
  if (original.length > 32 * 1024 * 1024)
    throw new AppError("LIMIT_EXCEEDED", "폰트는 최대 32 MiB입니다.");
  try {
    let bytes = original;
    if (type === "woff" || type === "woff2") {
      if (original.length < 48 || original.readUInt32BE(16) > 64 * 1024 * 1024)
        throw new Error("Decompressed font limit");
      if (type === "woff2") {
        await woff2.init();
        bytes = Buffer.from(woff2.decode(original));
      } else
        bytes = Buffer.from(
          createFont(original, {
            type: "woff",
            inflate: (data: any) => Array.from(inflateSync(Buffer.from(data))),
          }).write({ type: "ttf" }) as Uint8Array,
        );
    }
    const kind = fontFormat(bytes);
    if (kind !== "ttf" && kind !== "otf") throw new Error("Invalid sfnt");
    const font = createFont(bytes, {
      type: kind,
      hinting: true,
      kerning: true,
    });
    const info = font.get();
    if (!info.glyf?.length) throw new Error("Empty font");
    return {
      bytes,
      family: info.name?.fontFamily ?? "Imported font",
      format: type,
    };
  } catch (error: any) {
    throw new AppError(
      "INVALID_FONT",
      `폰트를 읽을 수 없습니다: ${error.message}`,
    );
  }
}
