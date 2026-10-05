import 'options.dart';
import 'sequence.dart';
import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'motion.dart';
import 'filters.dart';
import 'typography.dart';

const defaultBackground = <String, dynamic>{
  'enabled': false,
  'assetId': null,
  'fit': 'cover',
  'color': '#132b3c',
  'endColor': '#3d5466',
  'motion': 'zoom-in',
  'amount': 0.15,
  'fade': false,
};
const defaultImage = <String, dynamic>{
  'enabled': false,
  'assetId': null,
  'fit': 'contain',
  'x': 0,
  'y': 0,
  'scale': 0.5,
  'rotation': 0,
  'opacity': 1,
};
const defaultParticleOptions = <String, dynamic>{
  'advanced': false,
  'shape': 'circle',
  'emitter': 'point',
  'path': 'ballistic',
  'areaWidth': 1.0,
  'areaHeight': .1,
  'radius': .25,
  'direction': -90.0,
  'orbitSpeed': 90.0,
  'wind': 0.0,
  'drag': 0.0,
  'turbulence': 0.0,
  'sizeEnd': 0.0,
  'sizeVariation': .4,
  'speedVariation': .4,
  'lifeVariation': .2,
  'colorEnd': '#ff6430',
  'fadeIn': .1,
  'fadeOut': .5,
  'opacity': 1.0,
  'spin': 90.0,
  'glow': 0.0,
  'blend': 'normal',
  'trail': 0.0,
  'delay': 0.0,
  'burstInterval': 0.0,
  'prewarm': true,
  'sync': true,
};
const defaultParticles = <String, dynamic>{
  ...defaultParticleOptions,
  'enabled': false,
  'preset': 'snow',
  'emission': 'continuous',
  'seed': 42,
  'count': 80,
  'size': 4,
  'speed': 90,
  'lifetime': 3,
  'gravity': 20,
  'spread': 180,
  'x': 0.5,
  'y': 0.5,
  'color': '#c6fa73',
};

List<String> backgroundAssetIds(EffectRecipe r) {
  final ids =
      (r.background['assetIds'] as List?)?.whereType<String>().toList() ??
      <String>[];
  return ids.isNotEmpty
      ? ids
      : [
          if (r.background['assetId'] is String)
            r.background['assetId'] as String,
        ];
}

