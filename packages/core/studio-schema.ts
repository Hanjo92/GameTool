import { z } from "zod";
import {
  defaultStudioQuality,
  type Studio,
} from "../../runtimes/shared/studio-types.js";
import type { Particles } from "../../runtimes/shared/motion.js";
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
const key = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/)
  .refine(
    (k) => !["__proto__", "constructor", "prototype"].includes(k),
    "Reserved data key",
  );
const number = z.number().finite();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const studioDataSchema = z
  .record(
    key,
    z.union([number.min(-1e9).max(1e9), z.string().max(2000), z.boolean()]),
  )
  .refine(
    (data) => Object.keys(data).length <= 64,
    "At most 64 data parameters",
  );
const style = z
  .object({
    color,
    background: color,
    scale: number.min(0.1).max(4),
    opacity: number.min(0).max(1),
  })
  .strict();
const widget = z
  .object({
    kind: z.enum(["button", "health-bar", "cooldown", "toast", "item-card"]),
    value: number.min(-1e9).max(1e9),
    max: number.positive().max(1e9),
    label: z.string().max(240),
    background: color,
    fill: color,
    border: color,
    radius: number.min(0).max(200),
    state: z.enum(["normal", "pressed", "selected", "disabled"]),
    transition: number.min(0).max(5),
    states: z
      .object({
        normal: style,
        pressed: style,
        selected: style,
        disabled: style,
      })
      .strict(),
  })
  .strict();
const curve = z
  .array(
    z
      .object({ t: number.min(0).max(1), value: number.min(0).max(20) })
      .strict(),
  )
  .min(2)
  .max(16)
  .refine(
    (points) =>
      points[0].t === 0 &&
      points.at(-1)!.t === 1 &&
      points.every((p, i) => i === 0 || p.t > points[i - 1].t),
    "Curve must run from 0 to 1 with increasing times",
  );
export const studioQualitySchema = z
  .object({
    level: z.enum(["low", "medium", "high"]),
    reducedMotion: z.boolean(),
    particleBudget: number.int().min(0).max(5000),
    instances: number.int().min(1).max(32),
    fpsTarget: number.int().min(15).max(240),
  })
  .strict();
