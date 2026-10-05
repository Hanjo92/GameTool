import 'dart:math' as math;
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'motion.dart';
import 'layers.dart' show particlesAt;

double sn(dynamic v, [double fallback = 0]) =>
    v is num ? v.toDouble() : fallback;
Map<String, dynamic> sm(dynamic v) =>
    v is Map ? Map<String, dynamic>.from(v) : {};
double sc(double v, [double min = 0, double max = 1]) =>
    v.clamp(min, max).toDouble();
double studioCurve(dynamic points, double t, [double fallback = 1]) {
  final list = (points as List?) ?? [];
  if (list.isEmpty) return fallback;
  if (t <= sn(list.first['t'])) return sn(list.first['value']);
  for (var i = 1; i < list.length; i++) {
    final a = list[i - 1], b = list[i];
    if (t <= sn(b['t']))
      return sn(a['value']) +
          (sn(b['value']) - sn(a['value'])) *
              sc((t - sn(a['t'])) / math.max(.000001, sn(b['t']) - sn(a['t'])));
  }
  return sn(list.last['value']);
}

double studioCurveAverage(dynamic points, double t) {
  final list = (points as List?) ?? [];
  if (list.isEmpty) return 1;
  if (t <= 0) return studioCurve(points, 0);
  final stops = <double>[
    0,
    ...list.map((p) => sn(p['t'])).where((x) => x > 0 && x < t),
    t,
  ];
  var area = 0.0;
  for (var i = 1; i < stops.length; i++) {
    area +=
        (studioCurve(points, stops[i - 1]) + studioCurve(points, stops[i])) *
        .5 *
        (stops[i] - stops[i - 1]);
  }
  return area / t;
}

Map<String, dynamic> get studioQualityDefaults => {
  'level': 'high',
  'reducedMotion': false,
  'particleBudget': 1000,
  'instances': 1,
  'fpsTarget': 60,
};
double _ease(double t, String mode) => mode == 'in'
    ? t * t
    : mode == 'out'
    ? 1 - math.pow(1 - t, 2).toDouble()
    : mode == 'smooth'
    ? t * t * (3 - 2 * t)
    : t;