Map<String, double> backgroundAt(EffectRecipe r, double seconds) {
  final b = {...defaultBackground, ...r.background}, s = evaluate(r, seconds);
  final p = s['time']! / r.duration,
      travel = (b['amount'] as num).toDouble(),
      phase = p * math.pi * 2,
      motion = b['motion'] as String;
  double x = 0,
      y = 0,
      scale = 1,
      rotation = 0,
      overlay = 0,
      white = 0,
      wave = 0;
  double opacity = b['enabled'] as bool
      ? (b['fade'] as bool ? s['opacity']! : 1)
      : 0;
  if (motion.startsWith('zoom-in')) scale = 1 + travel * p;
  if (motion.startsWith('zoom-out')) scale = 1 + travel * (1 - p);
  if (motion.startsWith('pan-')) {
    scale = 1 + travel * 2;
    final sign = motion == 'pan-left' || motion == 'pan-up' ? -1 : 1;
    if (motion == 'pan-left' || motion == 'pan-right') {
      x = sign * (p - .5) * travel * r.width;
    } else {
      y = sign * (p - .5) * travel * r.height;
    }
  }
  if (['shake', 'shake-x', 'shake-y'].contains(motion)) {
    if (motion != 'shake-y') x = math.sin(phase * 7) * travel * r.width * .1;
    if (motion != 'shake-x') y = math.sin(phase * 9) * travel * r.height * .1;
  }
  if (motion == 'stagger') {
    x = math.sin(phase) * travel * r.width * .15;
    y = math.sin(phase * 2) * travel * r.height * .1;
    rotation = math.sin(phase) * travel * .3;
  }
  if (motion == 'breathing') scale = 1 + travel * (.5 - .5 * math.cos(phase));
  if (motion == 'slow-pan') {
    scale = 1 + travel;
    x = math.sin(phase) * travel * r.width * .4;
  }
  if (motion == 'spin-fall') {
    rotation = p * math.pi * 2;
    scale = 1 - .8 * p;
    y = p * p * r.height;
    overlay = p * p;
  }
  if (motion.startsWith('suck-in')) {
    scale = 1 + 8 * p * p;
    rotation = p * p * travel * 2;
    overlay = p * p;
  }
  if (motion == 'rise' || motion == 'descend')
    y = (motion == 'rise' ? -1 : 1) * p * r.height * travel;
  if (motion == 'wave') wave = travel * r.width * .15;
  if (motion.contains('-white')) white = 1;
  if (motion.endsWith('-white') || motion.endsWith('-black')) overlay = p;
  if (motion == 'fade-transparent') opacity *= 1 - p;
  double smooth(double v) => v * v * v * (v * (v * 6 - 15) + 10);
  if (b['profile'] == 'reference') {
    final a = travel / .15,
        e = p * p * (3 - 2 * p),
        fadeEnd = smooth(((p - .55) / .45).clamp(0.0, 1.0));
    if (['shake', 'shake-x', 'shake-y'].contains(motion)) {
      x = motion == 'shake-y'
          ? 0
          : (math.sin(phase) * 16 + math.sin(phase * 10) * 5) * a;
      y = motion == 'shake-x'
          ? 0
          : (math.sin(phase) * 14 + math.sin(phase * 9) * 4) * a;
      if (motion == 'shake') {
        x = (math.sin(phase * 4) * 10 + math.sin(phase * 9) * 4) * a;
        y = (math.cos(phase * 3) * 8 + math.sin(phase * 7) * 3) * a;
        rotation = math.sin(phase * 3) * .012 * a;
      }
    }
    if (motion == 'stagger') {
      x = (math.sin(phase) * 7 + math.sin(phase * 2 + .6) * 2.5) * a;
      y = (math.cos(phase - .4) * 5 + math.sin(phase * 3) * 1.8) * a;
      rotation = math.sin(phase - .8) * .018 * a;
    }
    if (motion == 'breathing') {
      scale = 1 + (1 - math.cos(phase)) * .02 * a;
      y = -(1 - math.cos(phase)) * a;
    }
    if (motion == 'slow-pan') {
      scale = 1;
      x = math.sin(phase) * 54 * a;
    }
    if (motion == 'spin-fall') {
      scale = 1.02 * (1 - e * .78);
      rotation = e * 1.18;
      y = e * 52;
      overlay = fadeEnd;
    }
    if (motion.startsWith('suck-in')) {
      scale = 1 + e * .52;
      rotation = e * .2;
      overlay = fadeEnd;
    }
    if (motion == 'rise' || motion == 'descend') {
      y = (motion == 'rise' ? -1 : 1) * e * 130 * a;
      overlay = fadeEnd;
    }
    if (motion == 'wave') {
      scale = 1.05;
      wave = 8 * a;
    }
    if (motion.startsWith('zoom-in')) scale = 1 + e * travel;
    if (motion.startsWith('zoom-out')) scale = 1 + (1 - e) * travel;
    if (motion.startsWith('zoom-') &&
        (motion.endsWith('-white') || motion.endsWith('-black')))
      overlay = fadeEnd;
  }
  if (motion.startsWith('fade-')) {
    final fade = b['fadeDirection'] == 'in' ? 1 - smooth(p) : smooth(p);
    if (motion == 'fade-transparent') {
      opacity =
          (b['enabled'] == true ? (b['fade'] == true ? s['opacity']! : 1) : 0) *
          (1 - fade);
    } else {
      overlay = fade;
    }
  }
  final count = b['transitionSource'] == 'original-filter'
          ? math.min(1, backgroundAssetIds(r).length)
          : backgroundAssetIds(r).length,
      position = p * math.max(0, count - 1);
  final index = math.min(position.floor(), math.max(0, count - 1)),
      next = count > 0 ? math.min(index + 1, count - 1) : 0,
      mix = smooth(
        b["transitionSource"] == "original-filter" || count == 1
            ? p
            : position - index,
      );
  return {
    'x': x,
    'y': y,
    'scale': scale,
    'rotation': rotation,
    'opacity': opacity,
    'overlay': overlay,
    'white': white,
    'wave': wave,
    'index': index.toDouble(),
    'next': next.toDouble(),
    'mix': mix,
  };
}

