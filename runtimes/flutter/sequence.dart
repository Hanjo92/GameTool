import 'dart:math' as math;
import 'motion.dart';
import 'options.dart';
import 'typography.dart';

class TextPage {
  final String text;
  final double start,
      textStart,
      mainEnd,
      inEnd,
      outStart,
      end,
      subStart,
      soloEnd,
      scrollDuration;
  final List<double> starts;
  final List<int> rows, columns;
  const TextPage(
    this.text,
    this.start,
    this.textStart,
    this.mainEnd,
    this.inEnd,
    this.outStart,
    this.end,
    this.starts,
    this.rows,
    this.columns,
    this.subStart,
    this.soloEnd,
    this.scrollDuration,
  );
}

class TextTimeline {
  final List<TextPage> pages;
  final double duration;
  const TextTimeline(this.pages, this.duration);
}

final _cache = Expando<TextTimeline>();
bool precise(EffectRecipe r) =>
    r.motion['enabled'] == true ||
    r.sequence['mode'] == 'trailer' ||
    r.typography['departure'] == 'none';
TextTimeline timelineFor(EffectRecipe r) {
  final cached = _cache[r];
  if (cached != null) return cached;
  final m = {...defaultMotion, ...r.motion},
      q = {...defaultSequence, ...r.sequence},
      l = {...defaultLayout, ...r.layout};
  final trailer = q['mode'] == 'trailer';
  final raw = trailer && q['pageSplit'] == true && q['reveal'] != 'scroll'
      ? r.text.split(RegExp(r'\n\s*\n'))
      : [r.text];
  final pages = <TextPage>[];
  var cursor = (m['startDelay'] as num).toDouble();
  for (final source in raw) {
    final wrap = (q['wrapChars'] as num).toInt();
    final text = source
        .split('\n')
        .expand((line) {
          final chars = line.runes.map(String.fromCharCode).toList();
          return wrap > 0
              ? List.generate(
                  math.max(1, (chars.length / wrap).ceil()),
                  (i) => chars.skip(i * wrap).take(wrap).join(),
                )
              : [line];
        })
        .join('\n');
    final chars = text.runes.map(String.fromCharCode).toList(),
        lead = r.frame['enabled'] == true
            ? (r.frame['textDelay'] as num).toDouble()
            : 0.0,
        textStart = cursor + lead;
    final starts = <double>[], rows = <int>[], columns = <int>[];
    var row = 0, col = 0;
    var tick = 0.0;
    final lineLengths = text
            .split('\n')
            .map((line) => line.runes.length)
            .toList(),
        visible = chars.where((ch) => ch != '\n').length;
    for (var i = 0; i < chars.length; i++) {
      final ch = chars[i];
      rows.add(row);
      columns.add(col);
      double delay = i * (m['inStagger'] as num).toDouble();
      if (trailer) {
        if (q['reveal'] == 'char') {
          delay = tick;
        } else if (q['reveal'] == 'line') {
          delay = row * (q['lineInterval'] as num).toDouble();
        } else if (q['reveal'] == 'sweep') {
          delay =
              row * (q['lineInterval'] as num) +
              col /
                  math.max(1, lineLengths[row] - 1) *
                  (q['sweepDuration'] as num);
        } else {
          delay = 0;
        }
      } else {
        final order = r.typography['order'] ?? 'forward';
        double rank = i.toDouble();
        if (order == 'reverse') rank = (chars.length - 1 - i).toDouble();
        if (order == 'center') rank = (i - (chars.length - 1) / 2).abs();
        if (order == 'edges')
          rank = (chars.length - 1) / 2 - (i - (chars.length - 1) / 2).abs();
        if (order == 'random')
          rank =
              ((i * 7919 + (r.typography['seed'] ?? 42) * 1013) %
                      math.max(1, chars.length))
                  .toDouble();
        delay =
            [
              'slam',
              'approach',
              'recede',
              'wipe',
              'unfold',
              'glitch',
              'flash',
            ].contains(r.typography['entrance'])
            ? 0
            : rank * (m['inStagger'] as num);
      }
      starts.add(textStart + delay);
      if (ch == '\n') {
        row++;
        col = 0;
        tick += (q['linePause'] as num);
      } else {
        col++;
        tick += 1 / (q['cps'] as num);
        if (RegExp(r'[、。，．,.!?！？:：;；]').hasMatch(ch))
          tick += (q['punctPause'] as num);
      }
    }
    final glyphDuration = trailer
        ? (q['glyphDuration'] as num).toDouble()
        : r.enter;
    var mainEnd = starts.fold(
      textStart,
      (double a, double s) => math.max(a, s + glyphDuration),
    );
    final soloEnd =
        textStart + visible / (q['cps'] as num) + (q['soloPause'] as num);
    var scrollDuration = 0.0;
    if (trailer && q['reveal'] == 'solo') {
      mainEnd = soloEnd + r.enter;
      starts.fillRange(0, starts.length, soloEnd);
    }
    if (trailer && q['reveal'] == 'spread')
      mainEnd =
          textStart + (q['spreadHold'] as num) + (q['spreadDuration'] as num);
    if (trailer && q['reveal'] == 'scroll') {
      final extent =
          (r.typography['vertical'] == true ? r.width : r.height) +
          lineLengths.length * r.fontSize * (l['lineHeight'] as num);
      scrollDuration = extent / (q['scrollSpeed'] as num);
      mainEnd = textStart + scrollDuration;
    }
    final subStart = math.max(textStart, mainEnd + (m['subDelay'] as num));
    final inEnd = trailer || (r.typography['subText'] ?? '') == ''
        ? mainEnd
        : math.max(mainEnd, subStart + r.enter);
    final outStart = inEnd + (trailer && q['reveal'] == 'scroll' ? 0 : r.hold);
    final outDuration =
        m['outEnabled'] == true && r.typography['departure'] != 'none'
        ? r.exit + math.max(0, visible - 1) * (m['outStagger'] as num)
        : 0.0;
    final end =
        outStart +
        math.max(
          outDuration,
          r.frame['enabled'] == true && m['outEnabled'] == true
              ? (r.frame['duration'] as num).toDouble()
              : 0.0,
        );
    pages.add(
      TextPage(
        text,
        cursor,
        textStart,
        mainEnd,
        inEnd,
        outStart,
        end,
        starts,
        rows,
        columns,
        subStart,
        soloEnd,
        scrollDuration,
      ),
    );
    cursor = end + (q['pageGap'] as num);
  }
  final result = TextTimeline(
    pages,
    math.max(.001, pages.last.end + (m['endDelay'] as num)),
  );
  _cache[r] = result;
  return result;
}

