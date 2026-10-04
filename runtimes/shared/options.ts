/** Shared defaults and editor metadata; no engine or persistence dependencies. */
export interface OptionField {
  key: string;
  label: string;
  type: string;
  value: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}
export interface LayoutOptions {
  font: string;
  subFont: string;
  weight: number;
  subWeight: number;
  italic: boolean;
  subItalic: boolean;
  subColorInherited: boolean;
  lineHeight: number;
  subGap: number;
  autoFit: boolean;
  anchor: string;
  marginX: number;
  marginY: number;
  stroke2Width: number;
  stroke2Color: string;
  gradientThird: boolean;
  gradientColor3: string;
  gradientDirection: string;
  shadowColor: string;
  shadowOpacity: number;
  shadowBlur: number;
  shadowX: number;
  shadowY: number;
  glowStrength: number;
  glitchColor: string;
  glitchColor2: string;
  cursorColor: string;
}
export const defaultLayout: LayoutOptions = {
  font: "auto",
  subFont: "same",
  weight: 700,
  subWeight: 500,
  italic: false,
  subItalic: false,
  subColorInherited: false,
  lineHeight: 1.4,
  subGap: 0.3,
  autoFit: true,
  anchor: "mc",
  marginX: 32,
  marginY: 28,
  stroke2Width: 0,
  stroke2Color: "#ffffff",
  gradientThird: false,
  gradientColor3: "#ff8a00",
  gradientDirection: "vertical",
  shadowColor: "#000000",
  shadowOpacity: 0.53,
  shadowBlur: 8,
  shadowX: 0,
  shadowY: 3,
  glowStrength: 1,
  glitchColor: "#ff285a",
  glitchColor2: "#28e6ff",
  cursorColor: "#ffffff",
};
export interface MotionOptions {
  enabled: boolean;
  inStagger: number;
  outStagger: number;
  outOrder: string;
  inEase: string;
  outEase: string;
  inDirection: string;
  outDirection: string;
  inPower: number;
  outPower: number;
  holdPower: number;
  outEnabled: boolean;
  subMotion: string;
  subDelay: number;
  startDelay: number;
  endDelay: number;
}
export const defaultMotion: MotionOptions = {
  enabled: false,
  inStagger: 0.1,
  outStagger: 0,
  outOrder: "forward",
  inEase: "auto",
  outEase: "auto",
  inDirection: "left",
  outDirection: "left",
  inPower: 1,
  outPower: 1,
  holdPower: 1,
  outEnabled: true,
  subMotion: "same",
  subDelay: -0.2,
  startDelay: 0.1,
  endDelay: 0.3,
};
export interface SequenceOptions {
  mode: string;
  reveal: string;
  wrapChars: number;
  pageSplit: boolean;
  cps: number;
  glyphDuration: number;
  punctPause: number;
  linePause: number;
  lineInterval: number;
  sweepDuration: number;
  pageGap: number;
  cursor: boolean;
  scrollSpeed: number;
  scrollFade: boolean;
  soloSize: number;
  soloPause: number;
  soloImpact: number;
  spreadHold: number;
  spreadDuration: number;
}
export const defaultSequence: SequenceOptions = {
  mode: "message",
  reveal: "char",
  wrapChars: 0,
  pageSplit: true,
  cps: 12,
  glyphDuration: 0.4,
  punctPause: 0.25,
  linePause: 0.35,
  lineInterval: 0.9,
  sweepDuration: 1.2,
  pageGap: 0.3,
  cursor: false,
  scrollSpeed: 90,
  scrollFade: true,
  soloSize: 0.55,
  soloPause: 0.4,
  soloImpact: 1,
  spreadHold: 0.5,
  spreadDuration: 0.9,
};
export interface BackdropOptions {
  type: string;
  color: string;
  opacity: number;
  sync: boolean;
}
export const defaultBackdrop: BackdropOptions = {
  type: "none",
  color: "#000000",
  opacity: 0.45,
  sync: true,
};
export const optionGroups: {
  group: string;
  label: string;
  fields: OptionField[];
}[] = [
  {
    group: "layout",
    label: "폰트 · 배치 · 세부 장식",
    fields: [
      {
        key: "font",
        label: "메인 폰트",
        type: "select",
        value: "auto",
        options: ["auto", "serif", "sans"],
      },
      {
        key: "subFont",
        label: "서브 폰트",
        type: "select",
        value: "same",
        options: ["same", "auto", "serif", "sans"],
      },
      {
        key: "weight",
        label: "메인 굵기",
        type: "number",
        value: 700,
        min: 100,
        max: 900,
        step: 100,
      },
      {
        key: "subWeight",
        label: "서브 굵기",
        type: "number",
        value: 500,
        min: 100,
        max: 900,
        step: 100,
      },
      {
        key: "italic",
        label: "메인 기울임",
        type: "boolean",
        value: false,
      },
      {
        key: "subColorInherited",
        label: "서브 문구에 메인 색상 사용",
        type: "boolean",
        value: false,
      },
      {
        key: "subItalic",
        label: "서브 기울임",
        type: "boolean",
        value: false,
      },
      {
        key: "lineHeight",
        label: "행간 배율",
        type: "number",
        value: 1.4,
        min: 0.9,
        max: 3.2,
        step: 0.05,
      },
      {
        key: "subGap",
        label: "서브 간격 (em)",
        type: "number",
        value: 0.3,
        min: 0,
        max: 1.5,
        step: 0.01,
      },
      {
        key: "autoFit",
        label: "넘치면 자동 축소",
        type: "boolean",
        value: true,
      },
      {
        key: "anchor",
        label: "기준 위치",
        type: "select",
        value: "mc",
        options: ["tl", "tc", "tr", "ml", "mc", "mr", "bl", "bc", "br"],
      },
      {
        key: "marginX",
        label: "좌우 여백",
        type: "number",
        value: 32,
        min: 0,
        max: 400,
        step: 1,
      },
      {
        key: "marginY",
        label: "상하 여백",
        type: "number",
        value: 28,
        min: 0,
        max: 400,
        step: 1,
      },
      {
        key: "stroke2Width",
        label: "바깥 외곽선 두께",
        type: "number",
        value: 0,
        min: 0,
        max: 40,
        step: 0.5,
      },
      {
        key: "stroke2Color",
        label: "바깥 외곽선 색",
        type: "color",
        value: "#ffffff",
      },
      {
        key: "gradientThird",
        label: "세 번째 색 사용",
        type: "boolean",
        value: false,
      },
      {
        key: "gradientColor3",
        label: "그라데이션 색 3",
        type: "color",
        value: "#ff8a00",
      },
      {
        key: "gradientDirection",
        label: "그라데이션 방향",
        type: "select",
        value: "vertical",
        options: ["vertical", "horizontal", "diagonal"],
      },
      {
        key: "shadowColor",
        label: "그림자 색",
        type: "color",
        value: "#000000",
      },
      {
        key: "shadowOpacity",
        label: "그림자 농도",
        type: "number",
        value: 0.53,
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: "shadowBlur",
        label: "그림자 흐림",
        type: "number",
        value: 8,
        min: 0,
        max: 80,
        step: 1,
      },
      {
        key: "shadowX",
        label: "그림자 가로 이동",
        type: "number",
        value: 0,
        min: -60,
        max: 60,
        step: 1,
      },
      {
        key: "shadowY",
        label: "그림자 세로 이동",
        type: "number",
        value: 3,
        min: -60,
        max: 60,
        step: 1,
      },
      {
        key: "glowStrength",
        label: "광채 강도",
        type: "number",
        value: 1,
        min: 0.2,
        max: 3,
        step: 0.05,
      },
      {
        key: "glitchColor",
        label: "글리치 색 1",
        type: "color",
        value: "#ff285a",
      },
      {
        key: "glitchColor2",
        label: "글리치 색 2",
        type: "color",
        value: "#28e6ff",
      },
      {
        key: "cursorColor",
        label: "입력 커서 색",
        type: "color",
        value: "#ffffff",
      },
    ],
  },
  {
    group: "motion",
    label: "정밀 등장 · 퇴장 · 서브 타이밍",
    fields: [
      {
        key: "enabled",
        label: "정밀 시간표 사용",
        type: "boolean",
        value: false,
      },
      {
        key: "inStagger",
        label: "등장 글자 간격 (초)",
        type: "number",
        value: 0.1,
        min: 0,
        max: 0.6,
        step: 0.01,
      },
      {
        key: "outStagger",
        label: "퇴장 글자 간격 (초)",
        type: "number",
        value: 0,
        min: 0,
        max: 0.6,
        step: 0.01,
      },
      {
        key: "outOrder",
        label: "퇴장 순서",
        type: "select",
        value: "forward",
        options: ["forward", "reverse", "center", "edges", "random"],
      },
      {
        key: "inEase",
        label: "등장 이징",
        type: "select",
        value: "auto",
        options: [
          "auto",
          "out",
          "strong",
          "smooth",
          "back",
          "elastic",
          "bounce",
          "linear",
          "in",
        ],
      },
      {
        key: "outEase",
        label: "퇴장 이징",
        type: "select",
        value: "auto",
        options: [
          "auto",
          "out",
          "strong",
          "smooth",
          "back",
          "elastic",
          "bounce",
          "linear",
          "in",
        ],
      },
      {
        key: "inDirection",
        label: "등장 방향",
        type: "select",
        value: "left",
        options: [
          "left",
          "right",
          "up",
          "down",
          "lr",
          "rl",
          "tb",
          "bt",
          "center",
          "v",
          "h",
        ],
      },
      {
        key: "outDirection",
        label: "퇴장 방향",
        type: "select",
        value: "left",
        options: [
          "left",
          "right",
          "up",
          "down",
          "lr",
          "rl",
          "tb",
          "bt",
          "center",
          "v",
          "h",
        ],
      },
      {
        key: "inPower",
        label: "등장 강도",
        type: "number",
        value: 1,
        min: 0.2,
        max: 2.5,
        step: 0.05,
      },
      {
        key: "outPower",
        label: "퇴장 강도",
        type: "number",
        value: 1,
        min: 0.2,
        max: 2.5,
        step: 0.05,
      },
      {
        key: "holdPower",
        label: "유지 모션 강도",
        type: "number",
        value: 1,
        min: 0.2,
        max: 3,
        step: 0.05,
      },
      {
        key: "outEnabled",
        label: "퇴장 사용",
        type: "boolean",
        value: true,
      },
      {
        key: "subMotion",
        label: "서브 등장",
        type: "select",
        value: "same",
        options: [
          "same",
          "fade",
          "rise",
          "blur",
          "tracking",
          "typewriter",
          "slide",
        ],
      },
      {
        key: "subDelay",
        label: "메인 완성 후 서브 지연 (초)",
        type: "number",
        value: -0.2,
        min: -3,
        max: 3,
        step: 0.05,
      },
      {
        key: "startDelay",
        label: "시작 전 공백 (초)",
        type: "number",
        value: 0.1,
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        key: "endDelay",
        label: "종료 후 공백 (초)",
        type: "number",
        value: 0.3,
        min: 0,
        max: 5,
        step: 0.05,
      },
    ],
  },
  {
    group: "sequence",
    label: "트레일러 · 페이지 · 표시 방식",
    fields: [
      {
        key: "mode",
        label: "텍스트 용도",
        type: "select",
        value: "message",
        options: ["message", "trailer", "location"],
      },
      {
        key: "reveal",
        label: "트레일러 표시 방식",
        type: "select",
        value: "char",
        options: ["char", "solo", "spread", "line", "sweep", "all", "scroll"],
      },
      {
        key: "wrapChars",
        label: "자동 줄바꿈 글자 수 (0=끄기)",
        type: "number",
        value: 0,
        min: 0,
        max: 60,
        step: 1,
      },
      {
        key: "pageSplit",
        label: "빈 줄에서 페이지 나누기",
        type: "boolean",
        value: true,
      },
      {
        key: "cps",
        label: "초당 글자 수",
        type: "number",
        value: 12,
        min: 2,
        max: 40,
        step: 1,
      },
      {
        key: "glyphDuration",
        label: "한 글자 등장 시간",
        type: "number",
        value: 0.4,
        min: 0,
        max: 2,
        step: 0.05,
      },
      {
        key: "punctPause",
        label: "문장 부호 간격",
        type: "number",
        value: 0.25,
        min: 0,
        max: 1.5,
        step: 0.05,
      },
      {
        key: "linePause",
        label: "줄바꿈 간격",
        type: "number",
        value: 0.35,
        min: 0,
        max: 2,
        step: 0.05,
      },
      {
        key: "lineInterval",
        label: "줄 등장 간격",
        type: "number",
        value: 0.9,
        min: 0.1,
        max: 4,
        step: 0.05,
      },
      {
        key: "sweepDuration",
        label: "한 줄 펼치기 시간",
        type: "number",
        value: 1.2,
        min: 0.2,
        max: 5,
        step: 0.05,
      },
      {
        key: "pageGap",
        label: "페이지 사이 공백",
        type: "number",
        value: 0.3,
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        key: "cursor",
        label: "입력 커서 표시",
        type: "boolean",
        value: false,
      },
      {
        key: "scrollSpeed",
        label: "스크롤 속도 (px/s)",
        type: "number",
        value: 90,
        min: 10,
        max: 400,
        step: 5,
      },
      {
        key: "scrollFade",
        label: "스크롤 가장자리 페이드",
        type: "boolean",
        value: true,
      },
      {
        key: "soloSize",
        label: "중앙 글자 크기 비율",
        type: "number",
        value: 0.55,
        min: 0.15,
        max: 0.9,
        step: 0.01,
      },
      {
        key: "soloPause",
        label: "전문 표시 전 공백",
        type: "number",
        value: 0.4,
        min: 0,
        max: 2,
        step: 0.05,
      },
      {
        key: "soloImpact",
        label: "전문 등장 충격",
        type: "number",
        value: 1,
        min: 0,
        max: 2,
        step: 0.05,
      },
      {
        key: "spreadHold",
        label: "중앙 겹침 유지",
        type: "number",
        value: 0.5,
        min: 0,
        max: 3,
        step: 0.05,
      },
      {
        key: "spreadDuration",
        label: "중앙에서 펼치는 시간",
        type: "number",
        value: 0.9,
        min: 0.1,
        max: 3,
        step: 0.05,
      },
    ],
  },
  {
    group: "backdrop",
    label: "전체 배경 장식",
    fields: [
      {
        key: "type",
        label: "전체 배경 장식",
        type: "select",
        value: "none",
        options: ["none", "solid", "vignette", "bottom", "top"],
      },
      {
        key: "color",
        label: "전체 배경 색",
        type: "color",
        value: "#000000",
      },
      {
        key: "opacity",
        label: "전체 배경 농도",
        type: "number",
        value: 0.45,
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        key: "sync",
        label: "텍스트와 함께 페이드",
        type: "boolean",
        value: true,
      },
    ],
  },
];
