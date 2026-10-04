import settings from "./reference-template-settings.json" with { type: "json" };
import catalog from "./reference-template-catalog.json" with { type: "json" };
import {
  defaultTypography,
  defaultFrame,
  type Recipe,
  type Typography,
  type Frame,
} from "../../runtimes/shared/motion.js";
import {
  defaultLayout,
  defaultMotion,
  defaultSequence,
} from "../../runtimes/shared/options.js";
const aliases: Record<string, Typography["entrance"]> = {
  converge: "split",
  blurIn: "blur",
  shrinkIn: "shrink",
  spin: "rotate",
  scatter: "gather",
  zoomIn: "approach",
  emerge: "recede",
  shutter: "unfold",
  blurOut: "blur",
  growOut: "grow-out",
  shrink: "pop",
  zoomThrough: "zoom-through",
};
const colors: Record<string, string> = {
  combat: "#ffffff",
  investigation: "#ffbd55",
  gm: "#82c5ff",
  scene: "#e9cb94",
  dice: "#91e9ff",
  trailer: "#ffffff",
  caption: "#ffffff",
};
export const referencePresets = catalog.map((meta) => {
  const accent = colors[meta.group] ?? "#ffffff";
  const recipe: Recipe = {
    schemaVersion: 1,
    text:
      meta.mode === "trailer"
        ? "문이 열렸다.\n숨겨진 이야기가 시작된다.\n\n마지막 선택이 남아 있다."
        : meta.mode === "location"
          ? "오래된 도서관"
          : meta.name,
    color: "#ffffff",
    fontSize:
      meta.mode === "trailer" ? 52 : meta.mode === "location" ? 64 : 110,
    width: 1280,
    height: 720,
    enter: 0.6,
    hold: 1.8,
    exit: 0.6,
    effect: "fade",
    distance: 80,
    loop: true,
    typography: {
      ...defaultTypography,
      enabled: true,
      subText:
        meta.mode === "trailer"
          ? ""
          : meta.mode === "location"
            ? "23:42"
            : meta.referenceId
                .replace(/([a-z])([A-Z])/g, "$1 $2")
                .toUpperCase(),
      subSize: 24,
      spacing: 12,
      subSpacing: 7,
      vertical: meta.vertical,
      gradient: meta.gradient,
      gradientColor: accent,
      entrance:
        aliases[meta.entrance] ?? (meta.entrance as Typography["entrance"]),
      departure:
        aliases[meta.departure] ?? (meta.departure as Typography["departure"]),
      holdMotion: (meta.hold === "glitch"
        ? "noise"
        : meta.hold === "flicker"
          ? "flash"
          : meta.hold) as Typography["holdMotion"],
      strokeWidth: meta.gradient ? 2 : 0,
      strokeColor: "#191923",
      glow: meta.gradient ? 20 : 0,
      glowColor: accent,
      subColor: accent,
    },
    layout: {
      ...defaultLayout,
      font: meta.font,
      weight: meta.weight,
      subFont: meta.subFont,
      subWeight: meta.subWeight,
      anchor: meta.anchor,
      marginX: 64,
      marginY: 56,
      subGap: 0.5,
      gradientThird: meta.gradient,
      gradientColor3: accent,
      stroke2Width: meta.referenceId.includes("Critical") ? 3 : 0,
    },
    motion: {
      ...defaultMotion,
      enabled: true,
      inStagger: 0.08,
      subMotion: "fade",
      subDelay: -0.15,
    },
    sequence: {
      ...defaultSequence,
      mode: meta.mode,
      reveal: meta.reveal,
      wrapChars: meta.mode === "trailer" ? 18 : 0,
      cursor:
        meta.referenceId === "typewriter" || meta.referenceId === "syslog",
    },
    frame: {
      ...defaultFrame,
      enabled: meta.decoration !== "none",
      style: (meta.decoration === "frame"
        ? "title"
        : meta.decoration === "none"
          ? "title"
          : meta.decoration) as Frame["style"],
      color: accent,
      fillOpacity: ["box", "band"].includes(meta.decoration) ? 0.65 : 0,
      extend: meta.decoration === "frame" ? 12 : 1.2,
      tapeColor: "#f5c400",
    },
  };
  const patch = (settings as Record<string, any>)[
    meta.id.replace("ref-caption-", "ref-location-")
  ];
  for (const key of Object.keys(patch))
    (recipe as any)[key] =
      typeof patch[key] === "object"
        ? { ...(recipe as any)[key], ...patch[key] }
        : patch[key];
  return {
    id: meta.id,
    name: meta.name,
    group: meta.mode,
    description: `${meta.mode === "trailer" ? "트레일러" : meta.mode === "location" ? "장소·시간" : "메시지"} · ${meta.decoration} · ${meta.entrance}`,
    recipe,
  };
});
export const stylePresets = [
  {
    id: "plain",
    name: "흰색 · 검은 외곽선",
    color: "#ffffff",
    secondary: "#ffffff",
    third: "#ffffff",
    stroke: "#15151d",
    width: 4,
    outer: 0,
    glow: 0,
    alpha: 1,
  },
  {
    id: "gold",
    name: "금색",
    color: "#fff7c7",
    secondary: "#e9bd4d",
    third: "#996a22",
    stroke: "#493316",
    width: 3,
    outer: 3,
    glow: 24,
    alpha: 1,
  },
  {
    id: "silver",
    name: "은색",
    color: "#ffffff",
    secondary: "#ced8e3",
    third: "#667e99",
    stroke: "#263244",
    width: 2,
    outer: 0,
    glow: 18,
    alpha: 1,
  },
  {
    id: "blood",
    name: "피",
    color: "#f87373",
    secondary: "#b82138",
    third: "#460f22",
    stroke: "#2b1018",
    width: 3,
    outer: 0,
    glow: 25,
    alpha: 1,
  },
  {
    id: "neon",
    name: "네온",
    color: "#e8ffff",
    secondary: "#60e3f3",
    third: "#387ba6",
    stroke: "#20b7d9",
    width: 1,
    outer: 0,
    glow: 32,
    alpha: 1,
  },
  {
    id: "eerie",
    name: "수상한 보라",
    color: "#eee0ff",
    secondary: "#b587ec",
    third: "#503074",
    stroke: "#210e32",
    width: 2,
    outer: 0,
    glow: 30,
    alpha: 1,
  },
  {
    id: "pop",
    name: "팝",
    color: "#fff2ab",
    secondary: "#ffd152",
    third: "#ef932b",
    stroke: "#633d16",
    width: 6,
    outer: 5,
    glow: 0,
    alpha: 1,
  },
  {
    id: "ghost",
    name: "고스트",
    color: "#eaf5ff",
    secondary: "#bfd6e8",
    third: "#9aaec6",
    stroke: "#ffffff",
    width: 0,
    outer: 0,
    glow: 26,
    alpha: 0.8,
  },
  {
    id: "ink",
    name: "먹",
    color: "#171c26",
    secondary: "#171c26",
    third: "#171c26",
    stroke: "#ffffff",
    width: 0,
    outer: 0,
    glow: 0,
    alpha: 1,
  },
  {
    id: "hollow",
    name: "속이 빈 글자",
    color: "#ffffff",
    secondary: "#ffffff",
    third: "#ffffff",
    stroke: "#ffffff",
    width: 3,
    outer: 0,
    glow: 0,
    alpha: 0,
  },
];
export const gradientPresets = [
  ["gold", "#fff7c7", "#e9bd4d", "#996a22"],
  ["silver", "#ffffff", "#ced8e3", "#667e99"],
  ["fire", "#fff4c1", "#ffc35b", "#ee6230"],
  ["ruby", "#ffa6b9", "#d52b58", "#60203c"],
  ["sapphire", "#e0f0ff", "#62a8f1", "#2b4988"],
  ["emerald", "#d4ffea", "#62d5a2", "#216851"],
  ["violet", "#eee0ff", "#b587ec", "#503074"],
  ["sunset", "#ffe6b4", "#ee9263", "#9e4361"],
  ["ice", "#ffffff", "#c5efff", "#689fc5"],
  ["sakura", "#fff2f7", "#f6bbd8", "#d777a8"],
];
