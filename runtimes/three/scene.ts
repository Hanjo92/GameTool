import { StudioRuntime, type StudioSignal } from "../shared/studio.js";
import { paintStudio } from "../shared/studio-painter.js";
import type {
  StudioData,
  StudioQuality,
  StudioWidgetState,
} from "../shared/studio-types.js";
import { WorldParticleBatches } from "./world-particles.js";
import * as THREE from "three";
import { TextEffect } from "./effect.js";
import { paintLayers } from "../shared/layers.js";
import { sceneSnapshot, type Recipe } from "../shared/motion.js";
/** Embeddable screen-space group. Host owns the camera, renderer and frame loop. */
export class SceneEffect {
  readonly object = new THREE.Group();
  readonly text: TextEffect;
  readonly playback;
  readonly studio: StudioRuntime;
  private stopTransport: () => void;
  private overlayTexture: THREE.CanvasTexture;
  private overlay: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private overlayContext: CanvasRenderingContext2D;
  private camera?: THREE.Camera;
  private particleBatches?: WorldParticleBatches;
  private texture: THREE.CanvasTexture;
  private plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ctx: CanvasRenderingContext2D;
  private disposed = false;
  private lastTime = NaN;
  constructor(
    recipe: Recipe,
    private images: Map<string, HTMLImageElement | HTMLCanvasElement>,
    options: { particleRenderer?: "canvas" | "instanced" } = {},
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = recipe.width;
    canvas.height = recipe.height;
    this.ctx = canvas.getContext("2d")!;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.plane = new THREE.Mesh(
      new THREE.PlaneGeometry(recipe.width, recipe.height),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.text = new TextEffect(structuredClone(recipe));
    this.playback = this.text.playback;
    this.studio = new StudioRuntime(recipe);
    this.stopTransport = this.playback.onTransport((kind, previous, time) =>
      this.studio.transport(kind, previous, time),
    );
    const overlayCanvas = document.createElement("canvas");
    overlayCanvas.width = recipe.width;
    overlayCanvas.height = recipe.height;
    this.overlayContext = overlayCanvas.getContext("2d")!;
    this.overlayTexture = new THREE.CanvasTexture(overlayCanvas);
    this.overlayTexture.colorSpace = THREE.SRGBColorSpace;
    this.overlay = new THREE.Mesh(
      new THREE.PlaneGeometry(recipe.width, recipe.height),
      new THREE.MeshBasicMaterial({
        map: this.overlayTexture,
        transparent: true,
        depthWrite: false,
        depthTest: recipe.studio?.space === "world",
      }),
    );
    this.overlay.renderOrder = 2;
    if (recipe.studio?.space === "world") {
      this.object.scale.setScalar(recipe.studio.worldScale);
      this.plane.material.depthTest = true;
      this.text.object.material.depthTest = true;
    }
    this.text.object.visible =
      recipe.textVisible !== false && !recipe.typography?.enabled;
    this.text.object.renderOrder = 1;
    this.object.add(this.plane, this.text.object, this.overlay);
    if (options.particleRenderer === "instanced") {
      this.particleBatches = new WorldParticleBatches(this.studio, images);
      this.object.add(this.particleBatches.object);
    }
    this.render();
  }
  render() {
    if (this.disposed || this.lastTime === this.playback.time) return;
    this.lastTime = this.playback.time;
    paintLayers(
      this.ctx,
      this.playback.recipe,
      this.playback.time,
      this.images,
    );
    this.texture.needsUpdate = true;
    this.overlayContext.clearRect(
      0,
      0,
      this.playback.recipe.width,
      this.playback.recipe.height,
    );
    paintStudio(
      this.overlayContext,
      this.studio,
      this.playback.time,
      this.images,
      !!this.particleBatches,
    );
    this.particleBatches?.update(this.playback.time);
    this.overlayTexture.needsUpdate = true;
  }
  update(delta: number) {
    if (this.studio.advanceUI(delta)) this.lastTime = NaN;
    this.text.update(delta);
    if (
      this.camera &&
      this.playback.recipe.studio?.billboard &&
      this.playback.recipe.studio.space === "world"
    ) {
      const q = this.camera.getWorldQuaternion(new THREE.Quaternion());
      if (this.object.parent)
        q.premultiply(
          this.object.parent
            .getWorldQuaternion(new THREE.Quaternion())
            .invert(),
        );
      this.object.quaternion.copy(q);
    }
    this.render();
  }
  seek(t: number) {
    this.text.seek(t);
    this.render();
  }
  setText(text: string, color = this.playback.recipe.color) {
    this.playback.recipe = { ...this.playback.recipe, text, color };
    this.text.setText(text, color);
    this.lastTime = NaN;
    this.render();
  }
  setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }
  setData(data: StudioData) {
    this.studio.setData(data);
    this.invalidate();
  }
  setNodeState(id: string, state: StudioWidgetState) {
    this.studio.setNodeState(id, state);
    this.invalidate();
  }
  setQuality(quality: Partial<StudioQuality>) {
    this.studio.setQuality(quality);
    this.invalidate();
  }
  onEvent(listener: (event: StudioSignal) => void) {
    return this.studio.onEvent(listener);
  }
  hitTest(x: number, y: number) {
    return this.studio.hitTest(x, y, this.playback.time);
  }
  pointer(type: "down" | "up" | "cancel", x: number, y: number) {
    const id = this.studio.pointer(type, x, y);
    this.invalidate();
    return id;
  }
  /** Convert a host Raycaster intersection with this effect to logical canvas pixels. */
  pointerWorld(type: "down" | "up" | "cancel", point: THREE.Vector3) {
    const p = this.object.worldToLocal(point.clone());
    return this.pointer(
      type,
      p.x + this.playback.recipe.width / 2,
      this.playback.recipe.height / 2 - p.y,
    );
  }
  private invalidate() {
    this.lastTime = NaN;
    this.render();
  }
  profile() {
    return this.studio.profile();
  }
  snapshot() {
    return {
      ...sceneSnapshot(this.playback.recipe, this.playback.time),
      studio: this.studio.snapshot(this.playback.time),
    };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.particleBatches?.dispose();
    this.stopTransport();
    this.studio.dispose();
    this.overlay.geometry.dispose();
    this.overlay.material.dispose();
    this.overlayTexture.dispose();
    this.text.dispose();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.texture.dispose();
  }
}
