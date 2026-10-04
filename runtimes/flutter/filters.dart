import 'dart:async';
import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' as ui;

double _noise(int index) {
  var n = ((71 + index * 1013) % 2147483646) + 1;
  n = (n * ((n % 65521) + 1) + 12345) % 2147483647;
  n = (n * ((n % 65521) + 1) + 12345) % 2147483647;
  return n / 2147483647;
}

const _grades = <String, List<double>>{
  'morning': [1.08, 1.01, .94, 8],
  'day': [1.05, 1.05, 1.02, 5],
  'evening': [1.18, .86, .66, 0],
  'night': [.45, .55, .85, 0],
  'midnight': [.2, .27, .45, 0],
  'moonlight': [.55, .7, 1.05, 0],
  'horror': [.65, .78, .62, -14],
  'fog': [.65, .7, .75, 65],
  'cyber': [.9, .6, 1.25, 5],
  'underwater': [.5, .9, 1.04, 0],
  'dream': [1.05, .94, 1.08, 12],
  'old-photo': [.9, .85, .7, 12],
};

/// Processes RGBA bytes once; original decoded images remain owned by the caller.
Uint8List filterPixels(Uint8List source, int w, int h, String filter) {
  final out = Uint8List.fromList(source);
  double sample(int x, int y, int c) =>
      source[(y.clamp(0, h - 1) * w + x.clamp(0, w - 1)) * 4 + c].toDouble();
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      final i = (y * w + x) * 4;
      double r = source[i].toDouble(),
          g = source[i + 1].toDouble(),
          b = source[i + 2].toDouble();
      final l = .299 * r + .587 * g + .114 * b;
      if (filter == 'grayscale') {
        r = l;
        g = l;
        b = l;
      }
      if (filter == 'sepia' || filter == 'old-photo') {
        r = .393 * source[i] + .769 * g + .189 * b;
        g = .349 * source[i] + .686 * source[i + 1] + .168 * b;
        b = .272 * source[i] + .534 * source[i + 1] + .131 * b;
      }
      if (filter == 'posterize') {
        r = (r / 64).round() * 64.0;
        g = (g / 64).round() * 64.0;
        b = (b / 64).round() * 64.0;
      }
      if (filter == 'contrast') {
        r = (r - 128) * 1.35 + 128;
        g = (g - 128) * 1.35 + 128;
        b = (b - 128) * 1.35 + 128;
      }
      if (['soft-focus', 'dream', 'sharp'].contains(filter)) {
        final blur = List.generate(
          3,
          (c) =>
              (sample(x - 2, y, c) +
                  sample(x + 2, y, c) +
                  sample(x, y - 2, c) +
                  sample(x, y + 2, c) +
                  sample(x, y, c) * 4) /
              8,
        );
        if (filter == 'sharp') {
          r = r * 2 - blur[0];
          g = g * 2 - blur[1];
          b = b * 2 - blur[2];
        } else {
          r = blur[0] * 1.1 + 8;
          g = blur[1] * 1.1 + 8;
          b = blur[2] * 1.1 + 12;
        }
      }
      if (['edges', 'white-edges', 'ink'].contains(filter)) {
        var edge = 0.0;
        for (var c = 0; c < 3; c++) {
          edge +=
              (sample(x + 1, y, c) - sample(x - 1, y, c)).abs() +
              (sample(x, y + 1, c) - sample(x, y - 1, c)).abs();
        }
        edge = math.min(255.0, edge);
        r = filter == 'white-edges'
            ? edge
            : filter == 'ink'
            ? math.max(0.0, l * 1.15 - edge)
            : 255 - edge;
        g = r;
        b = r;
      }
      if (filter == 'pixelate') {
        final px = x ~/ 8 * 8, py = y ~/ 8 * 8;
        r = sample(px, py, 0);
        g = sample(px, py, 1);
        b = sample(px, py, 2);
      }
      if (filter == 'noise' || filter == 'old-photo') {
        final n = (_noise(y * w + x) - .5) * 36;
        r += n;
        g += n;
        b += n;
      }
      if (filter == 'chromatic' || filter == 'crt') {
        r = sample(x - 3, y, 0);
        b = sample(x + 3, y, 2);
        if (filter == 'crt' && y % 4 < 2) {
          r *= .7;
          g *= .7;
          b *= .7;
        }
      }
      if (filter == 'vignette' || filter == 'horror') {
        final d = (math.pow(x / w - .5, 2) + math.pow(y / h - .5, 2)) * 2,
            k = math.max(.15, 1 - d * .95);
        r *= k;
        g *= k;
        b *= k;
      }
      final grade = _grades[filter];
      if (grade != null) {
        r = r * grade[0] + grade[3];
        g = g * grade[1] + grade[3];
        b = b * grade[2] + grade[3];
      }
      out[i] = r.round().clamp(0, 255);
      out[i + 1] = g.round().clamp(0, 255);
      out[i + 2] = b.round().clamp(0, 255);
    }
  }
  return out;
}

Future<ui.Image> filterImage(ui.Image image, String filter) async {
  final data = await image.toByteData(
    format: ui.ImageByteFormat.rawStraightRgba,
  );
  if (data == null) throw StateError('Image pixels unavailable');
  final pixels = filterPixels(
    data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
    image.width,
    image.height,
    filter,
  );
  final result = Completer<ui.Image>();
  ui.decodeImageFromPixels(
    pixels,
    image.width,
    image.height,
    ui.PixelFormat.rgba8888,
    result.complete,
  );
  return result.future;
}