List<Map<String, double>> particlesAt(EffectRecipe r, double seconds) {
  final p = {...defaultParticles, ...r.particles}, s = evaluate(r, seconds);
  if (!(p['enabled'] as bool)) return [];
  if (p['advanced'] == true)
    return advancedParticles(r, s['time']!, s['opacity']!);
  return List.generate(p['count'] as int, (i) {
    double rnd(int c) => randomAt(p['seed'] as int, i, c);
    final lifetime = (p['lifetime'] as num).toDouble();
    final age = p['emission'] == 'burst'
        ? s['time']!
        : (s['time']! + rnd(0) * lifetime) % lifetime;
    final life = age / lifetime;
    final angle = (-90 + (rnd(1) - 0.5) * (p['spread'] as num)) * math.pi / 180;
    final speed = (p['speed'] as num) * (0.5 + rnd(2));
    double x = r.width * (p['x'] as num) + math.cos(angle) * speed * age;
    double y =
        r.height * (p['y'] as num) +
        math.sin(angle) * speed * age +
        0.5 * (p['gravity'] as num) * age * age;
    if (p['preset'] == 'snow') {
      x =
          rnd(1) * r.width +
          math.sin(age * 2 + rnd(2) * 6.28) * (p['spread'] as num) * 0.1;
      y =
          -(p['size'] as num).toDouble() +
          age * (p['speed'] as num) +
          0.5 * (p['gravity'] as num) * age * age;
    }
    return {
      'x': x,
      'y': y,
      'size': (p['size'] as num) * (0.5 + rnd(3)),
      'rotation': rnd(4) * math.pi * 2 + age * (rnd(5) - 0.5) * 6,
      'opacity': life >= 1
          ? 0
          : math.max(0.0, math.min(1.0, (1 - life) * 4)) * s['opacity']!,
    };
  });
}

/// Absolute-time trajectories and trail endpoints match the TypeScript evaluator.
List<Map<String, double>> advancedParticles(
  EffectRecipe r,
  double time,
  double alpha,
) {
  final p = {...defaultParticles, ...r.particles};
  double v(String key) => (p[key] as num).toDouble();
  final clock = time - v('delay');
  if (clock < 0) return [];
  List<int> channels(String hex) => [
    1,
    3,
    5,
  ].map((i) => int.parse(hex.substring(i, i + 2), radix: 16)).toList();
  final startColor = channels(p['color']), endColor = channels(p['colorEnd']);
  return List.generate(p['count'] as int, (i) {
    double rnd(int c) => randomAt(p['seed'] as int, i, c);
    final lifetime =
        v('lifetime') * (1 + (rnd(6) * 2 - 1) * v('lifeVariation'));
    final start = p['emission'] == 'continuous' && p['prewarm'] == false
        ? rnd(0) * lifetime
        : 0.0;
    final age = p['emission'] == 'burst'
        ? (v('burstInterval') > 0 ? clock % v('burstInterval') : clock)
        : math.max(
                0.0,
                clock - start + (p['prewarm'] == true ? rnd(0) * lifetime : 0),
              ) %
              lifetime;
    final life = math.min(1.0, age / lifetime);
    final angle =
        (v('direction') + (rnd(1) - .5) * v('spread')) * math.pi / 180;
    final speed = v('speed') * (1 + (rnd(2) * 2 - 1) * v('speedVariation'));
    final radius =
        v('radius') *
        math.min(r.width, r.height) *
        (p['emitter'] == 'circle' ? math.sqrt(rnd(8)) : 1);
    final phi = rnd(7) * math.pi * 2;
    double ox = 0, oy = 0;
    if (p['emitter'] == 'box') {
      ox = (rnd(7) - .5) * v('areaWidth') * r.width;
      oy = (rnd(8) - .5) * v('areaHeight') * r.height;
    }
    if (p['emitter'] == 'circle' || p['emitter'] == 'ring') {
      ox = math.cos(phi) * radius;
      oy = math.sin(phi) * radius;
    }
    Offset position(double t) {
      final travel = v('drag') > 0
          ? (1 - math.exp(-v('drag') * t)) / v('drag')
          : t;
      double x = ox + math.cos(angle) * speed * travel;
      double y =
          oy + math.sin(angle) * speed * travel + .5 * v('gravity') * t * t;
      if (p['path'] != 'ballistic') {
        final orbitRadius = p['emitter'] == 'point'
            ? radius
            : math.sqrt(ox * ox + oy * oy);
        final theta =
            (p['emitter'] == 'point' ? phi : math.atan2(oy, ox)) +
            v('orbitSpeed') * t * math.pi / 180;
        final shrink = p['path'] == 'vortex'
            ? math.pow(math.max(0.0, 1 - t / lifetime), 2).toDouble()
            : 1.0;
        x = math.cos(theta) * orbitRadius * shrink;
        y = math.sin(theta) * orbitRadius * shrink;
      }
      final phase = rnd(9) * math.pi * 2;
      return Offset(
        r.width * v('x') +
            x +
            v('wind') * t +
            v('turbulence') * (math.sin(t * 3 + phase) - math.sin(phase)),
        r.height * v('y') +
            y +
            v('turbulence') * .35 * (math.cos(t * 2 + phase) - math.cos(phase)),
      );
    }

    final head = position(age),
        tail = position(math.max(0.0, age - v('trail'))),
        previous = position(math.max(0.0, age - .01));
    final fadeIn = v('fadeIn') > 0 ? math.min(1.0, life / v('fadeIn')) : 1.0;
    final fadeOut = v('fadeOut') > 0
        ? math.min(1.0, (1 - life) / v('fadeOut'))
        : 1.0;
    return {
      'x': head.dx,
      'y': head.dy,
      'tailX': tail.dx,
      'tailY': tail.dy,
      'size':
          v('size') *
          (1 + (rnd(3) * 2 - 1) * v('sizeVariation')) *
          (1 + (v('sizeEnd') - 1) * life),
      'rotation': p['shape'] == 'spark'
          ? math.atan2(head.dy - previous.dy, head.dx - previous.dx)
          : rnd(4) * math.pi * 2 + v('spin') * age * math.pi / 180,
      'opacity': clock < start || age >= lifetime
          ? 0.0
          : math.max(0.0, fadeIn * fadeOut) *
                v('opacity') *
                (p['sync'] == true ? alpha : 1.0),
      'red': (startColor[0] + (endColor[0] - startColor[0]) * life)
          .roundToDouble(),
      'green': (startColor[1] + (endColor[1] - startColor[1]) * life)
          .roundToDouble(),
      'blue': (startColor[2] + (endColor[2] - startColor[2]) * life)
          .roundToDouble(),
    };
  });
}

