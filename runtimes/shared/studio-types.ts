import type { Particles } from "./motion.js";
/** Optional composition extension; recipes without studio keep their v1 behavior. */
export type StudioValue = string | number | boolean;
export type StudioData = Record<string, StudioValue>;
export type StudioProperty =
  | "x"
  | "y"
  | "scale"
  | "rotation"
  | "opacity"
  | "value";
export interface StudioKeyframe {
  time: number;
  value: number;
  easing: "linear" | "in" | "out" | "smooth";
}
export interface StudioTrack {
  property: StudioProperty;
  keys: StudioKeyframe[];
}
export interface StudioCurvePoint {
  t: number;
  value: number;
}
export interface StudioSprite {
  columns: number;
  rows: number;
  frames: number;
  fps: number;
  loop: boolean;
}
export type StudioWidgetKind =
  | "button"
  | "health-bar"
  | "cooldown"
  | "toast"
  | "item-card";
export type StudioWidgetState = "normal" | "pressed" | "selected" | "disabled";
export interface StudioWidgetStyle {
  color: string;
  background: string;
  scale: number;
  opacity: number;
}
export interface StudioWidget {
  kind: StudioWidgetKind;
  value: number;
  max: number;
  label: string;
  background: string;
  fill: string;
  border: string;
  radius: number;
  state: StudioWidgetState;
  transition: number;
  states: Record<StudioWidgetState, StudioWidgetStyle>;
}
export interface StudioNode {
  id: string;
  name: string;
  kind: "group" | "text" | "image" | "particles" | "ui";
  parentId: string | null;
  enabled: boolean;
  locked: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  start: number;
  duration: number;
  text: string;
  fontSize: number;
  color: string;
  assetId: string | null;
  particles?: Particles;
  widget?: StudioWidget;
  sprite?: StudioSprite;
  tracks: StudioTrack[];
  curves?: {
    size: StudioCurvePoint[];
    opacity: StudioCurvePoint[];
    speed: StudioCurvePoint[];
  };
  follow?: { xKey: string; yKey: string; offsetX: number; offsetY: number };
}
export interface StudioBinding {
  nodeId: string;
  property:
    | "text"
    | "value"
    | "x"
    | "y"
    | "opacity"
    | "visible"
    | "state"
    | "color";
  key: string;
  scale: number;
  offset: number;
  min: number;
  max: number;
  format: string;
}
export interface StudioEvent {
  id: string;
  time: number;
  name: string;
  payload: StudioData;
}
export interface StudioQuality {
  level: "low" | "medium" | "high";
  reducedMotion: boolean;
  particleBudget: number;
  instances: number;
  fpsTarget: number;
}
export interface Studio {
  enabled: boolean;
  duration: number;
  nodes: StudioNode[];
  bindings: StudioBinding[];
  events: StudioEvent[];
  data: StudioData;
  quality: StudioQuality;
  space: "screen" | "world";
  worldScale: number;
  billboard: boolean;
}
export const defaultStudioQuality: StudioQuality = {
  level: "high",
  reducedMotion: false,
  particleBudget: 1000,
  instances: 1,
  fpsTarget: 60,
};
export const defaultStudio: Studio = {
  enabled: true,
  duration: 4,
  nodes: [],
  bindings: [],
  events: [],
  data: {},
  quality: defaultStudioQuality,
  space: "screen",
  worldScale: 0.01,
  billboard: true,
};
export function createStudioNode(
  kind: StudioNode["kind"],
  id: string,
  widgetKind: StudioWidgetKind = "button",
): StudioNode {
  const node: StudioNode = {
    id,
    name: kind,
    kind,
    parentId: null,
    enabled: true,
    locked: false,
    x: 480,
    y: 270,
    width: 240,
    height: 80,
    scale: 1,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    start: 0,
    duration: 4,
    text: "NEW LAYER",
    fontSize: 40,
    color: "#c6fa73",
    assetId: null,
    tracks: [],
  };
  if (kind === "ui")
    node.widget = {
      kind: widgetKind,
      value: 75,
      max: 100,
      label: widgetKind === "button" ? "START" : "HP",
      background: "#203129",
      fill: "#c6fa73",
      border: "#829a85",
      radius: 12,
      state: "normal",
      transition: 0.15,
      states: {
        normal: {
          color: "#ffffff",
          background: "#203129",
          scale: 1,
          opacity: 1,
        },
        pressed: {
          color: "#ffffff",
          background: "#46623b",
          scale: 0.94,
          opacity: 1,
        },
        selected: {
          color: "#c6fa73",
          background: "#354c2d",
          scale: 1.03,
          opacity: 1,
        },
        disabled: {
          color: "#a0a0a0",
          background: "#303030",
          scale: 1,
          opacity: 0.45,
        },
      },
    };
  return node;
}
