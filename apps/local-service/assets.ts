import { fontFormat, normalizeFont } from "./font-import.js";
import sharp from "sharp";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { AppError, idSchema } from "../../packages/core/model.js";
import type { Asset, AssetStore } from "../../packages/core/application.js";
import { atomicJson } from "./repository.js";
const hash = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
/** Accept bytes, never arbitrary filesystem paths or remote URLs. Originals are immutable. */
export class LocalAssets implements AssetStore {
  constructor(private root: string) {}
  async list(): Promise<Asset[]> {
    await mkdir(join(this.root, "assets"), { recursive: true });
    const ids = await readdir(join(this.root, "assets"));
    return Promise.all(
      ids
        .filter((id) => idSchema.safeParse(id).success)
        .map((id) => this.get(id)),
    );
  }
  async get(id: string): Promise<Asset> {
    try {
      return JSON.parse(
        await readFile(
          join(this.root, "assets", idSchema.parse(id), "asset.json"),
          "utf8",
        ),
      );
    } catch (e: any) {
      if (e.code === "ENOENT")
        throw new AppError("ASSET_NOT_FOUND", "이미지를 다시 가져오세요.");
      throw e;
    }
  }
  async bytes(id: string) {
    const a = await this.get(id);
    const bytes = await readFile(
      join(
        this.root,
        "assets",
        a.id,
        a.kind === "font" ? "font.ttf" : "image.png",
      ),
    );
    if (hash(bytes) !== a.runtimeHash)
      throw new AppError(
        "ASSET_CHANGED",
        "보관된 이미지가 변경되었습니다. 다시 가져오세요.",
      );
    return bytes;
  }
  private async importFont(name: string, original: Buffer): Promise<Asset> {
    const font = await normalizeFont(original),
      id = randomUUID(),
      dir = join(this.root, "assets", id),
      temp = dir + ".tmp";
    const asset: Asset = {
      id,
      name,
      kind: "font",
      family: font.family,
      width: 0,
      height: 0,
      format: font.format,
      bytes: original.length,
      originalHash: hash(original),
      runtimeHash: hash(font.bytes),
      createdAt: new Date().toISOString(),
    };
    try {
      await mkdir(temp, { recursive: true });
      await writeFile(join(temp, "original"), original, {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(join(temp, "font.ttf"), font.bytes, {
        flag: "wx",
        mode: 0o600,
      });
      await atomicJson(join(temp, "asset.json"), asset);
      await rename(temp, dir);
      return asset;
    } catch (error) {
      await rm(temp, { recursive: true, force: true });
      throw error;
    }
  }
  async import(name: string, dataBase64: string): Promise<Asset> {
    if (
      dataBase64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(dataBase64)
    )
      throw new AppError("INVALID_IMAGE", "Invalid base64");
    const original = Buffer.from(dataBase64, "base64");
    if (fontFormat(original)) return this.importFont(name, original);
    if (!original.length || original.length > 8 * 1024 * 1024)
      throw new AppError("LIMIT_EXCEEDED", "이미지는 최대 8 MiB입니다.");
    // libvips can expose only the first APNG frame; reject its animation control chunk explicitly.
    if (
      original
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      for (let offset = 8; offset + 12 <= original.length; ) {
        const size = original.readUInt32BE(offset);
        if (original.toString("ascii", offset + 4, offset + 8) === "acTL")
          throw new AppError("INVALID_IMAGE", "Animated PNG is not supported");
        offset += 12 + size;
      }
    }
    let runtime: Buffer, width: number, height: number, format: string;
    try {
      const input = sharp(original, {
        limitInputPixels: 16000000,
        failOn: "warning",
      });
      const meta = await input.metadata();
      if (
        !["png", "jpeg", "webp"].includes(meta.format ?? "") ||
        (meta.pages ?? 1) > 1
      )
        throw new Error("Only still PNG, JPEG and WebP images are supported");
      const result = await input
        .rotate()
        .png()
        .toBuffer({ resolveWithObject: true });
      runtime = result.data;
      width = result.info.width;
      height = result.info.height;
      format = meta.format!;
    } catch (e: any) {
      throw new AppError("INVALID_IMAGE", e.message);
    }
    const id = randomUUID(),
      dir = join(this.root, "assets", id),
      temp = dir + ".tmp";
    const asset: Asset = {
      id,
      name,
      width,
      height,
      format,
      bytes: original.length,
      originalHash: hash(original),
      runtimeHash: hash(runtime),
      createdAt: new Date().toISOString(),
    };
    try {
      await mkdir(temp, { recursive: true });
      await writeFile(join(temp, "original"), original, {
        flag: "wx",
        mode: 0o600,
      });
      await writeFile(join(temp, "image.png"), runtime, {
        flag: "wx",
        mode: 0o600,
      });
      await atomicJson(join(temp, "asset.json"), asset);
      await rename(temp, dir);
      return asset;
    } catch (e) {
      await rm(temp, { recursive: true, force: true });
      throw e;
    }
  }
}
