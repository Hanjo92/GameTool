import {
  createStudioNode,
  defaultStudio,
  type StudioNode,
} from "../../runtimes/shared/studio-types.js";
import { defaultParticles, type Recipe } from "../../runtimes/shared/motion.js";
import { particleStyles } from "../../runtimes/shared/particle-options.js";
/** Concrete editable examples; no external assets or game-specific dependencies. */
export function createStudioPresets(base: Recipe) {
  const node = (
    kind: StudioNode["kind"],
    id: string,
    x: number,
    y: number,
    widget?: "button" | "health-bar" | "cooldown" | "toast" | "item-card",
  ) => ({ ...createStudioNode(kind, id, widget), x, y, duration: 6 });
  const recipe = (nodes: StudioNode[]): Recipe => ({
    ...base,
    textVisible: false,
    studio: { ...structuredClone(defaultStudio), duration: 6, nodes },
  });
  const hp = node("ui", "hp", 300, 110, "health-bar");
  hp.name = "체력";
  hp.width = 440;
  hp.height = 46;
  hp.widget!.label = "HP {value}";
  hp.widget!.value = 75;
  const cooldown = node("ui", "cooldown", 790, 110, "cooldown");
  cooldown.name = "스킬 쿨다운";
  cooldown.fontSize = 18;
  cooldown.width = 90;
  cooldown.height = 90;
  cooldown.widget!.label = "SKILL";
  cooldown.widget!.value = 60;
  const button = node("ui", "action", 480, 390, "button");
  button.name = "스킬 버튼";
  button.fontSize = 28;
  button.widget!.label = "CAST";
  button.color = "#ffffff";
  const damage = node("text", "damage", 480, 260);
  damage.name = "피격 숫자";
  damage.text = "-120";
  damage.color = "#ff8e8e";
  damage.tracks = [
    {
      property: "y",
      keys: [
        { time: 0, value: 310, easing: "linear" },
        { time: 1, value: 220, easing: "out" },
      ],
    },
    {
      property: "opacity",
      keys: [
        { time: 0, value: 1, easing: "linear" },
        { time: 1.2, value: 0, easing: "out" },
      ],
    },
  ];
  const hud = recipe([hp, cooldown, button, damage]);
  hud.studio!.data = { hp: 75, cooldown: 60, damage: 120 };
  hud.studio!.bindings = [
    ["hp", "value", "hp"],
    ["cooldown", "value", "cooldown"],
    ["damage", "text", "damage"],
  ].map(([nodeId, property, key]) => ({
    nodeId,
    property: property as "value" | "text",
    key,
    scale: 1,
    offset: 0,
    min: 0,
    max: 10000,
    format: nodeId === "damage" ? "-{value}" : "{value}",
  }));
  const emitters = ["fireworks", "smoke", "shockwave"].map((id, index) => {
    const p = node("particles", id, 480, 270);
    p.name = ["파편", "연기", "충격파"][index];
    p.width = 500;
    p.height = 440;
    p.start = index * 0.1;
    p.zIndex = index;
    p.particles = {
      ...defaultParticles,
      ...particleStyles.find((s) => s.id === id)!.settings,
      enabled: true,
      advanced: true,
      seed: 42 + index,
    };
    return p;
  });
  const impact = recipe(emitters);
  impact.studio!.events = [
    {
      id: "impact-audio",
      time: 0.1,
      name: "audio.play",
      payload: { cue: "impact" },
    },
    {
      id: "impact-shake",
      time: 0.1,
      name: "camera.shake",
      payload: { intensity: 0.5, duration: 0.2 },
    },
  ];
  const card = node("ui", "reward", 480, 240, "item-card");
  card.name = "보상 카드";
  card.width = 280;
  card.height = 260;
  card.widget!.label = "EPIC RELIC";
  card.widget!.fill = "#cf97ff";
  card.widget!.border = "#cf97ff";
  card.widget!.state = "selected";
  card.tracks = [
    {
      property: "scale",
      keys: [
        { time: 0, value: 0.2, easing: "linear" },
        { time: 0.5, value: 1, easing: "out" },
      ],
    },
  ];
  const toast = node("ui", "notice", 480, 445, "toast");
  toast.name = "획득 알림";
  toast.width = 440;
  toast.height = 58;
  toast.widget!.label = "새로운 보상을 획득했습니다";
  toast.start = 0.5;
  const stars = node("particles", "stars", 480, 270);
  stars.name = "보상 별빛";
  stars.width = 450;
  stars.height = 400;
  stars.zIndex = -1;
  stars.particles = {
    ...defaultParticles,
    ...particleStyles.find((s) => s.id === "heal")!.settings,
    advanced: true,
    enabled: true,
  };
  const reward = recipe([stars, card, toast]);
  reward.studio!.events = [
    {
      id: "reward",
      time: 0.5,
      name: "reward.revealed",
      payload: { rarity: "epic" },
    },
  ];
  return [
    {
      id: "studio-hud",
      name: "Studio · 전투 HUD",
      description: "체력 · 쿨다운 · 버튼 · 피격 숫자와 데이터 바인딩",
      group: "studio",
      recipe: hud,
    },
    {
      id: "studio-impact",
      name: "Studio · 복합 폭발",
      description: "파편 · 연기 · 충격파와 효과음/카메라 이벤트",
      group: "studio",
      recipe: impact,
    },
    {
      id: "studio-reward",
      name: "Studio · 보상 획득",
      description: "아이템 카드 · 알림 · 별빛과 상태 전환",
      group: "studio",
      recipe: reward,
    },
  ];
}