Map<String, dynamic> sceneSnapshot(EffectRecipe r, double seconds) => {
  ...evaluate(r, seconds),
  'background': backgroundAt(r, seconds),
  'frame': frameAt(r, seconds),
  'particles': particlesAt(r, seconds),
  'glyphs': r.typography['enabled'] == true
      ? List.generate(
          currentText(r, seconds).runes.length,
          (i) => glyphAt(r, seconds, i, currentText(r, seconds).runes.length),
        )
      : [],
};

/// Caller owns the returned images and must dispose them after the widget unmounts.
Future<Map<String, ui.Image>> loadSceneImages(
  EffectRecipe r, {
  String assetPrefix = 'assets/images/',
}) async {
  final images = <String, ui.Image>{};
  try {
    for (final id in {
      ...backgroundAssetIds(r),
      r.background['assetId'],
      r.image['assetId'],
      ...(r.studio['nodes'] as List? ?? []).map((n) => n['assetId']),
    }.whereType<String>()) {
      final bytes = await rootBundle.load('$assetPrefix$id.png');
      final codec = await ui.instantiateImageCodec(
        bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes),
      );
      try {
        images[id] = (await codec.getNextFrame()).image;
      } finally {
        codec.dispose();
      }
    }
    final filter = r.background['filter'] as String? ?? 'none';
    if (filter != 'none')
      for (final id in backgroundAssetIds(r)) {
        images['$id:background'] = await filterImage(images[id]!, filter);
      }
    return images;
  } catch (_) {
    for (final image in images.values) {
      image.dispose();
    }
    rethrow;
  }
}

Color layerColor(String hex) =>
    Color(int.parse('ff${hex.substring(1)}', radix: 16));

