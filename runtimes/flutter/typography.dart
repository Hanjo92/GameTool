import 'font_fallback.dart';
import 'decoration.dart';
import 'sequence.dart';
import 'options.dart';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'motion.dart';

const defaultTypography = <String, dynamic>{
  'enabled': false,
  'subText': 'BATTLE START',
  'subSize': 20,
  'subColor': '#ffffff',
  'serif': true,
  'spacing': 14,
  'subSpacing': 8,
  'subPosition': 'below',
  'align': 'center',
  'vertical': false,
  'x': 0,
  'y': 0,
  'strokeWidth': 0,
  'strokeColor': '#000000',
  'glow': 0,
  'glowColor': '#88ccff',
  'shadow': true,
  'gradient': false,
  'gradientColor': '#ffb347',
  'fillOpacity': 1,
  'plate': 'none',
  'plateColor': '#111111',
  'plateOpacity': .6,
  'entrance': 'drop',
  'departure': 'fade',
  'holdMotion': 'none',
  'stagger': .4,
  'order': 'forward',
  'seed': 42,
};
Map<String, double> glyphAt(
  EffectRecipe r,
  double seconds,
  int index,
  int count,
) {
  final c = {...defaultTypography, ...r.typography},
      m = {...defaultMotion, ...r.motion},
      q = {...defaultSequence, ...r.sequence},
      s = evaluate(r, seconds),
      t = s['time']!;
  var rank = count <= 1 ? 0.0 : index / (count - 1);
  if (c['order'] == 'reverse') rank = 1 - rank;
  if (c['order'] == 'center') rank = (rank - .5).abs() * 2;
  if (c['order'] == 'edges') rank = 1 - (rank - .5).abs() * 2;
  if (c['order'] == 'random') rank = randomAt(c['seed'] as int, index, 7);
  final delay = r.frame['enabled'] == true
      ? math.min((r.frame['textDelay'] as num?)?.toDouble() ?? .3, r.enter)
      : 0.0;
  var entering = t < r.enter,
      leaving = t >= r.enter + r.hold,
      stagger = (c['stagger'] as num).toDouble();
  double a = entering
      ? (((t - delay) / math.max(.000001, r.enter - delay) - rank * stagger) /
                (1 - stagger))
            .clamp(0.0, 1.0)
      : leaving
      ? (r.exit > 0 ? math.max(0.0, 1 - (t - r.enter - r.hold) / r.exit) : 0)
      : 1;
  double center = 0, scroll = 0;
  if (precise(r)) {
    final p = pageAt(r, seconds),
        page = p.page,
        start = index < page.starts.length
            ? page.starts[index]
            : page.textStart;
    entering = t < page.inEnd;
    leaving = t >= page.outStart;
    double outRank = index.toDouble();
    if (m['outOrder'] == 'reverse') outRank = (count - 1 - index).toDouble();
    if (m['outOrder'] == 'center') outRank = (index - (count - 1) / 2).abs();
    if (m['outOrder'] == 'edges')
      outRank = (count - 1) / 2 - (index - (count - 1) / 2).abs();
    if (m['outOrder'] == 'random')
      outRank =
          ((index * 7919 + (c['seed'] as num) * 1013) % math.max(1, count))
              .toDouble();
    final gd = q['mode'] == 'trailer'
        ? (q['glyphDuration'] as num).toDouble()
        : r.enter;
    a = !p.active
        ? 0
        : leaving
        ? (m['outEnabled'] == true && c['departure'] != 'none'
              ? 1 -
                    ((t - page.outStart - outRank * (m['outStagger'] as num)) /
                            math.max(.001, r.exit))
                        .clamp(0.0, 1.0)
              : 1)
        : ((t - start) / math.max(.001, gd)).clamp(0.0, 1.0);
    if (q['mode'] == 'trailer' && q['reveal'] == 'solo' && t < page.soloEnd) {
      final chars = page.text.runes.map(String.fromCharCode).toList(),
          visibleIndex = chars.take(index).where((ch) => ch != '\n').length;
      a =
          p.active &&
              ((t - page.textStart) * (q['cps'] as num)).floor() ==
                  visibleIndex &&
              chars[index] != '\n'
          ? 1
          : 0;
      center = 1;
    }
    if (q['mode'] == 'trailer' && q['reveal'] == 'spread') {
      center =
          1 -
          easing(
            'out',
            (t - page.textStart - (q['spreadHold'] as num)) /
                (q['spreadDuration'] as num),
          );
      a = p.active && t >= page.textStart ? 1 : 0;
    }
    if (q['mode'] == 'trailer' && q['reveal'] == 'scroll') {
      a = p.active ? 1 : 0;
      scroll = (t - page.textStart) * (q['scrollSpeed'] as num);
      entering = false;
      leaving = false;
    }
  }
  final mode = leaving ? c['departure'] : c['entrance'],
      remaining = 1 - a,
      e = 1 - easing(leaving ? m['outEase'] : m['inEase'], a);
  final power = (leaving ? m['outPower'] : m['inPower']) as num;

  double x = 0,
      y = 0,
      scale = 1,
      rotation = 0,
      blur = 0,
      clip = 1,
      scaleX = 1,
      scaleY = 1,
      glow = 1,
      bright = 0;
  final direction = leaving ? m['outDirection'] : m['inDirection'];
  final clipDirection = direction == 'center'
      ? 4.0
      : ['left', 'right', 'up', 'down']
            .indexOf(
              {
                    'lr': 'left',
                    'rl': 'right',
                    'tb': 'up',
                    'bt': 'down',
                  }[direction] ??
                  direction,
            )
            .toDouble();
  final block =
      [
        'slam',
        'approach',
        'recede',
        'wipe',
        'unfold',
        'glitch',
        'flash',
        'zoom-through',
      ].contains(mode)
      ? 1.0
      : 0.0;
  if (mode == 'rise') y = (leaving ? -1 : 1) * e * r.distance;
  if (mode == 'sink') y = e * r.distance;
  if (mode == 'diverge') y = (index % 2 == 1 ? 1 : -1) * e * r.distance;
  if (mode == 'grow-out' || mode == 'zoom-through') scale = 1 + e * 3;
  if (mode == 'erase') a = a >= 1 ? 1 : 0;
  if (mode == 'drop') y = -e * r.distance;
  if (mode == 'split') y = (index % 2 == 1 ? 1 : -1) * e * r.distance;
  if (mode == 'slide') {
    final direction = leaving ? m['outDirection'] : m['inDirection'];
    if (direction == 'up' || direction == 'down') {
      y = (direction == 'up' ? -1 : 1) * e * r.distance;
    } else {
      x = (direction == 'left' ? -1 : 1) * e * r.distance;
    }
  }
  if (mode == 'tracking') x = (index - (count - 1) / 2) * e * r.fontSize * .7;
  if (mode == 'spread') x = -(index - (count - 1) / 2) * e * r.fontSize;
  if (mode == 'blur') blur = remaining * 12;
  if (mode == 'pop' || mode == 'recede') scale = 1 - .8 * e;
  if (mode == 'shrink' || mode == 'approach') scale = 1 + 2 * e;
  if (mode == 'rotate') rotation = -math.pi * e;
  if (mode == 'flip') scaleX = math.max(.01, a);
  if (mode == 'bounce')
    y = -math.cos(a * math.pi * 2.5).abs() * remaining * r.distance;
  if (mode == 'gather') {
    x = (randomAt(c['seed'], index, 1) - .5) * r.distance * 4 * e;
    y = (randomAt(c['seed'], index, 2) - .5) * r.distance * 4 * e;
  }
  if (mode == 'typewriter') a = a > 0 ? 1 : 0;
  if (mode == 'flicker') a *= a > .95 ? 1 : (math.sin(a * 42) > 0 ? 1 : .15);
  if (mode == 'wipe') clip = a;
  if (mode == 'unfold') {
    if (direction == 'up' || direction == 'down' || direction == 'v')
      scaleY = math.max(.01, a);
    else
      scaleX = math.max(.01, a);
  }
  if (mode == 'glitch') {
    x = math.sin(a * 93 + index) * remaining * 20;
    a *= math.sin(a * 50) > 0.2 ? 0.4 : 1;
  }
  if (mode == 'approach') blur = e * r.fontSize * .1;
  if (mode == 'slam') {
    if (a < .4) {
      final impact = a / .4;
      scale = 1 + (1 - impact * impact) * 2.4;
      blur = (1 - impact) * r.fontSize * .04;
      a = math.min(1.0, impact * 2.2);
    } else {
      final settle = (a - .4) / .6, decay = math.pow(1 - settle, 2).toDouble();
      scale = 1 + math.sin(settle * math.pi * 3) * .05 * decay;
      x = math.sin(t * 43) * r.fontSize * .08 * decay;
      y = math.sin(t * 61 + .7) * r.fontSize * .08 * decay;
      bright = math.pow(1 - settle, 3).toDouble() * .85;
    }
  }
  if (mode == 'flash') {
    bright = e;
    glow = 1 + e * 1.5;
    a = math.min(1.0, a * 5);
  }
  if (c['vertical'] == true &&
      [
        'rise',
        'drop',
        'split',
        'sink',
        'diverge',
        'tracking',
        'spread',
      ].contains(mode)) {
    final swap = x;
    x = y;
    y = swap;
  }
  x *= power;
  y *= power;
  rotation *= power;
  scale = 1 + (scale - 1) * power;
  blur *= power;
  if (!entering && !leaving) {
    final phase = (t - r.enter) * math.pi * 2;
    if (c['holdMotion'] == 'float') y = math.sin(phase * .5) * 6;
    if (c['holdMotion'] == 'wave') y = math.sin(phase + index * .7) * 8;
    if (c['holdMotion'] == 'pulse') scale = 1 + math.sin(phase) * .05;
    if (c['holdMotion'] == 'shake') {
      x = math.sin(phase * 7 + index) * 3;
      y = math.cos(phase * 9 + index) * 3;
    }
    if (c['holdMotion'] == 'glow')
      glow = math.max(0, 1 + .8 * math.cos(phase) * (m['holdPower'] as num));
    if (c['holdMotion'] == 'blink') a = math.sin(phase) > 0 ? 1 : .25;
    if (c['holdMotion'] == 'flash') a = math.sin(phase * 4) > 0 ? 1 : 0;
    if (c['holdMotion'] == 'noise')
      x = math.sin(phase * 12) > .95
          ? (randomAt(c['seed'], index, 1) - .5) * 30
          : 0;
  }
  if (!entering && !leaving) {
    x *= m['holdPower'] as num;
    y *= m['holdPower'] as num;
    scale = 1 + (scale - 1) * (m['holdPower'] as num);
  }
  if (precise(r)) {
    final p = pageAt(r, seconds);
    if (!p.active) a = 0;
    if (q['mode'] == 'trailer' &&
        q['reveal'] == 'solo' &&
        t >= p.page.soloEnd &&
        t < p.page.mainEnd)
      scale *=
          1 +
          .25 *
              (q['soloImpact'] as num) *
              (1 -
                  easing(
                    'out',
                    (t - p.page.soloEnd) / math.max(.001, r.enter),
                  ));
  }
  return {
    'center': center,
    'scroll': scroll,
    'opacity': a,
    'x': x,
    'y': y,
    'scale': scale,
    'rotation': rotation,
    'blur': blur,
    'clip': clip,
    'scaleX': scaleX,
    'scaleY': scaleY,
    'clipDirection': clipDirection,
    'block': block,
    'glow': glow,
    'bright': bright,
  };
}

