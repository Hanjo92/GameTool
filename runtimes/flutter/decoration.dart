import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'motion.dart';
import 'options.dart';

class TextBounds {
  final double x0, y0, x1, y1, cx, cy, fit;
  final double? subEdge;
  const TextBounds(
    this.x0,
    this.y0,
    this.x1,
    this.y1,
    this.cx,
    this.cy,
    this.fit,
    this.subEdge,
  );
}

Color decoColor(String hex) =>
    Color(int.parse('ff${hex.substring(1)}', radix: 16));
void paintDecoration(
  Canvas canvas,
  EffectRecipe r,
  double seconds,
  TextBounds b,
) {
  final c = {...defaultFrame, ...r.frame},
      s = frameAt(r, seconds),
      l = {...defaultLayout, ...r.layout};
  if (s['opacity'] == 0) return;
  final vertical = r.typography['vertical'] == true,
      pad = (c['padding'] as num) * r.fontSize,
      ext = (c['extend'] as num) * r.fontSize,
      g = s['progress']!,
      alpha = s['opacity']!,
      th = (c['width'] as num).toDouble();
  var x0 = b.x0 - pad, x1 = b.x1 + pad, y0 = b.y0 - pad, y1 = b.y1 + pad;
  if (c['style'] != 'title' && b.subEdge != null) {
    final size = (r.typography['subSize'] as num?)?.toDouble() ?? 0;
    if (vertical) {
      if (r.typography['subPosition'] == 'above')
        x1 = math.max(x1, b.subEdge! + size + pad);
      else
        x0 = math.min(x0, b.subEdge! - size - pad);
    } else if (r.typography['subPosition'] == 'above')
      y0 = math.min(y0, b.subEdge! - size - pad);
    else
      y1 = math.max(y1, b.subEdge! + size + pad);
  }
  if (c['style'] == 'title') {
    if (vertical) {
      y0 -= ext;
      y1 += ext;
    } else {
      x0 -= ext;
      x1 += ext;
    }
    if (b.subEdge != null) {
      if (vertical) {
        if (r.typography['subPosition'] == 'above') {
          x1 = math.min(x1, (b.x1 + b.subEdge!) / 2);
        } else {
          x0 = math.max(x0, (b.x0 + b.subEdge!) / 2);
        }
      } else if (r.typography['subPosition'] == 'above') {
        y0 = math.max(y0, (b.y0 + b.subEdge!) / 2);
      } else {
        y1 = math.min(y1, (b.y1 + b.subEdge!) / 2);
      }
    }
  }
  final inset = math.max((c['inset'] as num).toDouble(), th / 2);
  x0 = math.max(x0, (inset - b.cx) / b.fit);
  x1 = math.min(x1, (r.width - inset - b.cx) / b.fit);
  y0 = math.max(y0, (inset - b.cy) / b.fit);
  y1 = math.min(y1, (r.height - inset - b.cy) / b.fit);
  if (x1 <= x0 || y1 <= y0) return;
  final path = Path();
  void line(double a, double d, double e, double f) {
    path.moveTo(a, d);
    path.lineTo(e, f);
  }

  if (c['style'] == 'band') {
    final w = vertical ? x1 - x0 : r.width / b.fit,
        h = vertical ? r.height / b.fit : y1 - y0,
        x = vertical ? x0 : -b.cx / b.fit,
        y = vertical ? -b.cy / b.fit : y0;
    canvas.save();
    canvas.scale(vertical ? 1 : g, vertical ? g : 1);
    final rect = Rect.fromLTWH(x, y, w, h),
        color = decoColor(
          c['fillColor'],
        ).withValues(alpha: alpha * (c['fillOpacity'] as num));
    final softness = math.min(.49, (c['softness'] as num) * .49),
        fade = math.min(.49, (c['sideFade'] as num) * .49);
    canvas.saveLayer(rect, Paint());
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          begin: vertical ? Alignment.centerLeft : Alignment.topCenter,
          end: vertical ? Alignment.centerRight : Alignment.bottomCenter,
          colors: [
            color.withValues(alpha: 0),
            color,
            color,
            color.withValues(alpha: 0),
          ],
          stops: [0, softness, 1 - softness, 1],
        ).createShader(rect),
    );
    if (fade > 0)
      canvas.drawRect(
        rect,
        Paint()
          ..blendMode = BlendMode.dstIn
          ..shader = LinearGradient(
            begin: vertical ? Alignment.topCenter : Alignment.centerLeft,
            end: vertical ? Alignment.bottomCenter : Alignment.centerRight,
            colors: const [
              Colors.transparent,
              Colors.black,
              Colors.black,
              Colors.transparent,
            ],
            stops: [0, fade, 1 - fade, 1],
          ).createShader(rect),
      );
    canvas.restore();
    canvas.restore();
    return;
  }
  if (c['style'] == 'tape') {
    final tw = (c['tapeSize'] as num).toDouble(),
        len = (vertical ? r.height : r.width) / b.fit;
    for (final item in [
      [1.0, vertical ? x1 : y0 - tw],
      [-1.0, vertical ? x0 - tw : y1],
    ]) {
      final side = item[0], position = item[1];
      canvas.save();
      if (vertical) {
        canvas.rotate(math.pi / 2);
        canvas.translate(0, -position - tw);
      } else {
        canvas.translate(0, position);
      }
      final start = -len / 2 + (side == 1 ? len * (1 - g) : 0);
      canvas.clipRect(Rect.fromLTWH(start, 0, len * g, tw));
      final a =
          alpha *
          (1 -
              (c['tapeBlink'] as num) *
                  (.5 + .5 * math.sin(seconds * 6 + side)));
      canvas.drawRect(
        Rect.fromLTWH(-len / 2, 0, len, tw),
        Paint()..color = decoColor(c['tapeColor']).withValues(alpha: a),
      );
      final period = tw * 1.3,
          shift = (seconds * (c['tapeSpeed'] as num) * side) % period;
      for (
        var x = -len / 2 - period + shift;
        x < len / 2 + period;
        x += period
      ) {
        final stripe = Path()
          ..moveTo(x, tw)
          ..lineTo(x + period / 2, tw)
          ..lineTo(x + period / 2 + tw, 0)
          ..lineTo(x + tw, 0)
          ..close();
        canvas.drawPath(
          stripe,
          Paint()..color = decoColor(c['tapeStripe']).withValues(alpha: a),
        );
      }
      canvas.restore();
    }
    return;
  }
  if (c['style'] == 'box') {
    final mx = (x0 + x1) / 2,
        my = (y0 + y1) / 2,
        w = (x1 - x0) * (vertical ? 1 : g),
        h = (y1 - y0) * (vertical ? g : 1),
        radius = math.min(
          math.min(w / 2, h / 2),
          (c['radius'] as num) * r.fontSize,
        );
    path.addRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(mx - w / 2, my - h / 2, w, h),
        Radius.circular(radius),
      ),
    );
  } else if (c['style'] == 'corners') {
    final arm = math.min(x1 - x0, y1 - y0) * .28 * g,
        inset = (1 - g) * r.fontSize * .4;
    for (final k in [
      [x0, y0, 1.0, 1.0],
      [x1, y0, -1.0, 1.0],
      [x1, y1, -1.0, -1.0],
      [x0, y1, 1.0, -1.0],
    ]) {
      final a = k[0] - k[2] * inset, d = k[1] - k[3] * inset;
      path.moveTo(a + k[2] * arm, d);
      path.lineTo(a, d);
      path.lineTo(a, d + k[3] * arm);
    }
  } else if (c['style'] == 'lines') {
    if (vertical) {
      line(x0, b.y0 - ext * g, x0, b.y1 + ext * g);
      line(x1, b.y0 - ext * g, x1, b.y1 + ext * g);
    } else {
      line((b.x0 - ext) * g, y0, (b.x1 + ext) * g, y0);
      line((b.x0 - ext) * g, y1, (b.x1 + ext) * g, y1);
    }
  } else if (c['style'] == 'underline') {
    if (vertical) {
      line(x0, b.y0 - ext, x0, b.y0 - ext + (b.y1 - b.y0 + 2 * ext) * g);
    } else {
      line(b.x0 - ext, y1, b.x0 - ext + (b.x1 - b.x0 + 2 * ext) * g, y1);
    }
  } else if (c['style'] == 'sides') {
    if (vertical) {
      line(0, y0 - ext * g, 0, y0);
      line(0, y1, 0, y1 + ext * g);
    } else {
      line(x0 - ext * g, 0, x0, 0);
      line(x1, 0, x1 + ext * g, 0);
    }
  } else if (c['style'] == 'bar') {
    if (vertical) {
      line(x1, y0, x1 - (x1 - x0) * g, y0);
    } else {
      line(x0, y0, x0, y0 + (y1 - y0) * g);
    }
  } else {
    final points = traceRectangle(x0, y0, x1, y1, g, vertical);
    path.moveTo(points[0][0], points[0][1]);
    for (final p in points.skip(1)) {
      path.lineTo(p[0], p[1]);
    }
    if (g == 1) path.close();
  }
  if (c['style'] == 'title' || c['style'] == 'box') {
    final fill = Paint()
      ..color = decoColor(c['fillColor']).withValues(
        alpha: alpha * (c['fillOpacity'] as num) * math.min(1.0, g * 1.5),
      );
    if (c['style'] == 'box') {
      canvas.drawPath(path, fill);
    } else {
      canvas.drawRect(Rect.fromLTRB(x0, y0, x1, y1), fill);
    }
  }
  void stroke(double width, String color) {
    canvas.drawPath(
      path,
      Paint()
        ..color = decoColor(color).withValues(alpha: alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = width
        ..strokeJoin = StrokeJoin.miter,
    );
  }

  if (c['outline'] == true && th > 0) {
    final sw = (r.typography['strokeWidth'] as num?)?.toDouble() ?? 0,
        outer = (l['stroke2Width'] as num).toDouble();
    if (outer + sw > 0) stroke(th + (outer + sw) * 2, l['stroke2Color']);
    if (sw > 0) stroke(th + sw * 2, r.typography['strokeColor'] ?? '#000000');
  }
  if (th > 0) stroke(th, c['color']);
}