class ScenePainter extends CustomPainter {
  final EffectRecipe recipe;
  final double seconds;
  final Map<String, ui.Image> images;
  ScenePainter(this.recipe, this.seconds, this.images);
  void drawImage(
    Canvas canvas,
    ui.Image image,
    double width,
    double height,
    String fit,
    double opacity,
  ) {
    final scale = fit == 'cover'
        ? math.max(width / image.width, height / image.height)
        : math.min(width / image.width, height / image.height);
    canvas.drawImageRect(
      image,
      Rect.fromLTWH(0, 0, image.width.toDouble(), image.height.toDouble()),
      Rect.fromCenter(
        center: Offset.zero,
        width: image.width * scale,
        height: image.height * scale,
      ),
      Paint()
        ..color = Colors.white.withValues(alpha: opacity)
        ..filterQuality = FilterQuality.medium,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final r = recipe,
        b = {...defaultBackground, ...r.background},
        s = backgroundAt(r, seconds);
    canvas.save();
    canvas.clipRect(Offset.zero & size);
    if (b['enabled'] as bool) {
      canvas.save();
      canvas.translate(r.width / 2 + s['x']!, r.height / 2 + s['y']!);
      canvas.rotate(s['rotation']!);
      canvas.scale(s['scale']!);
      final rect = Rect.fromCenter(
        center: Offset.zero,
        width: r.width,
        height: r.height,
      );
      canvas.drawRect(
        rect,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              layerColor(b['color']).withValues(alpha: s['opacity']!),
              layerColor(b['endColor']).withValues(alpha: s['opacity']!),
            ],
          ).createShader(rect),
      );
      final ids = backgroundAssetIds(r),
          transition = ['crossfade', 'hard-cut', 'wipe'].contains(b['motion']);
      void draw(String? id, double opacity, [bool original = false]) {
        if (id == null) return;
        final image = original
            ? images[id]
            : images['$id:background'] ?? images[id];
        if (image == null) return;
        if (s['wave']! > 0) {
          for (double y = 0; y < r.height; y += 4) {
            canvas.save();
            canvas.clipRect(
              Rect.fromLTWH(-r.width / 2, y - r.height / 2, r.width, 4),
            );
            canvas.translate(
              math.sin(
                    y / r.height * math.pi * 6 +
                        evaluate(r, seconds)['time']! /
                            r.duration *
                            math.pi *
                            2,
                  ) *
                  s['wave']!,
              0,
            );
            drawImage(canvas, image, r.width, r.height, b['fit'], opacity);
            canvas.restore();
          }
        } else {
          drawImage(canvas, image, r.width, r.height, b['fit'], opacity);
        }
      }

      final single =
          transition &&
          (b['transitionSource'] == 'original-filter' || ids.length == 1);
      if (ids.isNotEmpty)
        draw(ids[transition ? s['index']!.toInt() : 0], s['opacity']!, single);
      if (transition && (ids.length > 1 || single)) {
        canvas.save();
        if (b['motion'] == 'wipe')
          canvas.clipRect(
            Rect.fromLTWH(
              -r.width / 2,
              -r.height / 2,
              r.width * s['mix']!,
              r.height,
            ),
          );
        if (b['motion'] != 'hard-cut' || s['mix']! >= .5)
          draw(
            ids[single ? 0 : s['next']!.toInt()],
            s['opacity']! * (b['motion'] == 'crossfade' ? s['mix']! : 1),
          );
        canvas.restore();
      }
      canvas.restore();
      if (s['overlay']! > 0)
        canvas.drawRect(
          Offset.zero & size,
          Paint()
            ..color = (s['white']! > 0 ? Colors.white : Colors.black)
                .withValues(alpha: s['overlay']! * s['opacity']!),
        );
    }
    final im = {...defaultImage, ...r.image};
    final image = images[im['assetId']];
    if (im['enabled'] as bool && image != null) {
      canvas.save();
      canvas.translate(
        r.width / 2 + (im['x'] as num),
        r.height / 2 + (im['y'] as num),
      );
      canvas.rotate((im['rotation'] as num) * math.pi / 180);
      canvas.scale((im['scale'] as num).toDouble());
      drawImage(
        canvas,
        image,
        r.width,
        r.height,
        im['fit'],
        (im['opacity'] as num).toDouble(),
      );
      canvas.restore();
    }
    final p = {...defaultParticles, ...r.particles},
        points = particlesAt(r, seconds);
    if (p['advanced'] == true) paintAdvancedParticles(canvas, r, seconds);
    for (var i = 0; p['advanced'] != true && i < points.length; i++) {
      final point = points[i];
      if (point['opacity']! <= 0) continue;
      canvas.save();
      canvas.translate(point['x']!, point['y']!);
      canvas.rotate(point['rotation']!);
      final color = p['preset'] == 'confetti'
          ? [p['color'], '#ff79b0', '#7fdfff', '#ffe38b'][i % 4]
          : p['color'];
      final paint = Paint()
        ..color = layerColor(color).withValues(alpha: point['opacity']!);
      final d = point['size']!;
      if (p['preset'] == 'snow') {
        canvas.drawCircle(Offset.zero, d / 2, paint);
      } else {
        canvas.drawRect(
          Rect.fromLTWH(
            -d / 2,
            -d / 2,
            d,
            d * (p['preset'] == 'sparks' ? 0.3 : 0.6),
          ),
          paint,
        );
      }
      canvas.restore();
    }
    final backdrop = {...defaultBackdrop, ...r.backdrop};
    if (backdrop['type'] != 'none') {
      final a =
              (backdrop['opacity'] as num) *
              (backdrop['sync'] == true ? evaluate(r, seconds)['opacity']! : 1),
          color = layerColor(backdrop['color']).withValues(alpha: a.toDouble()),
          rect = Rect.fromLTWH(0, 0, r.width, r.height),
          paint = Paint()..color = color;
      if (backdrop['type'] == 'vignette') {
        paint.shader = RadialGradient(
          colors: [color.withValues(alpha: 0), color],
          radius: .7,
        ).createShader(rect);
      } else if (backdrop['type'] != 'solid') {
        paint.shader = LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: backdrop['type'] == 'top'
              ? [color, color.withValues(alpha: 0)]
              : [color.withValues(alpha: 0), color],
        ).createShader(rect);
      }
      canvas.drawRect(rect, paint);
    }
    paintTypography(canvas, r, seconds);
    canvas.restore();
  }

  @override
  bool shouldRepaint(ScenePainter oldDelegate) =>
      oldDelegate.seconds != seconds ||
      oldDelegate.recipe != recipe ||
      oldDelegate.images != images;
}