/// Portable absolute-time node evaluation; no build context, service or asset IO.
List<Map<String, dynamic>> studioFrames(
  EffectRecipe r,
  double seconds, [
  Map<String, dynamic> data = const {},
  Map<String, String> states = const {},
  Map<String, dynamic>? quality,
]) {
  final studio = r.studio;
  if (studio['enabled'] != true) return [];
  final q = quality ?? sm(studio['quality']),
      t = r.loop && (r.loopCount == 0 || seconds < r.duration * r.loopCount)
          ? seconds % r.duration
          : math.min(r.duration, seconds),
      values = {...sm(studio['data']), ...data};
  final nodes = (studio['nodes'] as List? ?? []).map(sm).toList(),
      byId = <String, Map<String, dynamic>>{};
  Map<String, dynamic> sample(Map<String, dynamic> node) {
    final id = node['id'] as String;
    if (byId.containsKey(id)) return byId[id]!;
    final localTime = math.max(0.0, t - sn(node['start'])),
        w = sm(node['widget']);
    final f = <String, dynamic>{
      ...node,
      'visible':
          node['enabled'] == true &&
          t >= sn(node['start']) &&
          t < sn(node['start']) + sn(node['duration']) &&
          t < sn(studio['duration']),
      'value': sn(w['value']),
      'state': states[id] ?? w['state'] ?? 'normal',
      'localTime': localTime,
      'points': <Map<String, dynamic>>[],
    };
    byId[id] = f;
    for (final track in node['tracks'] as List? ?? []) {
      final keys = track['keys'] as List;
      if (keys.isEmpty) continue;
      final time =
          q['reducedMotion'] == true &&
              track['property'] != 'value' &&
              track['property'] != 'opacity'
          ? 0.0
          : localTime;
      var v = sn(keys.first['value']);
      for (var i = 1; i < keys.length; i++) {
        final a = keys[i - 1], b = keys[i];
        if (time >= sn(b['time'])) {
          v = sn(b['value']);
          continue;
        }
        v =
            sn(a['value']) +
            (sn(b['value']) - sn(a['value'])) *
                _ease(
                  sc(
                    (time - sn(a['time'])) /
                        math.max(.000001, sn(b['time']) - sn(a['time'])),
                  ),
                  b['easing'],
                );
        break;
      }
      f[track['property']] = v;
    }
    for (final b in studio['bindings'] as List? ?? []) {
      if (b['nodeId'] != id || !values.containsKey(b['key'])) continue;
      final raw = values[b['key']], property = b['property'];
      if (property == 'text') {
        f['text'] = (b['format'] as String).replaceAll(
          '{value}',
          _scalarString(raw),
        );
        if (f['widget'] != null)
          f['widget'] = {...sm(f['widget']), 'label': f['text']};
      } else if (property == 'visible')
        f['visible'] =
            f['visible'] == true && raw != false && raw != 0 && raw != '';
      else if (property == 'color' &&
          raw is String &&
          RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(raw))
        f['color'] = raw;
      else if (property == 'state' &&
          ['normal', 'pressed', 'selected', 'disabled'].contains(raw))
        f['state'] = raw;
      else if (['x', 'y', 'value', 'opacity'].contains(property) && raw is num)
        f[property] = sc(
          raw * sn(b['scale']) + sn(b['offset']),
          sn(b['min']),
          sn(b['max']),
        );
    }
    final follow = sm(node['follow']);
    if (values[follow['xKey']] is num)
      f['x'] = sn(values[follow['xKey']]) + sn(follow['offsetX']);
    if (values[follow['yKey']] is num)
      f['y'] = sn(values[follow['yKey']]) + sn(follow['offsetY']);
    if (w.isNotEmpty) {
      f['style'] = {...sm(sm(w['states'])[f['state']])};
      if ((studio['bindings'] as List? ?? []).any(
        (b) =>
            b['nodeId'] == id &&
            b['property'] == 'color' &&
            values.containsKey(b['key']),
      ))
        f['style']['color'] = f['color'];
    }
    if (node['parentId'] != null) {
      final matches = nodes.where((n) => n['id'] == node['parentId']);
      if (matches.isNotEmpty) {
        final p = sample(matches.first),
            a = sn(p['rotation']) * math.pi / 180,
            x = sn(f['x']) * sn(p['scale']),
            y = sn(f['y']) * sn(p['scale']);
        f['x'] = sn(p['x']) + x * math.cos(a) - y * math.sin(a);
        f['y'] = sn(p['y']) + x * math.sin(a) + y * math.cos(a);
        f['rotation'] = sn(f['rotation']) + sn(p['rotation']);
        f['scale'] = sn(f['scale']) * sn(p['scale']);
        f['opacity'] = sn(f['opacity']) * sn(p['opacity']);
        f['visible'] = f['visible'] == true && p['visible'] == true;
      }
    }
    f['opacity'] = sc(sn(f['opacity']));
    return f;
  }

  final frames = nodes.map(sample).toList()
    ..sort((a, b) => sn(a['zIndex']).compareTo(sn(b['zIndex'])));
  var remaining = (sn(q['particleBudget']) / math.max(1, sn(q['instances'])))
      .floor();
  for (final f in frames) {
    if (f['kind'] != 'particles' || f['visible'] != true) continue;
    final p = <String, dynamic>{
      ..._particleDefaults,
      ...sm(f['particles']),
      'enabled': true,
      'sync': false,
    };
    final factor = q['reducedMotion'] == true
        ? .1
        : q['level'] == 'low'
        ? .25
        : q['level'] == 'medium'
        ? .5
        : 1;
    final count = math.max(
      0,
      math.min(remaining, (sn(p['count']) * factor).ceil()),
    );
    p['count'] = count;
    remaining -= count;
    final time = q['reducedMotion'] == true
        ? math.min(.2, sn(f['localTime']))
        : sn(f['localTime']);
    final pr = EffectRecipe(
      text: '',
      color: '#ffffff',
      effect: 'fade',
      fontSize: 16,
      width: sn(f['width']),
      height: sn(f['height']),
      enter: 0,
      hold: math.max(sn(f['duration']), time + 1),
      exit: 0,
      distance: 0,
      loop: false,
      particles: p,
    );
    final curves = sm(f['curves']);
    final points = particlesAt(pr, time);
    f['points'] = List.generate(points.length, (i) {
      final point = points[i],
          life = _particleLife(p, time, i),
          speed = studioCurveAverage(curves['speed'], life),
          cx = sn(f['width']) * sn(p['x']),
          cy = sn(f['height']) * sn(p['y']);
      return <String, dynamic>{
        ...point,
        'x': cx + (point['x']! - cx) * speed - sn(f['width']) / 2,
        'y': cy + (point['y']! - cy) * speed - sn(f['height']) / 2,
        if (point['tailX'] != null)
          'tailX': cx + (point['tailX']! - cx) * speed - sn(f['width']) / 2,
        if (point['tailY'] != null)
          'tailY': cy + (point['tailY']! - cy) * speed - sn(f['height']) / 2,
        'size': point['size']! * studioCurve(curves['size'], life),
        'opacity': point['opacity']! * studioCurve(curves['opacity'], life),
      };
    });
  }
  return frames;
}