Color _color(String hex) =>
    Color(int.parse('ff${hex.substring(1)}', radix: 16));
String fontFamily(String id, bool serif) => id == 'same' || id == 'auto'
    ? (serif ? 'GameToolSerif' : 'GameToolSans')
    : id == 'serif'
    ? 'GameToolSerif'
    : id == 'sans'
    ? 'GameToolSans'
    : id.startsWith('local:')
    ? id.substring(6)
    : 'GameToolFont_$id';
TextPainter _text(String text, TextStyle style) => TextPainter(
  text: TextSpan(text: text, style: style),
  textDirection: TextDirection.ltr,
)..layout();
void paintTypography(Canvas canvas, EffectRecipe r, double seconds) {
  final c = {...defaultTypography, ...r.typography},
      l = {...defaultLayout, ...r.layout},
      q = {...defaultSequence, ...r.sequence};
  if ((c['enabled'] != true && r.frame['enabled'] != true) || !r.textVisible)
    return;
  final text = currentText(r, seconds),
      lines = text.split('\n'),
      family = fontFamily(l['font'], c['serif'] == true),
      subFamily = l['subFont'] == 'same'
          ? fontFamily(l['font'], c['serif'] == true)
          : fontFamily(l['subFont'], c['serif'] == true);
  TextStyle style(double size, [bool sub = false]) => TextStyle(
    fontFamily: sub ? subFamily : family,
    fontFamilyFallback: [
      if (fontFallback[sub && l['subFont'] != 'same'
              ? l['subFont']
              : l['font']] !=
          null)
        'GameToolFont_${fontFallback[sub && l['subFont'] != 'same' ? l['subFont'] : l['font']]}',
      if (c['serif'] == true) 'GameToolSerif',
      'GameToolSans',
    ],
    fontSize: size,
    fontWeight:
        FontWeight.values[(((sub ? l['subWeight'] : l['weight']) as num) / 100)
                .round()
                .clamp(1, 9) -
            1],
    fontVariations: [
      ui.FontVariation(
        'wght',
        ((sub ? l['subWeight'] : l['weight']) as num).toDouble(),
      ),
    ],
    fontStyle: (sub ? l['subItalic'] : l['italic']) == true
        ? FontStyle.italic
        : FontStyle.normal,
    height: 1,
    color: _color(r.color),
  );
  final glyphs = lines
          .map(
            (line) => line.runes
                .map((ch) => _text(String.fromCharCode(ch), style(r.fontSize)))
                .toList(),
          )
          .toList(),
      spacing = (c['spacing'] as num).toDouble();
  final widths = glyphs
      .map(
        (line) => math.max(
          1.0,
          line.fold(0.0, (double sum, tp) => sum + tp.width + spacing) -
              spacing,
        ),
      )
      .toList();
  final step = r.fontSize * (l['lineHeight'] as num),
      vertical = c['vertical'] == true;
  final mainWidth = vertical
      ? math.max(r.fontSize, (lines.length - 1) * step + r.fontSize)
      : widths.reduce(math.max);
  final mainHeight = vertical
      ? lines
            .map(
              (line) =>
                  math.max(1, line.runes.length) * (r.fontSize + spacing) -
                  spacing,
            )
            .reduce(math.max)
      : math.max(r.fontSize, (lines.length - 1) * step + r.fontSize);
  final subText = q['mode'] == 'trailer' ? '' : c['subText'] as String,
      subSize = (c['subSize'] as num).toDouble(),
      subGap = (l['subGap'] as num).toDouble(),
      subExtent = subText.isNotEmpty ? subSize + r.fontSize * subGap : 0.0;
  double subWidth = 0;
  for (final rune in subText.runes) {
    final tp = _text(String.fromCharCode(rune), style(subSize, true));
    subWidth += tp.width + (c['subSpacing'] as num);
    tp.dispose();
  }
  subWidth -= (c['subSpacing'] as num);
  final subSign = c['subPosition'] == 'above' ? -1.0 : 1.0;
  final width = vertical
          ? mainWidth + subExtent
          : math.max(mainWidth, subWidth),
      height = vertical
          ? math.max(
              mainHeight,
              subText.runes.length * (subSize + (c['subSpacing'] as num)) -
                  (c['subSpacing'] as num),
            )
          : mainHeight + subExtent,
      marginX = (l['marginX'] as num).toDouble(),
      marginY = (l['marginY'] as num).toDouble();
  var fit = l['autoFit'] == true
      ? math.min(
          1.0,
          math.min(
            (r.width - 2 * marginX) / math.max(1.0, width),
            (r.height - 2 * marginY) / math.max(1.0, height),
          ),
        )
      : 1.0;
  if (q['mode'] == 'trailer' && q['reveal'] == 'scroll')
    fit = l['autoFit'] == true
        ? math.min(
            1.0,
            vertical
                ? (r.height - 2 * marginY) / mainHeight
                : (r.width - 2 * marginX) / mainWidth,
          )
        : 1.0;
  fit = math.max(.01, fit);
  final anchor = l['anchor'] as String,
      cx =
          (anchor[1] == 'l'
              ? marginX + width * fit / 2
              : anchor[1] == 'r'
              ? r.width - marginX - width * fit / 2
              : r.width / 2) +
          (c['x'] as num) +
          (precise(r) && vertical ? subSign * subExtent * fit / 2 : 0),
      cy =
          (anchor[0] == 't'
              ? marginY + height * fit / 2
              : anchor[0] == 'b'
              ? r.height - marginY - height * fit / 2
              : r.height / 2) +
          (c['y'] as num) -
          (precise(r) && !vertical ? subSign * subExtent * fit / 2 : 0);
  canvas.save();
  canvas.translate(cx, cy);
  canvas.scale(fit);
  final opacity = evaluate(r, seconds)['opacity']!;
  if (c['plate'] != 'none') {
    final w = c['plate'] == 'band' ? r.width / fit : width + 80;
    canvas.drawRect(
      Rect.fromLTWH(-w / 2, -height / 2 - 22, w, height + 44),
      Paint()
        ..color = _color(
          c['plateColor'],
        ).withValues(alpha: (c['plateOpacity'] as num) * opacity),
    );
  }
  final subEdge = subText.isNotEmpty
      ? (vertical
            ? -subSign * (mainWidth / 2 + r.fontSize * subGap)
            : subSign * (mainHeight / 2 + r.fontSize * subGap))
      : null;
  paintDecoration(
    canvas,
    r,
    seconds,
    TextBounds(
      -(r.frame['style'] == 'title' || vertical
              ? mainWidth
              : math.max(mainWidth, subWidth)) /
          2,
      -mainHeight / 2,
      (r.frame['style'] == 'title' || vertical
              ? mainWidth
              : math.max(mainWidth, subWidth)) /
          2,
      mainHeight / 2,
      cx,
      cy,
      fit,
      subEdge,
    ),
  );
  void dispose() {
    for (final line in glyphs) {
      for (final tp in line) {
        tp.dispose();
      }
    }
  }

  if (c['enabled'] != true) {
    dispose();
    canvas.restore();
    return;
  }
  void draw(
    String ch,
    double x,
    double y,
    double size,
    double alpha, {
    bool sub = false,
    double blur = 0,
    double gradientX = 0,
    double gradientY = 0,
    double glow = 1,
    double bright = 0,
  }) {
    if (alpha <= 0) return;
    final ratio = sub ? size / r.fontSize : 1.0;
    final base = style(size, sub),
        measure = _text(ch, base),
        offset = Offset(x - measure.width / 2, y - measure.height / 2);
    canvas.saveLayer(
      null,
      Paint()
        ..color = Colors.white.withValues(alpha: alpha.clamp(0.0, 1.0))
        ..imageFilter = (blur > 0
            ? ui.ImageFilter.blur(sigmaX: blur, sigmaY: blur)
            : null),
    );
    final shadows = <Shadow>[
      if (c['shadow'] == true)
        Shadow(
          color: _color(
            l['shadowColor'],
          ).withValues(alpha: (l['shadowOpacity'] as num).toDouble()),
          blurRadius: (l['shadowBlur'] as num).toDouble() * ratio,
          offset: Offset(
            (l['shadowX'] as num).toDouble() * ratio,
            (l['shadowY'] as num).toDouble() * ratio,
          ),
        ),
      if ((c['glow'] as num) > 0)
        for (var k = 0; k < (l['glowStrength'] as num).ceil(); k++)
          Shadow(
            color: _color(
              c['glowColor'],
            ).withValues(alpha: math.min(1.0, (l['glowStrength'] as num) / 2)),
            blurRadius: (c['glow'] as num).toDouble() * glow * ratio,
          ),
    ];
    void stroke(double width, String color) {
      final tp = _text(
        ch,
        base.copyWith(
          foreground: Paint()
            ..color = _color(color)
            ..style = PaintingStyle.stroke
            ..strokeWidth = width,
          shadows: shadows,
        ),
      );
      tp.paint(canvas, offset);
      tp.dispose();
    }

    final sw = (c['strokeWidth'] as num).toDouble(),
        outer = (l['stroke2Width'] as num).toDouble();
    if (outer > 0) stroke((outer + sw) * 2 * ratio, l['stroke2Color']);
    if (sw > 0) stroke(sw * 2 * ratio, c['strokeColor']);
    final paint = Paint()
      ..color = _color(
        sub && l['subColorInherited'] != true ? c['subColor'] : r.color,
      ).withValues(alpha: (c['fillOpacity'] as num).toDouble());
    if (!sub && c['gradient'] == true) {
      final horizontal = l['gradientDirection'] == 'horizontal',
          diagonal = l['gradientDirection'] == 'diagonal';
      final colors =
          [
                r.color,
                c['gradientColor'],
                if (l['gradientThird'] == true) l['gradientColor3'],
              ]
              .map(
                (color) => _color(
                  color,
                ).withValues(alpha: (c['fillOpacity'] as num).toDouble()),
              )
              .toList();
      paint.shader =
          LinearGradient(
            begin: horizontal
                ? Alignment.centerLeft
                : diagonal
                ? Alignment.topLeft
                : Alignment.topCenter,
            end: horizontal
                ? Alignment.centerRight
                : diagonal
                ? Alignment.bottomRight
                : Alignment.bottomCenter,
            colors: colors,
          ).createShader(
            horizontal || diagonal
                ? Rect.fromLTWH(
                    measure.width / 2 - mainWidth / 2 - gradientX,
                    diagonal
                        ? measure.height / 2 - mainHeight / 2 - gradientY
                        : 0,
                    mainWidth,
                    diagonal ? mainHeight : measure.height,
                  )
                : Rect.fromLTWH(0, 0, measure.width, measure.height),
          );
    }
    final tp = _text(ch, base.copyWith(foreground: paint, shadows: shadows));
    tp.paint(canvas, offset);
    tp.dispose();
    if (bright > 0) {
      final flash = _text(
        ch,
        base.copyWith(
          color: Colors.white.withValues(
            alpha: bright.clamp(0.0, 1.0) * (c['fillOpacity'] as num),
          ),
        ),
      );
      flash.paint(canvas, offset);
      flash.dispose();
    }
    measure.dispose();
    canvas.restore();
  }

  var index = 0;
  Offset? cursorPoint;
  final count = text.runes.length;
  final blockState = glyphAt(r, seconds, 0, count);
  canvas.save();
  if (blockState['block'] == 1 && blockState['clip']! < 1) {
    final g = blockState['clip']!,
        d = blockState['clipDirection']!,
        w = mainWidth + 40,
        h = mainHeight + 40,
        x = -w / 2,
        y = -h / 2;
    canvas.clipRect(
      Rect.fromLTWH(
        d == 1
            ? x + w * (1 - g)
            : d == 4
            ? -w * g / 2
            : x,
        d == 3 ? y + h * (1 - g) : y,
        d < 2 || d == 4 ? w * g : w,
        d == 2 || d == 3 ? h * g : h,
      ),
    );
  }
  for (var row = 0; row < lines.length; row++) {
    final chars = lines[row].runes.map(String.fromCharCode).toList();
    var cursor = c['align'] == 'left'
        ? -mainWidth / 2
        : c['align'] == 'right'
        ? mainWidth / 2 - widths[row]
        : -widths[row] / 2;
    for (var i = 0; i < chars.length; i++) {
      final ch = chars[i],
          gw = glyphs[row][i].width,
          s = glyphAt(r, seconds, index++, count);
      var bx = vertical
              ? ((lines.length - 1) / 2 - row) * step
              : cursor + gw / 2,
          by = vertical
              ? (i - (chars.length - 1) / 2) * (r.fontSize + spacing)
              : (row - (lines.length - 1) / 2) * step;
      if (vertical && c['align'] != 'center')
        by =
            (c['align'] == 'left'
                ? -mainHeight / 2 + r.fontSize / 2
                : mainHeight / 2 -
                      (chars.length - 1) * (r.fontSize + spacing) -
                      r.fontSize / 2) +
            i * (r.fontSize + spacing);
      bx *= 1 - s['center']!;
      by *= 1 - s['center']!;
      if (q['mode'] == 'trailer' && q['reveal'] == 'scroll') {
        if (vertical) {
          bx += -r.width / 2 - mainWidth / 2 + s['scroll']!;
        } else {
          by += r.height / 2 + mainHeight / 2 - s['scroll']!;
        }
      }
      var alpha = s['opacity']!;
      if (q['mode'] == 'trailer' &&
          q['reveal'] == 'scroll' &&
          q['scrollFade'] == true) {
        final position = vertical
            ? (cx + bx * fit) / r.width
            : (cy + by * fit) / r.height;
        alpha *= math.max(
          0.0,
          math.min(1.0, math.min(position * 8, (1 - position) * 8)),
        );
      }
      if (s['block'] == 1) {
        bx *= s['scale']! * s['scaleX']!;
        by *= s['scale']! * s['scaleY']!;
      }
      canvas.save();
      canvas.translate(bx + s['x']!, by + s['y']!);
      canvas.rotate(s['rotation']!);
      final solo =
          q['mode'] == 'trailer' && q['reveal'] == 'solo' && s['center']! > 0
          ? math.min(r.width, r.height) *
                (q['soloSize'] as num) /
                r.fontSize /
                fit
          : 1.0;
      canvas.scale(
        s['scale']! * s['scaleX']! * solo,
        s['scale']! * s['scaleY']! * solo,
      );
      if (s['clip']! < 1 && s['block'] == 0)
        canvas.clipRect(
          Rect.fromLTWH(
            -gw / 2 -
                20 +
                (s['clipDirection'] == 1 ? (gw + 40) * (1 - s['clip']!) : 0),
            -r.fontSize +
                (s['clipDirection'] == 3
                    ? r.fontSize * 2 * (1 - s['clip']!)
                    : 0),
            (gw + 40) * (s['clipDirection']! < 2 ? s['clip']! : 1),
            r.fontSize * 2 * (s['clipDirection']! >= 2 ? s['clip']! : 1),
          ),
        );
      if ((c['entrance'] == 'glitch' ||
              c['departure'] == 'glitch' ||
              c['holdMotion'] == 'noise') &&
          alpha > 0 &&
          math.sin(seconds * 40 + index) > .5) {
        for (final entry in [
          [-4.0, l['glitchColor']],
          [4.0, l['glitchColor2']],
        ]) {
          final tp = _text(
            ch,
            style(r.fontSize).copyWith(color: _color(entry[1] as String)),
          );
          tp.paint(
            canvas,
            Offset((entry[0] as double) - tp.width / 2, -tp.height / 2),
          );
          tp.dispose();
        }
      }
      draw(
        ch,
        0,
        0,
        r.fontSize,
        alpha,
        blur: s['blur']!,
        gradientX: bx,
        gradientY: by,
        glow: s['glow']!,
        bright: s['bright']!,
      );
      canvas.restore();
      if (alpha > .5) cursorPoint = Offset(bx + gw / 2 + 3, by);
      cursor += gw + spacing;
    }
    if (row < lines.length - 1) index++;
  }
  canvas.restore();
  if (q['mode'] == 'trailer' &&
      q['reveal'] == 'char' &&
      q['cursor'] == true &&
      cursorPoint != null &&
      math.sin(seconds * 8) > 0)
    canvas.drawRect(
      Rect.fromLTWH(
        cursorPoint.dx,
        cursorPoint.dy - r.fontSize / 2,
        math.max(2.0, r.fontSize * .06),
        r.fontSize,
      ),
      Paint()..color = _color(l['cursorColor']),
    );
  if (subText.isNotEmpty) {
    final chars = subText.runes.map(String.fromCharCode).toList(),
        sub = chars.map((ch) => _text(ch, style(subSize, true))).toList(),
        ss = (c['subSpacing'] as num).toDouble();
    final total =
        sub.fold(0.0, (double sum, tp) => sum + tp.width) +
        math.max(0, chars.length - 1) * ss;
    var cursor = -total / 2;
    for (var i = 0; i < chars.length; i++) {
      final s = subtitleAt(r, seconds, i, chars.length),
          a = precise(r) ? s['opacity']! : opacity,
          x = vertical
              ? -subSign * (mainWidth / 2 + r.fontSize * subGap + subSize / 2)
              : cursor +
                    sub[i].width / 2 +
                    (i - (chars.length - 1) / 2) * s['spacing']!,
          y = vertical
              ? (i - (chars.length - 1) / 2) * (subSize + ss)
              : subSign * (mainHeight / 2 + r.fontSize * subGap + subSize / 2);
      canvas.save();
      canvas.translate(x + s['x']!, y + s['y']!);
      canvas.rotate(s['rotation']!);
      canvas.scale(s['scale']! * s['scaleX']!, s['scale']! * s['scaleY']!);
      draw(chars[i], 0, 0, subSize, a, sub: true, blur: s['blur']!);
      canvas.restore();
      cursor += sub[i].width + ss;
      sub[i].dispose();
    }
  }
  dispose();
  canvas.restore();
}