({TextPage page, int index, double time, bool active}) pageAt(
  EffectRecipe r,
  double seconds,
) {
  final timeline = timelineFor(r),
      t =
          r.loop &&
              (r.loopCount == 0 || seconds < timeline.duration * r.loopCount)
          ? seconds % timeline.duration
          : math.min(seconds, timeline.duration);
  var index = timeline.pages.indexWhere((p) => t >= p.start && t <= p.end);
  final keep =
      r.motion['outEnabled'] == false || r.typography['departure'] == 'none';
  if (index < 0 && keep && t >= timeline.pages.last.start)
    index = timeline.pages.length - 1;
  return (
    page: timeline.pages[math.max(0, index)],
    index: math.max(0, index),
    time: t,
    active: index >= 0,
  );
}

String currentText(EffectRecipe r, double seconds) =>
    precise(r) ? pageAt(r, seconds).page.text : r.text;
double easing(String name, double input) {
  final p = input.clamp(0.0, 1.0);
  if (p == 0 || p == 1) return p;
  if (name == 'linear') return p;
  if (name == 'in') return p * p * p;
  if (name == 'smooth')
    return p < .5 ? 4 * p * p * p : 1 - math.pow(-2 * p + 2, 3) / 2;
  if (name == 'strong') return p == 1 ? 1 : 1 - math.pow(2, -10 * p).toDouble();
  if (name == 'back') {
    final q = p - 1;
    return 1 + 2.70158 * q * q * q + 1.70158 * q * q;
  }
  if (name == 'elastic')
    return p == 0 || p == 1
        ? p
        : 1 - math.pow(2, -10 * p) * math.cos(p * math.pi * 2 / .3);
  if (name == 'bounce') {
    var q = p;
    const n = 7.5625, d = 2.75;
    if (q < 1 / d) return n * q * q;
    if (q < 2 / d) {
      q -= 1.5 / d;
      return n * q * q + .75;
    }
    if (q < 2.5 / d) {
      q -= 2.25 / d;
      return n * q * q + .9375;
    }
    q -= 2.625 / d;
    return n * q * q + .984375;
  }
  return 1 - math.pow(1 - p, 3).toDouble();
}

final _subtitleRecipes = Expando<EffectRecipe>();
Map<String, double> subtitleAt(
  EffectRecipe r,
  double seconds, [
  int index = 0,
  int count = 1,
]) {
  final m = {...defaultMotion, ...r.motion}, p = pageAt(r, seconds);
  var sub = _subtitleRecipes[r];
  if (sub == null) {
    final c = {...defaultTypography, ...r.typography};
    sub = EffectRecipe(
      text: r.text,
      color: r.color,
      effect: r.effect,
      fontSize: r.fontSize,
      width: r.width,
      height: r.height,
      enter: r.enter,
      hold: r.hold,
      exit: r.exit,
      distance: r.distance,
      loop: false,
      sequence: defaultSequence,
      motion: {...m, 'enabled': false},
      typography: {
        ...c,
        'subText': '',
        'entrance': m['subMotion'] == 'same' ? c['entrance'] : m['subMotion'],
        'departure': c['departure'] == 'none' ? 'fade' : c['departure'],
        'stagger': 0,
      },
    );
    _subtitleRecipes[r] = sub;
  }
  final leaving =
      p.time >= p.page.outStart &&
      m['outEnabled'] == true &&
      r.typography['departure'] != 'none';
  final time = leaving
      ? r.enter + r.hold + p.time - p.page.outStart
      : math.max(
          0.0,
          math.min(
            r.enter + r.hold - .000001,
            math.max(0.0, p.time - p.page.subStart),
          ),
        );
  final s = glyphAt(sub, time, index, count);
  if (!p.active || p.time < p.page.subStart) s['opacity'] = 0;
  return {...s, 'spacing': 0};
}