String _scalarString(dynamic value) =>
    value is num && value == value.roundToDouble()
    ? value.toInt().toString()
    : value.toString();
const _particleDefaults = <String, dynamic>{
  'enabled': true,
  'preset': 'snow',
  'emission': 'continuous',
  'seed': 42,
  'count': 80,
  'size': 4,
  'speed': 90,
  'lifetime': 3,
  'gravity': 20,
  'spread': 180,
  'x': .5,
  'y': .5,
  'color': '#c6fa73',
  'advanced': false,
  'shape': 'circle',
  'emitter': 'point',
  'path': 'ballistic',
  'direction': -90,
  'radius': .25,
  'areaWidth': 1,
  'areaHeight': .1,
  'speedVariation': .4,
  'sizeVariation': .4,
  'lifeVariation': .2,
  'wind': 0,
  'drag': 0,
  'turbulence': 0,
  'spin': 90,
  'orbitSpeed': 90,
  'sizeEnd': 0,
  'colorEnd': '#ff6430',
  'fadeIn': .1,
  'fadeOut': .5,
  'opacity': 1,
  'glow': 0,
  'trail': 0,
  'blend': 'normal',
  'delay': 0,
  'burstInterval': 0,
  'prewarm': true,
  'sync': false,
};
double _particleLife(Map<String, dynamic> p, double t, int i) {
  final advanced = p['advanced'] == true,
      lifetime =
          sn(p['lifetime']) *
          (advanced
              ? 1 + (randomAt(p['seed'], i, 6) * 2 - 1) * sn(p['lifeVariation'])
              : 1),
      clock = math.max(0.0, t - (advanced ? sn(p['delay']) : 0)),
      start = advanced && p['emission'] == 'continuous' && p['prewarm'] != true
          ? randomAt(p['seed'], i, 0) * lifetime
          : 0;
  final age = p['emission'] == 'burst'
      ? advanced && sn(p['burstInterval']) > 0
            ? clock % sn(p['burstInterval'])
            : clock
      : math.max(
              0,
              clock -
                  start +
                  (!advanced || p['prewarm'] == true
                      ? randomAt(p['seed'], i, 0) * lifetime
                      : 0),
            ) %
            lifetime;
  return sc(age / lifetime);
}

Color _color(dynamic value) => Color(
  int.parse('ff${(value as String? ?? '#ffffff').substring(1)}', radix: 16),
);
Map<String, dynamic> _mix(
  Map<String, dynamic> a,
  Map<String, dynamic> b,
  double t,
) => {
  'color':
      '#${(Color.lerp(_color(a['color']), _color(b['color']), t)!.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0')}',
  'background':
      '#${(Color.lerp(_color(a['background']), _color(b['background']), t)!.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0')}',
  'scale': sn(a['scale']) + (sn(b['scale']) - sn(a['scale'])) * t,
  'opacity': sn(a['opacity']) + (sn(b['opacity']) - sn(a['opacity'])) * t,
};

