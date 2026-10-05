import { createStudioPresets } from "./studio-presets.js";
import { makeStudioSchema } from "./studio-schema.js";
import { particleFields } from "../../runtimes/shared/particle-options.js";
import { referencePresets } from "./reference-presets.js";
import {
  optionGroups,
  type LayoutOptions,
  type MotionOptions,
  type SequenceOptions,
  type BackdropOptions,
} from "../../runtimes/shared/options.js";
import { z } from "zod";
import {
  defaultBackground,
  defaultTypography,
  defaultFrame,
  textMotions,
  holdMotions,
  backgroundMotions,
  imageFilters,
  defaultImage,
  defaultParticles,
  type Recipe,
} from "../../runtimes/shared/motion.js";
export const targetSchema = z.enum(["flutter", "phaser", "three"]);
export type Target = z.infer<typeof targetSchema>;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const assetId = z.string().uuid().nullable();
const backgroundSchema = z
  .object({
    enabled: z.boolean(),
    assetId,
    fit: z.enum(["cover", "contain"]),
    color,
    endColor: color,
    motion: z.enum(backgroundMotions),
    assetIds: z.array(z.string().uuid()).max(8).default([]),
    filter: z.enum(imageFilters).default("none"),
    fadeDirection: z.enum(["out", "in"]).default("out"),
    transitionSource: z.enum(["images", "original-filter"]).default("images"),
    profile: z.enum(["legacy", "reference"]).default("legacy"),
    amount: z.number().min(0).max(1),
    fade: z.boolean(),
  })
  .strict();
const imageSchema = z
  .object({
    enabled: z.boolean(),
    assetId,
    fit: z.enum(["cover", "contain"]),
    x: z.number().min(-1920).max(1920),
    y: z.number().min(-1080).max(1080),
    scale: z.number().min(0.05).max(3),
    rotation: z.number().min(-360).max(360),
    opacity: z.number().min(0).max(1),
  })
  .strict()
  .refine((r) => !r.enabled || r.assetId !== null, "Select an image asset");
const particleExtras = Object.fromEntries(particleFields.map(f => {
  const schema: z.ZodType = f.type === 'boolean' ? z.boolean() : f.type === 'color' ? color : f.type === 'select'
    ? z.enum(f.options as [string, ...string[]]) : z.number().min(f.min!).max(f.max!);
  return [f.key, schema.default(f.value)];
}));
const particlesSchema = z
  .object({
    enabled: z.boolean(),
    ...particleExtras,
    preset: z.enum(["snow", "sparks", "confetti"]),
    emission: z.enum(["continuous", "burst"]),
    seed: z.number().int().min(0).max(2147483645),
    count: z.number().int().min(1).max(500),
    size: z.number().min(1).max(80),
    speed: z.number().min(0).max(1000),
    lifetime: z.number().min(0.1).max(30),
    gravity: z.number().min(-1000).max(1000),
    spread: z.number().min(0).max(360),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    color,
  })
  .strict();
const typographySchema = z
  .object({
    enabled: z.boolean(),
    subText: z.string().max(160),
    subSize: z.number().min(8).max(100),
    subColor: color,
    serif: z.boolean(),
    spacing: z.number().min(-80).max(480),
    subSpacing: z.number().min(-80).max(480),
    subPosition: z.enum(["above", "below"]),
    align: z.enum(["left", "center", "right"]),
    vertical: z.boolean(),
    x: z.number().min(-1920).max(1920),
    y: z.number().min(-1080).max(1080),
    strokeWidth: z.number().min(0).max(30),
    strokeColor: color,
    glow: z.number().min(0).max(150),
    glowColor: color,
    shadow: z.boolean(),
    gradient: z.boolean(),
    gradientColor: color,
    fillOpacity: z.number().min(0).max(1),
    plate: z.enum(["none", "band", "card"]),
    plateColor: color,
    plateOpacity: z.number().min(0).max(1),
    entrance: z.enum(textMotions),
    departure: z.enum(textMotions),
    holdMotion: z.enum(holdMotions),
    stagger: z.number().min(0).max(0.9),
    order: z.enum(["forward", "reverse", "center", "edges", "random"]),
    seed: z.number().int().min(0).max(2147483645),
  })
  .strict();
