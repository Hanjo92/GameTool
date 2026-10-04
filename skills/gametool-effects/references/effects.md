# Choosing and composing effects

Read live `capabilities_get` and the relevant tool input schema. This guide describes the v0.4 recipe, not a frozen exhaustive enum catalog.

## Text and decoration

Use a returned text preset as the starting point for a title, cut-in, trailer, or location/time label. Main text is recipe.text; the subtitle is typography.subText. Colors use #RRGGBB. Use local catalog fonts or imported font IDs for portable source packages.

- Set typography.enabled for glyph-level effects, outlines, gradients, shadows, glow, and separate subtitle styling.
- Set motion.enabled for seconds-based stagger, easing, direction and power. Legacy typography.stagger is a ratio, not seconds.
- Frame decoration is separate from glyph strokes and fill panels. Enable frame, choose a returned style, and use animation=draw with duration/textDelay when the border should form before the text. The box/band includes the subtitle; the title frame surrounds the main line.
- Trailer modes are under sequence; they can split pages and schedule punctuation, lines, and subtitle delays. Actual duration may exceed enter+hold+exit. Do not assume a universal finished time of 0.6 seconds. Inspect the preview timeline or evaluate the generated recipe's duration using its supplied runtime API.
- For textless effects set textVisible=false; keep the required nonempty text field. Disabling text visibility does not disable frame/typography timing, so explicitly choose a simple timing recipe for a standalone particle effect.

## Background and images

Use asset_import or the helper's import command, then use returned UUIDs. A main background is background.assetId; a transition uses ordered background.assetIds (max 8). Enable background and choose a motion and filter from capabilities. `profile=reference` selects the expanded reference behavior; legacy is retained for old projects.

Crossfade/hard-cut/wipe can transition between images. `transitionSource=original-filter` uses a single image and its filtered version. `fadeDirection` determines the image-to-color or color-to-image order. The separate image layer is positioned around the canvas center; its rotation is degrees.

`backdrop` is a rendered overlay included in generated code. The GUI's checkerboard/black/white/photo preview background is just a viewing aid. Do not add a permanent black backdrop merely to inspect additive glow on a dark surface.

## Advanced particles

`particleStyles` contains effect IDs/settings (rain, fire, smoke, embers, petals, heal, magic, vortex, fireworks, shockwave in v0.4). These IDs are **not** valid values of `particles.preset`, whose legacy enum remains snow/sparks/confetti. Enable particles and advanced, and copy a selected style's settings into a complete particle recipe.

For a new project, its freshly returned particles object is the clean base. When replacing an existing particle style, remove the old style's settings rather than stacking them: reset advanced fields from capabilities.particleFields using each field's value, and start the base fields from these v0.4 defaults (check the live schema if the version changes):

```js
const base = {
  enabled: true, preset: "snow", emission: "continuous", seed: 42,
  count: 80, size: 4, speed: 90, lifetime: 3, gravity: 20, spread: 180,
  x: 0.5, y: 0.5, color: "#c6fa73"
};
const style = capabilities.particleStyles.find(s => s.id === requestedStyleId);
if (!style) throw new Error("Unsupported particle style");
const advancedDefaults = Object.fromEntries(
  capabilities.particleFields.map(field => [field.key, field.value])
);
const particles = {
  ...base, ...advancedDefaults, ...style.settings,
  enabled: true, advanced: true,
  // Apply explicitly requested seed, count, colors or position here.
};
const nextRecipe = { ...project.recipe, particles };
```

Keep other layers unless the user requested a standalone effect. This reset matters: switching from fireworks to rain without clearing burst emission, or from vortex to fire without clearing the orbit path, produces a different effect.

- Shapes: circle/star/spark/ring/diamond/petal/smoke; choose shapes for visual character, not only count/color.
- Emitters: point/box/circle/ring. x/y are viewport ratios; areaWidth/areaHeight are viewport fractions; radius is a fraction of the shorter side.
- Paths: ballistic uses direction/spread/speed/gravity/drag; orbit and vortex use radius/orbitSpeed instead. Direction 0° points right and 90° points down. Wind/turbulence affect all paths.
- Life: sizeEnd is a multiplier; colorEnd is the end color. fadeIn/fadeOut are fractions of lifetime. Size/speed/lifetime variations prevent identical particles.
- Light: glow plus blend=add works for fire/magic/sparks; normal blending suits smoke/petals. trail is an analytic head-to-past-position segment in seconds, not a simulated trail buffer.
- Emission: delay applies before emission. prewarm=false fills continuous emitters gradually. For burst, burstInterval=0 means once; positive intervals replace the burst periodically. The same seed repeats the same pattern. sync controls overall timeline fading; global playback duration/loop still applies.

For a one-shot hit or explosion set loop=false and make the hold/exit interval cover delay+lifetime. For continuous ambience use looping and review the loop boundary. Avoid interpreting burst opacity=0 after its lifetime as a rendering failure. Check start, peak, tail, and a reverse seek. One emitter supports up to 500 particles; fewer larger translucent/glowing particles can still be expensive. Verify the chosen composition in the target runtime instead of assuming count alone predicts performance.

## Reuse and delivery

Use preset_save only after saving the intended recipe. Presets and asset UUIDs belong to the local workspace. A preset JSON is not a portable asset bundle; use the generated package to carry source, images, fonts and licenses to another game.

Read the artifact manifest and generated README before integration:

- Flutter: copy the generated lib runtime sources except the preview main.dart; retain pubspec assets/fonts. The parent owns/disposes EffectController and loaded images; TextEffect owns its ticker.
- Phaser: use SceneEffect with the host Scene and loaded images; the effect owns its update/shutdown binding and texture. Dispose it when removing it early.
- Three.js: add effect.object to the host scene; call update(deltaSeconds) from the host render loop and dispose owned resources. This is a 2D HUD/plane, not volumetric 3D particles.

Generated examples are self-contained with their documented SDK dependencies. Do not claim a target is validated from another target's success. Flutter Web validation is not iOS/Android device testing or signed delivery.
