import 'sequence.dart';
import 'studio.dart';
import 'options.dart';
import 'dart:math' as math;
import 'package:flutter/foundation.dart';

/// Absolute-time animation in logical pixels. No GameTool service dependency.
class EffectRecipe {
  final String text, color, effect;
  final double fontSize, width, height, enter, hold, exit, distance;
  final bool loop, textVisible;
  final int loopCount;
  final Map<String, dynamic> background,
      image,
      particles,
      typography,
      frame,
      layout,
      motion,
      sequence,
      backdrop,
      studio;
  const EffectRecipe({
    this.studio = const {},
    this.textVisible = true,
    this.loopCount = 0,
    this.typography = const {},
    this.frame = const {},
    this.layout = const {},
    this.motion = const {},
    this.sequence = const {},
    this.backdrop = const {},
    this.background = const {},
    this.image = const {},
    this.particles = const {},
    required this.text,
    required this.color,
    required this.effect,
    required this.fontSize,
    required this.width,
    required this.height,
    required this.enter,
    required this.hold,
    required this.exit,
    required this.distance,
    required this.loop,
  });
  EffectRecipe withText(String? newText, String? newColor) => EffectRecipe(
    text: newText ?? text,
    color: newColor ?? color,
    effect: effect,
    fontSize: fontSize,
    width: width,
    height: height,
    enter: enter,
    hold: hold,
    exit: exit,
    distance: distance,
    loop: loop,
    loopCount: loopCount,
    textVisible: textVisible,
    background: background,
    image: image,
    particles: particles,
    typography: typography,
    frame: frame,
    layout: layout,
    motion: motion,
    sequence: sequence,
    backdrop: backdrop,
    studio: studio,
  );
  double get legacyDuration =>
      precise(this) ? timelineFor(this).duration : enter + hold + exit;
  double get duration => math.max(
    legacyDuration,
    studio['enabled'] == true ? sn(studio['duration']) : 0,
  );
}

Map<String, double> evaluate(EffectRecipe r, double seconds) {
  if (!seconds.isFinite || seconds < 0) throw ArgumentError('Invalid time');
  final t = r.loop && (r.loopCount == 0 || seconds < r.duration * r.loopCount)
      ? seconds % r.duration
      : math.min(seconds, r.duration);
  double a = r.enter > 0 && t < r.enter
      ? t / r.enter
      : t < r.enter + r.hold
      ? 1.0
      : r.exit > 0
      ? math.max(0.0, (r.legacyDuration - t) / r.exit)
      : 0.0;
  if (precise(r)) {
    final p = pageAt(r, seconds),
        page = p.page,
        m = {...defaultMotion, ...r.motion};
    a = !p.active
        ? 0
        : t < page.inEnd
        ? ((t - page.textStart) / math.max(.001, page.inEnd - page.textStart))
              .clamp(0.0, 1.0)
        : m['outEnabled'] != true || r.typography['departure'] == 'none'
        ? 1
        : math.max(
            0.0,
            1 - (t - page.outStart) / math.max(.001, page.end - page.outStart),
          );
  }
  final eased = 1 - math.pow(1 - a, 3).toDouble();
  return {
    'opacity': a,
    'y': r.effect == 'slide' ? (1 - eased) * r.distance : 0,
    'scale': r.effect == 'pop' ? 0.72 + 0.28 * eased : 1,
    'time': t,
  };
}

class EffectController extends ChangeNotifier {
  final EffectRecipe recipe;
  double time = 0, _speed = 1;
  bool playing = false;
  late final StudioRuntime studio;
  EffectController(this.recipe) {
    studio = StudioRuntime(recipe);
  }
  void setData(Map<String, dynamic> data) {
    studio.setData(data);
    notifyListeners();
  }

  void setNodeState(String id, String state) {
    studio.setNodeState(id, state);
    notifyListeners();
  }

  void setQuality(Map<String, dynamic> quality) {
    studio.setQuality(quality);
    notifyListeners();
  }

  VoidCallback onEvent(void Function(Map<String, dynamic>) listener) =>
      studio.onEvent(listener);
  String? hitTest(double x, double y) => studio.hitTest(x, y);
  String? pointer(String type, double x, double y) {
    final id = studio.pointer(type, x, y);
    notifyListeners();
    return id;
  }

  Map<String, dynamic> profile() => studio.profile();
  @override
  void dispose() {
    studio.dispose();
    super.dispose();
  }