class StudioRuntime {
  final EffectRecipe recipe;
  late final Map<String, dynamic> data;
  final states = <String, String>{};
  late Map<String, dynamic> quality;
  final _listeners = <void Function(Map<String, dynamic>)>{};
  final _transitions = <String, Map<String, dynamic>>{};
  double _time = 0;
  String? _pressed;
  final _samples = <double>[];
  int _rendered = 0;
  StudioRuntime(this.recipe) {
    data = {...sm(recipe.studio['data'])};
    quality = {...studioQualityDefaults, ...sm(recipe.studio['quality'])};
  }
  void setData(Map<String, dynamic> values) {
    for (final e in values.entries) {
      if (e.value is String ||
          e.value is bool ||
          e.value is num && (e.value as num).isFinite)
        data[e.key] = e.value;
    }
  }

  void setQuality(Map<String, dynamic> values) {
    final q = {...quality, ...values};
    if (!['low', 'medium', 'high'].contains(q['level']) ||
        sn(q['instances']) < 1 ||
        sn(q['instances']) > 32 ||
        sn(q['instances']) != sn(q['instances']).floor() ||
        sn(q['particleBudget']) < 0 ||
        sn(q['particleBudget']) > 5000 ||
        sn(q['particleBudget']) != sn(q['particleBudget']).floor() ||
        sn(q['fpsTarget']) < 1 ||
        sn(q['fpsTarget']) > 240 ||
        q['reducedMotion'] is! bool)
      throw ArgumentError('Invalid studio quality');
    quality = q;
  }

  void setNodeState(String id, String state) {
    final matching = (recipe.studio['nodes'] as List? ?? []).where(
      (n) => n['id'] == id && n['widget'] != null,
    );
    if (matching.isEmpty ||
        !['normal', 'pressed', 'selected', 'disabled'].contains(state))
      throw ArgumentError('Unknown widget or state');
    final frame = frames(_time).firstWhere((f) => f['id'] == id),
        w = sm(matching.first['widget']);
    states[id] = state;
    _transitions[id] = {
      'from': sm(frame['style']),
      'to': sm(w['states'])[state],
      'elapsed': 0.0,
      'duration': quality['reducedMotion'] == true ? 0.0 : sn(w['transition']),
    };
  }

  bool advanceUI(double delta) {
    var changed = false;
    for (final v in _transitions.values) {
      if (sn(v['elapsed']) < sn(v['duration'])) {
        v['elapsed'] = sn(v['elapsed']) + delta;
        changed = true;
      }
    }
    return changed;
  }

  VoidCallback onEvent(void Function(Map<String, dynamic>) listener) {
    _listeners.add(listener);
    return () => _listeners.remove(listener);
  }

  void _emit(Map<String, dynamic> event) {
    for (final listener in _listeners.toList()) {
      listener({
        ...event,
        'payload': {...sm(event['payload'])},
      });
    }
  }

  void transport(String kind, double previous, double seconds) {
    _time = seconds;
    if (kind != 'advance') {
      _transitions.clear();
      return;
    }
    if (recipe.studio['enabled'] != true || seconds <= previous) return;
    final d = recipe.duration,
        maxLoop = recipe.loop
            ? recipe.loopCount > 0
                  ? recipe.loopCount - 1
                  : (seconds / d).floor()
            : 0;
    for (
      var loop = math.max((previous / d).floor(), (seconds / d).floor() - 255);
      loop <= math.min(maxLoop, (seconds / d).floor());
      loop++
    ) {
      for (final event in [
        ...(recipe.studio['events'] as List? ?? []),
      ]..sort((a, b) => sn(a['time']).compareTo(sn(b['time'])))) {
        final time = loop * d + sn(event['time']);
        if (time > previous && time <= seconds ||
            previous == 0 && sn(event['time']) == 0 && loop == 0)
          _emit({...sm(event), 'time': time, 'loop': loop});
      }
    }
  }