const optionSchemas = Object.fromEntries(
  optionGroups.map((group) => [
    group.group,
    z
      .object(
        Object.fromEntries(
          group.fields.map((f) => [
            f.key,
            (
              (f.type === "boolean"
                ? z.boolean()
                : f.type === "number"
                  ? z.number().min(f.min!).max(f.max!)
                  : f.type === "color"
                    ? color
                    : f.options && !["font", "subFont"].includes(f.key)
                      ? z.enum(f.options as [string, ...string[]])
                      : z.string().max(120)) as z.ZodTypeAny
            ).default(f.value),
          ]),
        ),
      )
      .strict()
      .prefault({}),
  ]),
) as unknown as {
  layout: z.ZodType<LayoutOptions>;
  motion: z.ZodType<MotionOptions>;
  sequence: z.ZodType<SequenceOptions>;
  backdrop: z.ZodType<BackdropOptions>;
};
export const recipeSchema = z
  .object({
    schemaVersion: z.literal(1),
    studio: makeStudioSchema(particlesSchema as unknown as z.ZodType<import("../../runtimes/shared/motion.js").Particles>).optional(),
    layout: optionSchemas.layout,
    motion: optionSchemas.motion,
    sequence: optionSchemas.sequence,
    backdrop: optionSchemas.backdrop,
    textVisible: z.boolean().default(true),
    typography: typographySchema.default(defaultTypography),
    frame: z
      .object({
        enabled: z.boolean(),
        style: z.enum([
          "title",
          "box",
          "corners",
          "band",
          "tape",
          "lines",
          "underline",
          "sides",
          "bar",
        ]),
        animation: z.enum(["draw", "fade", "none"]),
        outline: z.boolean().default(false),
        softness: z.number().min(0).max(1).default(0.5),
        sideFade: z.number().min(0).max(1).default(0.3),
        radius: z.number().min(0).max(1).default(0.2),
        tapeColor: color.default("#f5c400"),
        tapeStripe: color.default("#151515"),
        tapeSize: z.number().min(8).max(120).default(40),
        tapeSpeed: z.number().min(0).max(400).default(90),
        tapeBlink: z.number().min(0).max(1).default(0.5),
        duration: z.number().min(0).max(10),
        textDelay: z.number().min(0).max(3),
        color,
        width: z.number().min(0).max(20),
        fillColor: color,
        fillOpacity: z.number().min(0).max(1),
        padding: z.number().min(0).max(3),
        extend: z.number().min(0).max(20),
        inset: z.number().min(0).max(200),
      })
      .strict()
      .prefault(defaultFrame),
    background: backgroundSchema.prefault(defaultBackground),
    image: imageSchema.default(defaultImage),
    particles: particlesSchema.default(defaultParticles),
    text: z.string().min(1).max(6000),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    fontSize: z.number().min(8).max(400),
    width: z.number().int().min(240).max(1920),
    height: z.number().int().min(160).max(1920),
    enter: z.number().min(0).max(10),
    hold: z.number().min(0).max(30),
    exit: z.number().min(0).max(10),
    effect: z.enum(["fade", "slide", "pop"]),
    distance: z.number().min(0).max(400),
    loop: z.boolean(),
    loopCount: z.number().int().min(0).max(1000).default(0),
  })
  .strict()
  .refine(
    (r) => r.enter + r.hold + r.exit > 0,
    "Total duration must be positive",
  );