void paintAdvancedParticles(Canvas canvas, EffectRecipe r, double seconds) {
  final p = {...defaultParticles, ...r.particles};
  final blend = p['blend'] == 'add' ? BlendMode.plus : BlendMode.srcOver;
  for (final point in particlesAt(r, seconds)) {
    final d = point['size']!, opacity = point['opacity']!;
    if (opacity <= 0 || d <= .01) continue;
    final color = Color.fromARGB(
      255,
      point['red']!.toInt(),
      point['green']!.toInt(),
      point['blue']!.toInt(),
    );
    final head = Offset(point['x']!, point['y']!),
        tail = Offset(point['tailX']!, point['tailY']!);
    Paint paint() => Paint()
      ..blendMode = blend
      ..color = color.withValues(alpha: opacity);
    if ((p['trail'] as num) > 0 && (head - tail).distance > .01) {
      canvas.drawLine(
        tail,
        head,
        paint()
          ..strokeWidth = math.max(1.0, d * .35)
          ..strokeCap = StrokeCap.round
          ..shader = ui.Gradient.linear(tail, head, [
            color.withValues(alpha: 0),
            color.withValues(alpha: opacity),
          ]),
      );
    }
    canvas.save();
    canvas.translate(head.dx, head.dy);
    canvas.rotate(point['rotation']!);
    final glow = (p['glow'] as num).toDouble();
    if (glow > 0) {
      final radius = d / 2 + glow;
      canvas.drawRect(
        Rect.fromCircle(center: Offset.zero, radius: radius),
        paint()
          ..shader = ui.Gradient.radial(Offset.zero, radius, [
            color.withValues(alpha: opacity * .45),
            color.withValues(alpha: 0),
          ]),
      );
    }
    final body = paint(), path = Path();
    if (p['shape'] == 'smoke') {
      body.shader = ui.Gradient.radial(
        Offset.zero,
        d / 2,
        [
          color.withValues(alpha: opacity),
          color.withValues(alpha: opacity * .65),
          color.withValues(alpha: 0),
        ],
        [0, .45, 1],
      );
      canvas.drawCircle(Offset.zero, d / 2, body);
    } else if (p['shape'] == 'ring') {
      canvas.drawCircle(
        Offset.zero,
        d / 2,
        body
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(1.0, d * .035),
      );
    } else if (['star', 'diamond', 'spark'].contains(p['shape'])) {
      final n = p['shape'] == 'star' ? 10 : 4;
      for (var i = 0; i < n; i++) {
        final a = i * math.pi * 2 / n - math.pi / 2;
        final radius = d * (p['shape'] == 'star' && i.isOdd ? .2 : .5);
        final x = math.cos(a) * radius * (p['shape'] == 'spark' ? 3 : 1),
            y = math.sin(a) * radius * (p['shape'] == 'spark' ? .5 : 1);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      path.close();
      canvas.drawPath(path, body);
    } else if (p['shape'] == 'petal') {
      path.moveTo(0, -d / 2);
      path.cubicTo(d * .75, -d * .15, d * .25, d * .5, 0, d / 2);
      path.cubicTo(-d * .5, d * .1, -d * .3, -d * .25, 0, -d / 2);
      canvas.drawPath(path, body);
    } else {
      canvas.drawCircle(Offset.zero, d / 2, body);
    }
    canvas.restore();
  }
}
