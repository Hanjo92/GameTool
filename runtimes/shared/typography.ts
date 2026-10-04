import { fontFallback } from "./font-fallback.js";
import { defaultTypography, glyphAt, evaluate, type Recipe } from "./motion.js";
import { defaultLayout, defaultSequence } from "./options.js";
import { currentText, precise, pageAt, subtitleAt } from "./sequence.js";
import { paintDecoration } from "./decoration.js";
export const fontFamily = (id: string, serif: boolean) =>
  id === "same" || id === "auto"
    ? serif
      ? "GameToolSerif"
      : "GameToolSans"
    : id === "serif"
      ? "GameToolSerif"
      : id === "sans"
        ? "GameToolSans"
        : id.startsWith("local:")
          ? id.slice(6)
          : `GameToolFont_${id}`;
/** Text remains text: font metrics, paths, paint and per-glyph transforms are evaluated at runtime. */
export function paintTypography(
  ctx: CanvasRenderingContext2D,
  r: Recipe,
  seconds: number,
) {
  const c = r.typography ?? defaultTypography,
    l = { ...defaultLayout, ...r.layout },
    q = { ...defaultSequence, ...r.sequence };
  if ((!c.enabled && !r.frame?.enabled) || r.textVisible === false) return;
  const text = currentText(r, seconds),
    lines = text.split("\n"),
    family = fontFamily(l.font, c.serif),
    subFamily = l.subFont === "same" ? family : fontFamily(l.subFont, c.serif);
  const font = (size: number, sub = false) =>
    `${(sub ? l.subItalic : l.italic) ? "italic " : ""}${sub ? l.subWeight : l.weight} ${size}px "${sub ? subFamily : family}", ${fontFallback[sub && l.subFont !== "same" ? l.subFont : l.font] ? `GameToolFont_${fontFallback[sub && l.subFont !== "same" ? l.subFont : l.font]}, ` : ""}${c.serif ? "GameToolSerif, " : ""}GameToolSans`;
  ctx.font = font(r.fontSize);
  const widths = lines.map((line) =>
    Math.max(
      1,
      Array.from(line).reduce(
        (sum, ch) => sum + ctx.measureText(ch).width + c.spacing,
        0,
      ) - c.spacing,
    ),
  );
  const step = r.fontSize * l.lineHeight,
    vertical = c.vertical;
  const mainWidth = vertical
    ? Math.max(r.fontSize, (lines.length - 1) * step + r.fontSize)
    : Math.max(1, ...widths);
  const mainHeight = vertical
    ? Math.max(
        ...lines.map(
          (line) =>
            Math.max(1, Array.from(line).length) * (r.fontSize + c.spacing) -
            c.spacing,
        ),
      )
    : Math.max(r.fontSize, (lines.length - 1) * step + r.fontSize);
  const subText = q.mode === "trailer" ? "" : c.subText,
    subExtent = subText ? c.subSize + r.fontSize * l.subGap : 0;
  ctx.font = font(c.subSize, true);
  const subWidth =
    Array.from(subText).reduce(
      (n, ch) => n + ctx.measureText(ch).width + c.subSpacing,
      0,
    ) - c.subSpacing;
  ctx.font = font(r.fontSize);
  const width = vertical
      ? mainWidth + subExtent
      : Math.max(mainWidth, subWidth),
    height = vertical
      ? Math.max(
          mainHeight,
          Array.from(subText).length * (c.subSize + c.subSpacing) -
            c.subSpacing,
        )
      : mainHeight + subExtent;
  const subSign = c.subPosition === "above" ? -1 : 1;
  let fit = l.autoFit
    ? Math.min(
        1,
        (r.width - 2 * l.marginX) / Math.max(1, width),
        (r.height - 2 * l.marginY) / Math.max(1, height),
      )
    : 1;
  if (q.mode === "trailer" && q.reveal === "scroll")
    fit = l.autoFit
      ? Math.min(
          1,
          vertical
            ? (r.height - 2 * l.marginY) / mainHeight
            : (r.width - 2 * l.marginX) / mainWidth,
        )
      : 1;
  fit = Math.max(0.01, fit);
  const anchor = l.anchor,
    cx =
      (anchor[1] === "l"
        ? l.marginX + (width * fit) / 2
        : anchor[1] === "r"
          ? r.width - l.marginX - (width * fit) / 2
          : r.width / 2) +
      c.x +
      (precise(r) && vertical ? (subSign * subExtent * fit) / 2 : 0),
    cy =
      (anchor[0] === "t"
        ? l.marginY + (height * fit) / 2
        : anchor[0] === "b"
          ? r.height - l.marginY - (height * fit) / 2
          : r.height / 2) +
      c.y -
      (precise(r) && !vertical ? (subSign * subExtent * fit) / 2 : 0);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(fit, fit);
  const opacity = evaluate(r, seconds).opacity;
  if (c.plate !== "none") {
    ctx.save();
    ctx.globalAlpha = c.plateOpacity * opacity;
    ctx.fillStyle = c.plateColor;
    const w = c.plate === "band" ? r.width / fit : width + 80;
    ctx.fillRect(-w / 2, -height / 2 - 22, w, height + 44);
    ctx.restore();
  }
  const subEdge = subText
    ? vertical
      ? -subSign * (mainWidth / 2 + r.fontSize * l.subGap)
      : subSign * (mainHeight / 2 + r.fontSize * l.subGap)
    : null;
  paintDecoration(ctx, r, seconds, {
    x0:
      -(r.frame?.style === "title" || vertical
        ? mainWidth
        : Math.max(mainWidth, subWidth)) / 2,
    x1:
      (r.frame?.style === "title" || vertical
        ? mainWidth
        : Math.max(mainWidth, subWidth)) / 2,
    y0: -mainHeight / 2,
    y1: mainHeight / 2,
    cx,
    cy,
    fit,
    subEdge,
  });
  if (!c.enabled) {
    ctx.restore();
    return;
  }
  const draw = (
    ch: string,
    x: number,
    y: number,
    size: number,
    alpha: number,
    sub = false,
    blur = 0,
    gradientX = 0,
    gradientY = 0,
    glow = 1,
    bright = 0,
  ) => {
    if (alpha <= 0) return;
    const ratio = sub ? size / r.fontSize : 1;
    ctx.save();
    ctx.font = font(size, sub);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (blur > 0) ctx.filter = `blur(${blur}px)`;
    if (c.shadow) {
      ctx.shadowColor =
        l.shadowColor +
        Math.round(l.shadowOpacity * 255)
          .toString(16)
          .padStart(2, "0");
      ctx.shadowBlur = l.shadowBlur * ratio;
      ctx.shadowOffsetX = l.shadowX * ratio;
      ctx.shadowOffsetY = l.shadowY * ratio;
    }
    if (c.glow > 0) {
      ctx.save();
      ctx.shadowColor = c.glowColor;
      ctx.shadowBlur = c.glow * glow * ratio;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = sub && !l.subColorInherited ? c.subColor : r.color;
      ctx.globalAlpha *= Math.min(1, l.glowStrength / 2);
      for (let i = 0; i < Math.ceil(l.glowStrength); i++)
        ctx.fillText(ch, x, y);
      ctx.restore();
    }
    if (l.stroke2Width > 0) {
      ctx.strokeStyle = l.stroke2Color;
      ctx.lineWidth = (l.stroke2Width + c.strokeWidth) * 2 * ratio;
      ctx.strokeText(ch, x, y);
    }
    if (c.strokeWidth > 0) {
      ctx.strokeStyle = c.strokeColor;
      ctx.lineWidth = c.strokeWidth * 2 * ratio;
      ctx.strokeText(ch, x, y);
    }
    const horizontal = l.gradientDirection === "horizontal",
      diagonal = l.gradientDirection === "diagonal";
    const gradient = ctx.createLinearGradient(
      horizontal || diagonal ? -mainWidth / 2 - gradientX : 0,
      horizontal ? 0 : diagonal ? -mainHeight / 2 - gradientY : -size / 2,
      horizontal || diagonal ? mainWidth / 2 - gradientX : 0,
      horizontal ? 0 : diagonal ? mainHeight / 2 - gradientY : size / 2,
    );
    gradient.addColorStop(0, r.color);
    gradient.addColorStop(l.gradientThird ? 0.5 : 1, c.gradientColor);
    if (l.gradientThird) gradient.addColorStop(1, l.gradientColor3);
    ctx.fillStyle = sub
      ? l.subColorInherited
        ? r.color
        : c.subColor
      : c.gradient
        ? gradient
        : r.color;
    ctx.globalAlpha *= c.fillOpacity;
    ctx.fillText(ch, x, y);
    if (bright > 0) {
      ctx.globalAlpha *= Math.min(1, bright);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(ch, x, y);
    }
    ctx.restore();
  };
  let index = 0,
    cursorPoint: { x: number; y: number } | undefined;
  const count = Array.from(text).length;
  const blockState = glyphAt(r, seconds, 0, count);
  ctx.save();
  if (blockState.block && blockState.clip < 1) {
    const g = blockState.clip,
      d = blockState.clipDirection,
      w = mainWidth + 40,
      h = mainHeight + 40,
      x = -w / 2,
      y = -h / 2;
    ctx.beginPath();
    ctx.rect(
      d === 1 ? x + w * (1 - g) : d === 4 ? (-w * g) / 2 : x,
      d === 3 ? y + h * (1 - g) : y,
      d < 2 || d === 4 ? w * g : w,
      d === 2 || d === 3 ? h * g : h,
    );
    ctx.clip();
  }
  lines.forEach((line, row) => {
    const chars = Array.from(line);
    let cursor =
      c.align === "left"
        ? -mainWidth / 2
        : c.align === "right"
          ? mainWidth / 2 - widths[row]
          : -widths[row] / 2;
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i],
        gw = ctx.measureText(ch).width,
        s = glyphAt(r, seconds, index++, count);
      let bx = vertical
          ? ((lines.length - 1) / 2 - row) * step
          : cursor + gw / 2,
        by = vertical
          ? (i - (chars.length - 1) / 2) * (r.fontSize + c.spacing)
          : (row - (lines.length - 1) / 2) * step;
      if (vertical && c.align !== "center")
        by =
          (c.align === "left"
            ? -mainHeight / 2 + r.fontSize / 2
            : mainHeight / 2 -
              (chars.length - 1) * (r.fontSize + c.spacing) -
              r.fontSize / 2) +
          i * (r.fontSize + c.spacing);
      bx *= 1 - s.center;
      by *= 1 - s.center;
      if (q.mode === "trailer" && q.reveal === "scroll") {
        if (vertical) bx += -r.width / 2 - mainWidth / 2 + s.scroll;
        else by += r.height / 2 + mainHeight / 2 - s.scroll;
      }
      let alpha = s.opacity;
      if (q.mode === "trailer" && q.reveal === "scroll" && q.scrollFade) {
        const position = vertical
          ? (cx + bx * fit) / r.width
          : (cy + by * fit) / r.height;
        alpha *= Math.max(0, Math.min(1, position * 8, (1 - position) * 8));
      }
      if (s.block) {
        bx *= s.scale * s.scaleX;
        by *= s.scale * s.scaleY;
      }
      ctx.save();
      ctx.translate(bx + s.x, by + s.y);
      ctx.rotate(s.rotation);
      const solo =
        q.mode === "trailer" && q.reveal === "solo" && s.center > 0
          ? (Math.min(r.width, r.height) * q.soloSize) / r.fontSize / fit
          : 1;
      ctx.scale(s.scale * s.scaleX * solo, s.scale * s.scaleY * solo);
      if (s.clip < 1 && !s.block) {
        ctx.beginPath();
        const x = -gw / 2 - 20,
          y = -r.fontSize,
          w = gw + 40,
          h = r.fontSize * 2;
        ctx.rect(
          s.clipDirection === 1 ? x + w * (1 - s.clip) : x,
          s.clipDirection === 3 ? y + h * (1 - s.clip) : y,
          s.clipDirection < 2 ? w * s.clip : w,
          s.clipDirection >= 2 ? h * s.clip : h,
        );
        ctx.clip();
      }
      if (
        (c.entrance === "glitch" ||
          c.departure === "glitch" ||
          c.holdMotion === "noise") &&
        alpha > 0 &&
        Math.sin(seconds * 40 + index) > 0.5
      ) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = l.glitchColor;
        ctx.font = font(r.fontSize);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ch, -4, 0);
        ctx.fillStyle = l.glitchColor2;
        ctx.fillText(ch, 4, 0);
        ctx.restore();
      }
      draw(
        ch,
        0,
        0,
        r.fontSize,
        alpha,
        false,
        s.blur,
        bx,
        by,
        s.glow,
        s.bright,
      );
      ctx.restore();
      if (alpha > 0.5) cursorPoint = { x: bx + gw / 2 + 3, y: by };
      cursor += gw + c.spacing;
    }
    if (row < lines.length - 1) index++;
  });
  ctx.restore();
  if (
    q.mode === "trailer" &&
    q.reveal === "char" &&
    q.cursor &&
    cursorPoint &&
    Math.sin(seconds * 8) > 0
  ) {
    ctx.fillStyle = l.cursorColor;
    ctx.fillRect(
      cursorPoint.x,
      cursorPoint.y - r.fontSize / 2,
      Math.max(2, r.fontSize * 0.06),
      r.fontSize,
    );
  }
  if (subText) {
    ctx.font = font(c.subSize, true);
    const chars = Array.from(subText),
      ws = chars.map((ch) => ctx.measureText(ch).width),
      total =
        ws.reduce((a, b) => a + b, 0) +
        Math.max(0, chars.length - 1) * c.subSpacing;
    let cursor = -total / 2;
    chars.forEach((ch, i) => {
      const s = subtitleAt(r, seconds, i, chars.length),
        a = precise(r) ? s.opacity : opacity;
      const x = vertical
        ? -subSign * (mainWidth / 2 + r.fontSize * l.subGap + c.subSize / 2)
        : cursor + ws[i] / 2 + (i - (chars.length - 1) / 2) * s.spacing;
      const y = vertical
        ? (i - (chars.length - 1) / 2) * (c.subSize + c.subSpacing)
        : subSign * (mainHeight / 2 + r.fontSize * l.subGap + c.subSize / 2);
      ctx.save();
      ctx.translate(x + s.x, y + s.y);
      ctx.rotate(s.rotation);
      ctx.scale(s.scale * s.scaleX, s.scale * s.scaleY);
      draw(ch, 0, 0, c.subSize, a, true, s.blur);
      ctx.restore();
      cursor += ws[i] + c.subSpacing;
    });
  }
  ctx.restore();
}