export function makeStudioSchema(
  particles: z.ZodType<Particles>,
): z.ZodType<Studio> {
  const node = z
    .object({
      id,
      name: z.string().min(1).max(80),
      kind: z.enum(["group", "text", "image", "particles", "ui"]),
      parentId: id.nullable(),
      enabled: z.boolean(),
      locked: z.boolean(),
      x: number.min(-10000).max(10000),
      y: number.min(-10000).max(10000),
      width: number.min(1).max(4096),
      height: number.min(1).max(4096),
      scale: number.min(0.01).max(20),
      rotation: number.min(-3600).max(3600),
      opacity: number.min(0).max(1),
      zIndex: number.int().min(-1000).max(1000),
      start: number.min(0).max(120),
      duration: number.min(0.01).max(120),
      text: z.string().max(2000),
      fontSize: number.min(8).max(400),
      color,
      assetId: z.string().uuid().nullable(),
      particles: particles.optional(),
      widget: widget.optional(),
      sprite: z
        .object({
          columns: number.int().min(1).max(64),
          rows: number.int().min(1).max(64),
          frames: number.int().min(1).max(4096),
          fps: number.min(0.1).max(120),
          loop: z.boolean(),
        })
        .strict()
        .refine((s) => s.frames <= s.columns * s.rows, "Frames exceed sheet")
        .optional(),
      tracks: z
        .array(
          z
            .object({
              property: z.enum([
                "x",
                "y",
                "scale",
                "rotation",
                "opacity",
                "value",
              ]),
              keys: z
                .array(
                  z
                    .object({
                      time: number.min(0).max(120),
                      value: number.min(-10000).max(10000),
                      easing: z.enum(["linear", "in", "out", "smooth"]),
                    })
                    .strict(),
                )
                .min(1)
                .max(32),
            })
            .strict(),
        )
        .max(6),
      curves: z
        .object({ size: curve, opacity: curve, speed: curve })
        .strict()
        .optional(),
      follow: z
        .object({
          xKey: key,
          yKey: key,
          offsetX: number.min(-10000).max(10000),
          offsetY: number.min(-10000).max(10000),
        })
        .strict()
        .optional(),
    })
    .strict()
    .superRefine((n, ctx) => {
      if (n.kind === "ui" && !n.widget)
        ctx.addIssue({
          code: "custom",
          path: ["widget"],
          message: "UI layer needs a widget",
        });
      if (n.kind === "particles" && !n.particles)
        ctx.addIssue({
          code: "custom",
          path: ["particles"],
          message: "Particle layer needs emitter settings",
        });
      if (n.kind === "image" && n.enabled && !n.assetId)
        ctx.addIssue({
          code: "custom",
          path: ["assetId"],
          message: "Image layer needs an asset",
        });
      if (new Set(n.tracks.map((t) => t.property)).size !== n.tracks.length)
        ctx.addIssue({
          code: "custom",
          path: ["tracks"],
          message: "Duplicate property track",
        });
      n.tracks.forEach((track, index) => {
        if (
          !track.keys.every(
            (k, i) =>
              k.time <= n.duration &&
              (i === 0 || k.time > track.keys[i - 1].time),
          )
        )
          ctx.addIssue({
            code: "custom",
            path: ["tracks", index],
            message:
              "Keyframes must be sorted, unique and within layer duration",
          });
        if (
          track.keys.some(
            (k) =>
              (track.property === "opacity" && (k.value < 0 || k.value > 1)) ||
              (track.property === "scale" && (k.value < 0.01 || k.value > 20)),
          )
        )
          ctx.addIssue({
            code: "custom",
            path: ["tracks", index],
            message: "Keyframe value outside property range",
          });
      });
    });
  return z
    .object({
      enabled: z.boolean(),
      duration: number.min(0.1).max(120),
      nodes: z.array(node).max(64),
      bindings: z
        .array(
          z
            .object({
              nodeId: id,
              property: z.enum([
                "text",
                "value",
                "x",
                "y",
                "opacity",
                "visible",
                "state",
                "color",
              ]),
              key,
              scale: number.min(-1e6).max(1e6),
              offset: number.min(-1e6).max(1e6),
              min: number.min(-1e9).max(1e9),
              max: number.min(-1e9).max(1e9),
              format: z.string().max(240),
            })
            .strict()
            .refine((b) => b.min <= b.max, "Binding min exceeds max"),
        )
        .max(128),
      events: z
        .array(
          z
            .object({
              id,
              time: number.min(0).max(120),
              name: key,
              payload: studioDataSchema,
            })
            .strict(),
        )
        .max(128),
      data: studioDataSchema,
      quality: studioQualitySchema.default(defaultStudioQuality),
      space: z.enum(["screen", "world"]),
      worldScale: number.min(0.0001).max(10),
      billboard: z.boolean(),
    })
    .strict()
    .superRefine((s, ctx) => {
      const byId = new Map(s.nodes.map((n) => [n.id, n]));
      if (byId.size !== s.nodes.length)
        ctx.addIssue({
          code: "custom",
          path: ["nodes"],
          message: "Layer IDs must be unique",
        });
      for (const [index, n] of s.nodes.entries()) {
        if (n.parentId && byId.get(n.parentId)?.kind !== "group")
          ctx.addIssue({
            code: "custom",
            path: ["nodes", index, "parentId"],
            message: "Parent must reference a group",
          });
        let parent = n.parentId;
        const seen = new Set([n.id]);
        while (parent) {
          if (seen.has(parent)) {
            ctx.addIssue({
              code: "custom",
              path: ["nodes", index, "parentId"],
              message: "Layer hierarchy cycle",
            });
            break;
          }
          seen.add(parent);
          parent = byId.get(parent)?.parentId ?? null;
        }
      }
      const bindings = new Set<string>();
      s.bindings.forEach((b, i) => {
        const token = `${b.nodeId}:${b.property}`;
        if (!byId.has(b.nodeId) || bindings.has(token))
          ctx.addIssue({
            code: "custom",
            path: ["bindings", i],
            message: "Binding references missing layer or duplicate property",
          });
        bindings.add(token);
      });
      if (new Set(s.events.map((e) => e.id)).size !== s.events.length)
        ctx.addIssue({
          code: "custom",
          path: ["events"],
          message: "Event IDs must be unique",
        });
      s.events.forEach((e, i) => {
        if (e.time > s.duration)
          ctx.addIssue({
            code: "custom",
            path: ["events", i, "time"],
            message: "Event exceeds composition duration",
          });
      });
    }) as z.ZodType<Studio>;
}