  double get speed => _speed;
  set speed(double value) {
    if (!value.isFinite || value <= 0 || value > 8)
      throw ArgumentError('Invalid speed');
    _speed = value;
  }

  Map<String, double> get state => evaluate(recipe, time);
  void seek(double seconds) {
    evaluate(recipe, seconds);
    final previous = time;
    time = seconds;
    studio.transport('seek', previous, time);
    notifyListeners();
  }

  void play() {
    playing = true;
    notifyListeners();
  }

  void pause() {
    playing = false;
    notifyListeners();
  }

  void restart() {
    final previous = time;
    time = 0;
    studio.transport('restart', previous, time);
    play();
  }

  void advance(double deltaSeconds) {
    if (!deltaSeconds.isFinite || deltaSeconds < 0)
      throw ArgumentError('Invalid delta');
    final transitioning = studio.advanceUI(deltaSeconds);
    if (!playing) {
      if (transitioning) notifyListeners();
      return;
    }
    final previous = time;
    time += deltaSeconds * speed;
    final end = recipe.duration * (recipe.loop ? recipe.loopCount : 1);
    if ((!recipe.loop || recipe.loopCount > 0) && time >= end) {
      time = end;
      playing = false;
    }
    studio.transport('advance', previous, time);
    notifyListeners();
  }
}

double randomAt(int seed, int index, int channel) {
  var n = ((seed + index * 1013 + channel * 7919) % 2147483646) + 1;
  n = (n * ((n % 65521) + 1) + 12345) % 2147483647;
  n = (n * ((n % 65521) + 1) + 12345) % 2147483647;
  return n / 2147483647;
}

const defaultFrame = <String, dynamic>{
  'enabled': false,
  'style': 'title',
  'animation': 'draw',
  'duration': .6,
  'textDelay': .3,
  'color': '#ffffff',
  'width': 3,
  'fillColor': '#000000',
  'fillOpacity': 0,
  'padding': .28,
  'extend': 12,
  'inset': 32,
  'outline': false,
  'softness': 0.5,
  'sideFade': 0.3,
  'radius': 0.2,
  'tapeColor': "#f5c400",
  'tapeStripe': "#151515",
  'tapeSize': 40,
  'tapeSpeed': 90,
  'tapeBlink': 0.5,
};
Map<String, double> frameAt(EffectRecipe r, double seconds) {
  final c = {...defaultFrame, ...r.frame};
  var t = evaluate(r, seconds)['time']!;
  var outStart = r.enter + r.hold, exit = r.exit;
  if (precise(r)) {
    final p = pageAt(r, seconds);
    if (!p.active) return {'progress': 0, 'opacity': 0};
    t -= p.page.start;
    outStart = p.page.outStart - p.page.start;
    exit = p.page.end - p.page.outStart;
    if (r.motion['outEnabled'] == false || r.typography['departure'] == 'none')
      outStart = double.infinity;
  }
  if (c['enabled'] != true || !r.textVisible || t >= r.duration)
    return {'progress': 0, 'opacity': 0};
  final d = (c['duration'] as num).toDouble();
  final incoming = d > 0 ? math.min(1.0, t / d) : 1.0;
  final outgoing = t < outStart
      ? 0.0
      : exit > 0
      ? math.min(1.0, (t - outStart) / math.min(d > 0 ? d : exit, exit))
      : 1.0;
  final a = (1 - math.pow(1 - incoming, 3)) * (1 - math.pow(outgoing, 3));
  if (c['animation'] == 'none') return {'progress': 1, 'opacity': 1};
  return {
    'progress': c['animation'] == 'draw' ? a.toDouble() : 1,
    'opacity': c['animation'] == 'draw' ? math.min(1.0, a * 4) : a.toDouble(),
  };
}

List<List<double>> traceRectangle(
  double x0,
  double y0,
  double x1,
  double y1,
  double progress,
  bool vertical,
) {
  final points = vertical
      ? [
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
          [x1, y0],
        ]
      : [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
          [x0, y0],
        ];
  var remaining = progress.clamp(0.0, 1.0) * 2 * (x1 - x0 + y1 - y0);
  final result = [points[0]];
  for (var i = 1; i < points.length && remaining > 0; i++) {
    final a = points[i - 1],
        b = points[i],
        length = (b[0] - a[0]).abs() + (b[1] - a[1]).abs(),
        f = math.min(1.0, remaining / length);
    result.add([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    remaining -= length;
  }
  return result;
}
