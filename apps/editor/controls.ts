import {
  textMotions,
  holdMotions,
  backgroundMotions,
  imageFilters,
} from "../../runtimes/shared/motion.js";
import { optionGroups } from "../../runtimes/shared/options.js";
import { particleFields } from "../../runtimes/shared/particle-options.js";
import { $ } from "./dom.js";

const optionLabels: Record<string, string> = {
  point: "한 점",
  box: "사각 영역",
  circle: "원",
  ring: "고리",
  star: "별",
  spark: "빛줄기",
  diamond: "마름모",
  petal: "꽃잎",
  smoke: "부드러운 연기",
  ballistic: "방향 · 중력",
  orbit: "공전",
  vortex: "중심으로 흡입",
  normal: "일반",
  add: "빛 더하기",
  auto: "자동",
  same: "메인과 같음",
  message: "메시지",
  trailer: "트레일러",
  location: "장소·시간",
  char: "한 글자씩",
  solo: "중앙에 한 글자씩 → 전체",
  spread: "중앙에서 펼치기",
  line: "한 줄씩",
  sweep: "줄을 따라 흐르기",
  all: "전체 동시",
  scroll: "스크롤",
  vertical: "세로",
  horizontal: "가로",
  diagonal: "대각선",
  forward: "순서대로",
  reverse: "역순",
  center: "중앙부터",
  edges: "양 끝부터",
  random: "무작위",
  out: "빠르게 시작",
  strong: "강하게 감속",
  smooth: "부드럽게",
  back: "반동",
  elastic: "탄성",
  bounce: "바운스",
  linear: "일정 속도",
  in: "가속",
  left: "왼쪽",
  right: "오른쪽",
  up: "위",
  down: "아래",
  lr: "왼쪽 → 오른쪽",
  rl: "오른쪽 → 왼쪽",
  tb: "위 → 아래",
  bt: "아래 → 위",
  v: "세로로 펼침",
  h: "가로로 펼침",
  fade: "페이드",
  rise: "떠오르기",
  blur: "흐림 해제",
  tracking: "자간 좁히기",
  typewriter: "타자기",
  slide: "슬라이드",
  none: "없음",
  solid: "단색",
  vignette: "가장자리",
  bottom: "아래쪽",
  top: "위쪽",
  tl: "왼쪽 위",
  tc: "가운데 위",
  tr: "오른쪽 위",
  ml: "왼쪽 가운데",
  mc: "가운데",
  mr: "오른쪽 가운데",
  bl: "왼쪽 아래",
  bc: "가운데 아래",
  br: "오른쪽 아래",
};
export function buildControls() {
  const particleSections = [
    [
      "모양 · 방출 영역",
      ["advanced", "shape", "emitter", "areaWidth", "areaHeight", "radius"],
    ],
    [
      "궤적 · 바람 · 회전",
      ["path", "direction", "orbitSpeed", "wind", "drag", "turbulence", "spin"],
    ],
    [
      "크기 · 수명 변화",
      [
        "sizeEnd",
        "sizeVariation",
        "speedVariation",
        "lifeVariation",
        "fadeIn",
        "fadeOut",
      ],
    ],
    ["색상 · 빛 · 잔광", ["colorEnd", "opacity", "glow", "blend", "trail"]],
    ["방출 타이밍", ["delay", "burstInterval", "prewarm", "sync"]],
  ] as const;
  const groups = [
    ...optionGroups,
    ...particleSections.map(([label, keys]) => ({
      group: "particles",
      label,
      fields: particleFields.filter((f) =>
        (keys as readonly string[]).includes(f.key),
      ),
    })),
  ];
  for (const group of groups) {
    const detail = document.createElement("details");
    detail.className = "typography-controls";
    const summary = document.createElement("summary");
    summary.textContent = group.label;
    detail.append(summary);
    for (const f of group.fields) {
      const label = document.createElement("label");
      label.className = f.type === "boolean" ? "toggle" : "field";
      label.textContent = f.label;
      const el =
        f.type === "select"
          ? document.createElement("select")
          : document.createElement("input");
      el.id = `${group.group}-${f.key}`;
      el.dataset.group = group.group;
      el.dataset.key = f.key;
      if (el instanceof HTMLSelectElement)
        el.replaceChildren(
          ...f.options!.map((v) => new Option(optionLabels[v] ?? v, v)),
        );
      else {
        el.type = f.type === "boolean" ? "checkbox" : f.type;
        if (f.min !== undefined) {
          el.min = String(f.min);
          el.max = String(f.max);
          el.step = String(f.step);
        }
      }
      if (f.type === "boolean") label.prepend(el);
      else label.append(el);
      if (group.group === "particles" && f.key === "advanced")
        $("particle-advanced").prepend(label);
      else detail.append(label);
    }
    $(
      group.group === "particles" ? "particle-advanced" : "advanced-text",
    ).append(detail);
  }
  const frameStyles = [
    ["title", "타이틀 틀"],
    ["box", "박스"],
    ["corners", "코너"],
    ["band", "띠"],
    ["tape", "경고 테이프"],
    ["lines", "위아래 라인"],
    ["underline", "밑줄"],
    ["sides", "사이드 라인"],
    ["bar", "악센트 바"],
  ];
  $<HTMLSelectElement>("frame-style").replaceChildren(
    ...frameStyles.map(([v, l]) => new Option(l, v)),
  );
  const motionLabels = [
    "정지",
    "줌 인",
    "줌 아웃",
    "왼쪽 이동",
    "오른쪽 이동",
    "위로 이동",
    "아래로 이동",
    "전체 흔들림 · 확대 없음",
    "가로 흔들림 · 확대 없음",
    "세로 흔들림 · 확대 없음",
    "비틀거림",
    "호흡",
    "좌우 팬",
    "회전 낙하 · 검정",
    "흡입 · 흰색",
    "흡입 · 검정",
    "수면 흔들림",
    "상승",
    "하강",
    "줌 인 · 흰색",
    "줌 인 · 검정",
    "줌 아웃 · 흰색",
    "줌 아웃 · 검정",
    "검정 페이드",
    "흰색 페이드",
    "투명 페이드",
    "크로스페이드",
    "하드 컷",
    "와이프",
  ];
  $<HTMLSelectElement>("background-motion").replaceChildren(
    ...backgroundMotions.map((m, i) => new Option(motionLabels[i], m)),
  );
  const filterLabels = [
    "없음",
    "흑백",
    "세피아",
    "포스터화",
    "대비 강조",
    "소프트 포커스",
    "선명하게",
    "검정 선화",
    "흰색 선화",
    "수묵화",
    "픽셀화",
    "노이즈",
    "CRT",
    "비네트",
    "색수차",
    "아침",
    "낮",
    "저녁",
    "밤",
    "깊은 밤",
    "달빛",
    "호러",
    "안개",
    "사이버",
    "수중",
    "꿈",
    "오래된 사진",
  ];
  $<HTMLSelectElement>("background-filter").replaceChildren(
    ...imageFilters.map((f, i) => new Option(filterLabels[i], f)),
  );
  const textLabels = [
    "페이드",
    "떠오르기",
    "내려오기",
    "위아래 합류",
    "슬라이드",
    "자간 좁히기",
    "중앙에서 펼치기",
    "흐림 해제",
    "팝",
    "크게 시작해 축소",
    "회전",
    "넘기기",
    "낙하 바운드",
    "집합",
    "타자기",
    "명멸",
    "내리치기",
    "다가오기",
    "안쪽에서 나타나기",
    "와이프",
    "펼치기",
    "글리치",
    "섬광",
    "유지 / 즉시 표시",
    "아래로 퇴장",
    "위아래 흩어짐",
    "확대 퇴장",
    "지우기",
    "줌 통과",
  ];
  for (const key of ["entrance", "departure"])
    $<HTMLSelectElement>(`typography-${key}`).replaceChildren(
      ...textMotions.map((m, i) => new Option(textLabels[i], m)),
    );
  $<HTMLSelectElement>("typography-holdMotion").replaceChildren(
    ...holdMotions.map(
      (m, i) =>
        new Option(
          [
            "없음",
            "둥실둥실",
            "물결",
            "고동",
            "떨림",
            "발광 명멸",
            "깜빡임",
            "점멸",
            "간헐적 노이즈",
          ][i],
          m,
        ),
    ),
  );
}