  List<Map<String, dynamic>> frames(double time) {
    _time = time;
    final result = studioFrames(recipe, time, data, states, quality);
    for (final f in result) {
      final transition = _transitions[f['id']];
      if (transition != null &&
          f['style'] != null &&
          f['state'] == states[f['id']])
        f['style'] = _mix(
          sm(transition['from']),
          sm(transition['to']),
          sn(transition['duration']) > 0
              ? sc(sn(transition['elapsed']) / sn(transition['duration']))
              : 1,
        );
    }
    return result;
  }

  String? hitTest(double x, double y) {
    for (final f in frames(_time).reversed) {
      if (f['visible'] != true ||
          sn(f['opacity']) <= 0 ||
          f['widget'] == null ||
          f['state'] == 'disabled' ||
          sn(f['scale']) == 0)
        continue;
      final a = -sn(f['rotation']) * math.pi / 180,
          dx = x - sn(f['x']),
          dy = y - sn(f['y']),
          s = sn(f['scale']) * sn(sm(f['style'])['scale'], 1);
      if (((dx * math.cos(a) - dy * math.sin(a)) / s).abs() <=
              sn(f['width']) / 2 &&
          ((dx * math.sin(a) + dy * math.cos(a)) / s).abs() <=
              sn(f['height']) / 2)
        return f['id'] as String;
    }
    return null;
  }

  String? pointer(String type, double x, double y) {
    final id = hitTest(x, y);
    if (type == 'down' && id != null) {
      _pressed = id;
      setNodeState(id, 'pressed');
    } else if (type != 'down' && _pressed != null) {
      final pressed = _pressed!;
      _pressed = null;
      setNodeState(pressed, 'normal');
      if (type == 'up' && pressed == id)
        _emit({
          'id': 'click:$id',
          'name': 'ui.click',
          'time': _time,
          'loop': 0,
          'nodeId': id,
          'payload': {'nodeId': id},
        });
    }
    return id;
  }

  void recordFrame(double ms) {
    _rendered++;
    _samples.add(ms);
    if (_samples.length > 120) _samples.removeAt(0);
  }

  Map<String, dynamic> profile() {
    final sorted = [..._samples]..sort(), nodes = frames(_time);
    return {
      'measurement':
          'measured CPU composition time; excludes GPU and display scheduling',
      'samples': sorted.length,
      'framesRendered': _rendered,
      'meanFrameMs':
          sorted.fold(0.0, (a, b) => a + b) / math.max(1, sorted.length),
      'p95FrameMs': sorted.isEmpty
          ? 0
          : sorted[(sorted.length * .95).ceil() - 1],
      'targetFrameMs': 1000 / sn(quality['fpsTarget']),
      'estimatedParticles':
          nodes.fold(0, (n, f) => n + (f['points'] as List).length) *
          sn(quality['instances']),
      'estimatedTextureBytes': recipe.width * recipe.height * 4,
      'instances': quality['instances'],
      'quality': {...quality},
    };
  }

  Map<String, dynamic> snapshot([double? time]) => {
    'time': time ?? _time,
    'data': {...data},
    'quality': {...quality},
    'nodes': frames(time ?? _time),
  };
  void dispose() {
    _listeners.clear();
    _transitions.clear();
  }
}

class StudioPainter extends CustomPainter {
  final StudioRuntime runtime;
  final double time;
  final Map<String, ui.Image> images;
  StudioPainter(this.runtime, this.time, this.images);
  @override
  void paint(Canvas canvas, Size size) {
    paintStudio(canvas, runtime, time, images);
  }

  @override
  bool shouldRepaint(covariant StudioPainter oldDelegate) => true;
}

