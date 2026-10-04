import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'motion.dart';
import 'layers.dart';

/// Embeddable text effect. Parent owns the controller; this widget owns one ticker.
class TextEffect extends StatefulWidget {
  final EffectController controller;
  final Map<String, ui.Image> images;
  final String? text;
  final Color? color;
  const TextEffect({
    super.key,
    required this.controller,
    this.images = const {},
    this.text,
    this.color,
  });

  @override
  State<TextEffect> createState() => _TextEffectState();
}

class _TextEffectState extends State<TextEffect>
    with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  Duration _previous = Duration.zero;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((elapsed) {
      final delta = (elapsed - _previous).inMicroseconds / 1000000;
      _previous = elapsed;
      widget.controller.advance(delta);
    })..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final original = widget.controller.recipe;
    final r = widget.text == null && widget.color == null
        ? original
        : original.withText(
            widget.text,
            widget.color == null
                ? null
                : '#${(widget.color!.toARGB32() & 0xffffff).toRadixString(16).padLeft(6, '0')}',
          );
    return FittedBox(
      fit: BoxFit.contain,
      child: SizedBox(
        width: r.width,
        height: r.height,
        child: ClipRect(
          child: AnimatedBuilder(
            animation: widget.controller,
            builder: (context, child) {
              final s = widget.controller.state;
              return Stack(
                fit: StackFit.expand,
                children: [
                  CustomPaint(
                    painter: ScenePainter(
                      r,
                      widget.controller.time,
                      widget.images,
                    ),
                  ),
                  if (r.textVisible && r.typography['enabled'] != true)
                    Center(
                      child: Transform.translate(
                        offset: Offset(0, s['y']!),
                        child: Transform.scale(
                          scale: s['scale']!,
                          child: Opacity(
                            opacity: s['opacity']!,
                            child: Text(
                              widget.text ?? r.text,
                              textAlign: TextAlign.center,
                              softWrap: false,
                              style: TextStyle(
                                fontFamily: 'GameToolSans',
                                fontSize: r.fontSize,
                                fontWeight: FontWeight.bold,
                                fontVariations: const [
                                  ui.FontVariation('wght', 700),
                                ],
                                color:
                                    widget.color ??
                                    Color(
                                      int.parse(
                                        'ff${r.color.substring(1)}',
                                        radix: 16,
                                      ),
                                    ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
