import 'dart:ui' as ui;
import 'package:flame/components.dart';
import 'package:flutter/painting.dart';
import 'package:gametool_effect/motion.dart';
import 'package:gametool_effect/layers.dart';
import 'package:gametool_effect/studio.dart';

/// Optional Flame adapter. The host owns controller/images and advances only this component.
/// This component paints legacy text, procedural layers and Studio overlays.
class GameToolEffectComponent extends PositionComponent {
  final EffectController controller;
  final Map<String, ui.Image> images;
  GameToolEffectComponent({
    required this.controller,
    this.images = const {},
    super.position,
    super.anchor,
    super.priority,
  }) : super(size: Vector2(controller.recipe.width, controller.recipe.height));
  @override
  void update(double dt) {
    super.update(dt);
    controller.advance(dt);
  }

  @override
  void render(ui.Canvas canvas) {
    super.render(canvas);
    ScenePainter(
      controller.recipe,
      controller.time,
      images,
    ).paint(canvas, ui.Size(size.x, size.y));
    final r = controller.recipe;
    if (r.textVisible && r.typography['enabled'] != true) {
      final state = controller.state;
      canvas.save();
      canvas.translate(r.width / 2, r.height / 2 + state['y']!);
      canvas.scale(state['scale']!);
      final text = TextPainter(
        text: TextSpan(
          text: r.text,
          style: TextStyle(
            fontFamily: 'GameToolSans',
            fontSize: r.fontSize,
            fontWeight: FontWeight.bold,
            fontVariations: const [ui.FontVariation('wght', 700)],
            color: Color(
              int.parse('ff${r.color.substring(1)}', radix: 16),
            ).withValues(alpha: state['opacity']!),
          ),
        ),
        textDirection: TextDirection.ltr,
        textAlign: TextAlign.center,
      )..layout();
      text.paint(canvas, Offset(-text.width / 2, -text.height / 2));
      text.dispose();
      canvas.restore();
    }
    paintStudio(canvas, controller.studio, controller.time, images);
  }

  String? pointer(String type, Vector2 localPosition) =>
      controller.pointer(type, localPosition.x, localPosition.y);
}