void paintStudio(
  Canvas canvas,
  StudioRuntime runtime,
  double time,
  Map<String, ui.Image> images,
) {
  final clock = Stopwatch()..start(), frames = runtime.frames(time);
  for (
    var instance = 0;
    instance < sn(runtime.quality['instances']).toInt();
    instance++
  ) {
    for (final f in frames) {
      if (f['visible'] != true || f['kind'] == 'group' || sn(f['opacity']) <= 0)
        continue;
      final style = sm(f['style']),
          scale = sn(f['scale']) * sn(style['scale'], 1),
          alpha = sn(f['opacity']) * sn(style['opacity'], 1);
      canvas.save();
      canvas.translate(sn(f['x']), sn(f['y']));
      canvas.rotate(sn(f['rotation']) * math.pi / 180);
      canvas.scale(scale);
      canvas.saveLayer(
        null,
        Paint()..color = Color.fromRGBO(255, 255, 255, sc(alpha)),
      );
      if (f['kind'] == 'particles')
        _particles(canvas, f, images);
      else if (f['kind'] == 'image') {
        final image = images[f['assetId']];
        if (image != null)
          _sprite(
            canvas,
            image,
            f,
            Rect.fromCenter(
              center: Offset.zero,
              width: sn(f['width']),
              height: sn(f['height']),
            ),
          );
      } else if (f['kind'] == 'ui' && f['widget'] != null)
        _widget(canvas, f, images);
      else
        _text(
          canvas,
          f['text'] ?? '',
          sn(f['fontSize']),
          _color(f['color']),
          sn(f['width']),
        );
      canvas.restore();
      canvas.restore();
    }
  }
  clock.stop();
  runtime.recordFrame(clock.elapsedMicroseconds / 1000);
}

void _text(
  Canvas canvas,
  String text,
  double fontSize,
  Color color,
  double width,
) {
  final painter = TextPainter(
    text: TextSpan(
      text: text,
      style: TextStyle(
        fontFamily: 'GameToolSans',
        fontSize: fontSize,
        fontWeight: FontWeight.bold,
        fontVariations: const [ui.FontVariation('wght', 700)],
        color: color,
      ),
    ),
    textDirection: TextDirection.ltr,
    textAlign: TextAlign.center,
  )..layout(maxWidth: math.max(1, width));
  painter.paint(canvas, Offset(-painter.width / 2, -painter.height / 2));
  painter.dispose();
}

void _sprite(
  Canvas canvas,
  ui.Image image,
  Map<String, dynamic> f,
  Rect destination,
) {
  final s = sm(f['sprite']);
  var source = Rect.fromLTWH(
    0,
    0,
    image.width.toDouble(),
    image.height.toDouble(),
  );
  if (s.isNotEmpty) {
    final current = (sn(f['localTime']) * sn(s['fps'])).floor(),
        frame = s['loop'] == true
            ? current % sn(s['frames']).toInt()
            : math.min(sn(s['frames']).toInt() - 1, current),
        w = image.width / sn(s['columns']),
        h = image.height / sn(s['rows']);
    source = Rect.fromLTWH(
      (frame % sn(s['columns'])) * w,
      (frame / sn(s['columns'])).floor() * h,
      w,
      h,
    );
  }
  canvas.drawImageRect(image, source, destination, Paint());
}

void _widget(Canvas c, Map<String, dynamic> f, Map<String, ui.Image> images) {
  final w = sm(f['widget']),
      style = sm(f['style']),
      width = sn(f['width']),
      height = sn(f['height']),
      ratio = sc(sn(f['value']) / math.max(.0001, sn(w['max']))),
      rect = Rect.fromCenter(center: Offset.zero, width: width, height: height),
      round = RRect.fromRectAndRadius(
        rect,
        Radius.circular(math.min(sn(w['radius']), math.min(width, height) / 2)),
      );
  c.drawRRect(
    round,
    Paint()..color = _color(style['background'] ?? w['background']),
  );
  c.drawRRect(
    round,
    Paint()
      ..color = _color(w['border'])
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2,
  );
  if (w['kind'] == 'health-bar') {
    c.save();
    c.clipRRect(round);
    c.drawRect(
      Rect.fromLTWH(-width / 2, -height / 2, width * ratio, height),
      Paint()..color = _color(w['fill']),
    );
    c.restore();
  }
  if (w['kind'] == 'cooldown') {
    final radius = math.max(1.0, math.min(width, height) / 2 - 5);
    c.drawArc(
      Rect.fromCircle(center: Offset.zero, radius: radius),
      -math.pi / 2,
      ratio * math.pi * 2,
      false,
      Paint()
        ..color = _color(w['fill'])
        ..style = PaintingStyle.stroke
        ..strokeWidth = 6,
    );
  }
  if (w['kind'] == 'item-card' && images.containsKey(f['assetId'])) {
    final size = math.min(width * .65, height * .5);
    _sprite(
      c,
      images[f['assetId']]!,
      f,
      Rect.fromLTWH(-size / 2, -height * .4, size, size),
    );
    c.translate(0, height * .3);
  }
  final label =
      ((w['label'] as String?)?.isNotEmpty == true ? w['label'] : f['text'])
          as String;
  _text(
    c,
    label
        .replaceAll('{value}', sn(f['value']).round().toString())
        .replaceAll('{max}', _scalarString(w['max'])),
    math.min(sn(f['fontSize']), height * .45),
    _color(style['color'] ?? f['color']),
    math.max(1, width - 16),
  );
}

