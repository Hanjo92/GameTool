# Studio authoring and delivery

Start from `studio-hud`, `studio-impact`, or `studio-reward` returned by presets_list and inspect the complete saved recipe. Preserve legacy settings and optional studio fields when editing. The live project_update schema/capabilities define limits; installed app DTOs are in runtimes/shared/studio-types.ts.

Nodes have stable unique IDs, optional group parentId, center-based logical pixel positions, degree rotation, seconds start/duration and local keyframes. Parent references must point to groups without cycles. Particles nodes need their own particles object; UI nodes need widget; images need imported assetId. Duplicate IDs and keys outside node duration fail validation. Arrays in patches replace entirely, so preserve unmodified nodes/bindings/events.

Bindings map scalar data keys to node text/value/position/opacity/visible/state/color. Hosts call setData and setNodeState; onEvent receives named payloads for host-owned audio/camera/game behavior. Seek does not emit events. Multiple particle nodes may use image sprite sheets, lifetime curves and x/y data following. Quality limits should be retained when producing variants.

## Compare and batch

Use studio_variants with projectId, expectedRevision, variants:[{name,patch}], save:false for validated recipes and changes. save:true writes independent projects atomically, after validating every variant and referenced asset. A failed/stale request must not be retried blindly; reload first. recipe_diff compares a proposed whole recipe with the saved revision.

studio_compare returns numerical samples, including counts and only the first three legacy glyphs/particles and particle coordinates per Studio node. For actual target rendering use studio_comparison_start with variants, target and timeSeconds, then poll job_get and inspect comparisons[].previewUrl/imagePath. Do not describe numeric samples as screenshot evidence.

## Integrate into a game

Only perform integration when the user's task covers that game project. integration_roots lists roots explicitly allowed by the service's --integration-root startup option; empty means integration was not configured. The MCP autostart does not grant game-folder access. Existing authorization can cover the apply; no extra confirmation is required merely because a plan exists.

Generate/validate the desired artifact, request integration_plan with artifactId, rootId and effectId (lowercase alphanumeric, underscore/hyphen, 1–64 characters), and inspect files/warnings. integration_apply takes the returned planId and expectedHash. Changed or edited destinations fail closed: resolve the conflict rather than bypassing ownership checks. Files live under gametool-effects/<effectId>/<target>; read its INTEGRATION.md. Host package.json/pubspec.yaml are preserved, so add dependencies/imports only within authorized integration work. Plans expire on service restart.

Flutter includes an optional adapters/flame package; ordinary Flutter does not need Flame. Phaser exposes SceneEffect and follows host coordinates through setData. Three uses a planar composition in screen/world mode with optional camera-facing billboard; it is not volumetric simulation.

## Profile

performance_start takes artifactId and optional frames (30–600), then job_get returns profileReport. This launches the actual generated browser runtime, warms up and measures frame intervals and synchronous submission time. Report analytic texture/particle budgets separately from timing. Desktop Chromium evidence does not prove mobile/native GPU performance. Quality instances are a bounded stress workload, not automatic game object pooling.