export const idSchema = z.string().uuid();
export const defaultRecipe: Recipe = {
  schemaVersion: 1,
  text: "BATTLE START",
  color: "#c6fa73",
  fontSize: 64,
  width: 960,
  height: 540,
  enter: 0.6,
  hold: 1.4,
  exit: 0.6,
  effect: "fade",
  distance: 60,
  loop: true,
};
export const presets = [
  {
    id: "battle",
    name: "전투 시작",
    description: "차분한 페이드 컷인",
    recipe: defaultRecipe,
  },
  {
    id: "chapter",
    name: "새로운 챕터",
    description: "아래에서 떠오르는 타이틀",
    recipe: {
      ...defaultRecipe,
      text: "CHAPTER 01\n새로운 여정",
      fontSize: 52,
      effect: "slide",
      color: "#92ccff",
    },
  },
  {
    id: "reward",
    name: "보상 획득",
    description: "가볍게 커지는 보상 알림",
    recipe: {
      ...defaultRecipe,
      text: "LEVEL UP!",
      effect: "pop",
      color: "#ffce85",
    },
  },
  {
    id: "cinematic",
    name: "시네마틱 배경",
    description: "천천히 다가오는 배경과 눈 입자",
    recipe: {
      ...defaultRecipe,
      text: "새로운 세계",
      hold: 4,
      background: { ...defaultBackground, enabled: true },
      particles: { ...defaultParticles, enabled: true, color: "#dcecff" },
    },
  },
  {
    id: "celebration",
    name: "축하 파티클",
    description: "코드로 흩날리는 색종이",
    recipe: {
      ...defaultRecipe,
      text: "VICTORY!",
      hold: 3,
      background: {
        ...defaultBackground,
        enabled: true,
        color: "#261634",
        endColor: "#723656",
        motion: "none",
      },
      particles: {
        ...defaultParticles,
        enabled: true,
        preset: "confetti",
        emission: "burst",
        count: 150,
        size: 8,
        speed: 300,
        gravity: 180,
        lifetime: 4,
      },
    },
  },
  {
    id: "embers",
    name: "불꽃",
    description: "시드로 재현하는 불꽃 방출",
    recipe: {
      ...defaultRecipe,
      text: "POWER UP",
      hold: 3,
      background: {
        ...defaultBackground,
        enabled: true,
        color: "#170e14",
        endColor: "#4b2119",
        motion: "shake",
        amount: 0.1,
      },
      particles: {
        ...defaultParticles,
        enabled: true,
        preset: "sparks",
        color: "#ffac50",
        gravity: -30,
        y: 0.85,
        spread: 100,
      },
    },
  },
  {
    id: "cutin",
    name: "전투 컷인",
    description: "한 획씩 그려지는 타이틀 틀 · 글자 등장",
    recipe: {
      ...defaultRecipe,
      text: "전투 개시",
      color: "#ffffff",
      fontSize: 88,
      frame: { ...defaultFrame, enabled: true },
      enter: 1,
      hold: 2.5,
      exit: 0.7,
      typography: { ...defaultTypography, enabled: true },
    },
  },
  {
    id: "neon",
    name: "네온 타이틀",
    description: "외곽선과 발광 · 글리치 등장",
    recipe: {
      ...defaultRecipe,
      text: "SYSTEM ONLINE",
      color: "#9cffff",
      fontSize: 60,
      typography: {
        ...defaultTypography,
        enabled: true,
        serif: false,
        subText: "CONNECTION ESTABLISHED",
        glow: 22,
        strokeWidth: 1,
        strokeColor: "#81ffff",
        entrance: "glitch",
        holdMotion: "glow",
      },
    },
  },
  {
    id: "location",
    name: "장소 · 시간",
    description: "하단 자막 · 반투명 패널",
    recipe: {
      ...defaultRecipe,
      text: "낡은 도서관",
      color: "#ffffff",
      fontSize: 44,
      hold: 3,
      typography: {
        ...defaultTypography,
        enabled: true,
        subText: "오후 11:42",
        subSize: 18,
        spacing: 4,
        subSpacing: 2,
        y: 150,
        plate: "band",
        entrance: "rise",
      },
    },
  },
  {
    id: "trailer",
    name: "트레일러 문장",
    description: "명조 문구 · 타자기 등장",
    recipe: {
      ...defaultRecipe,
      text: "그날 밤, 모든 것이 달라졌다.",
      color: "#ffffff",
      fontSize: 40,
      enter: 2,
      hold: 3,
      typography: {
        ...defaultTypography,
        enabled: true,
        subText: "",
        spacing: 4,
        entrance: "typewriter",
        stagger: 0.9,
      },
    },
  },
  ...referencePresets,
  ...createStudioPresets(defaultRecipe),
] as const;
export interface Project {
  id: string;
  name: string;
  revision: number;
  recipe: Recipe;
  updatedAt: string;
}
export type ProjectSnapshot = Pick<Project, "name" | "revision" | "recipe" | "updatedAt">;
export interface UserPreset {
  id: string;
  name: string;
  description: string;
  group: "user";
  recipe: Recipe;
  createdAt: string;
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export function errorResult(error: unknown) {
  if (error instanceof AppError)
    return { code: error.code, message: error.message, details: error.details };
  if (error instanceof z.ZodError)
    return {
      code: "INVALID_ARGUMENT",
      message: "입력값을 확인하세요.",
      details: error.issues,
    };
  return {
    code: "OPERATION_FAILED",
    message: error instanceof Error ? error.message : "Unknown failure",
  };
}