void _particles(
  Canvas c,
  Map<String, dynamic> f,
  Map<String, ui.Image> images,
) {
  final p = sm(f['particles']), image = images[f['assetId']];
  for (final point in f['points'] as List) {
    final alpha = sc(sn(point['opacity'])), d = sn(point['size']);
    if (alpha <= 0 || d <= 0) continue;
    final color = point['red'] == null
            ? _color(p['color'] ?? f['color'])
            : Color.fromRGBO(
                sn(point['red']).round(),
                sn(point['green']).round(),
                sn(point['blue']).round(),
                1,
              ),
        paint = Paint()
          ..color = color.withValues(alpha: alpha)
          ..blendMode = p['blend'] == 'add'
              ? BlendMode.plus
              : BlendMode.srcOver;
    c.save();
    if (sn(p['trail']) > 0 && point['tailX'] != null)
      c.drawLine(
        Offset(sn(point['tailX']), sn(point['tailY'])),
        Offset(sn(point['x']), sn(point['y'])),
        paint..strokeWidth = math.max(1, d * .3),
      );
    c.translate(sn(point['x']), sn(point['y']));
    c.rotate(sn(point['rotation']));
    if (sn(p['glow']) > 0)
      c.drawCircle(
        Offset.zero,
        d / 2,
        Paint()
          ..color = color.withValues(alpha: alpha * .45)
          ..maskFilter = MaskFilter.blur(BlurStyle.normal, sn(p['glow'])),
      );
    if (image != null) {
      c.saveLayer(null, Paint()..color = Color.fromRGBO(255, 255, 255, alpha));
      _sprite(c, image, f, Rect.fromLTWH(-d / 2, -d / 2, d, d));
      c.restore();
    } else if (p['shape'] == 'ring') {
      c.drawCircle(
        Offset.zero,
        d / 2,
        paint
          ..style = PaintingStyle.stroke
          ..strokeWidth = math.max(1, d * .035),
      );
    } else if (['star', 'diamond', 'spark'].contains(p['shape'])) {
      final n = p['shape'] == 'star' ? 10 : 4, path = Path();
      for (var i = 0; i < n; i++) {
        final a = i * math.pi * 2 / n - math.pi / 2,
            r = d * (p['shape'] == 'star' && i.isOdd ? .2 : .5),
            x = math.cos(a) * r * (p['shape'] == 'spark' ? 3 : 1),
            y = math.sin(a) * r * (p['shape'] == 'spark' ? .5 : 1);
        if (i == 0) {
          path.moveTo(x, y);
        } else {
          path.lineTo(x, y);
        }
      }
      path.close();
      c.drawPath(path, paint);
    } else if (p['shape'] == 'petal') {
      c.drawOval(
        Rect.fromCenter(center: Offset.zero, width: d * .6, height: d),
        paint,
      );
    } else if (p['shape'] == 'smoke') {
      paint.shader = ui.Gradient.radial(Offset.zero, d / 2, [
        color.withValues(alpha: alpha),
        color.withValues(alpha: 0),
      ]);
      c.drawCircle(Offset.zero, d / 2, paint);
    } else {
      c.drawCircle(Offset.zero, d / 2, paint);
    }
    c.restore();
  }
}
