import * as THREE from "three";
import { TextEffect } from "./effect.js";
import { paintLayers } from "../shared/layers.js";
import { sceneSnapshot, type Recipe } from "../shared/motion.js";
/** Embeddable screen-space group. Host owns the camera, renderer and frame loop. */
export class SceneEffect {
  readonly object = new THREE.Group();
  readonly text: TextEffect;
  readonly playback;
  private texture: THREE.CanvasTexture;
  private plane: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private ctx: CanvasRenderingContext2D;
  private disposed = false;
  private lastTime = NaN;
  constructor(
    recipe: Recipe,
    private images: Map<string, HTMLImageElement | HTMLCanvasElement>,
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
    this.text.object.visible =
      recipe.textVisible !== false && !recipe.typography?.enabled;
    this.text.object.renderOrder = 1;
    this.object.add(this.plane, this.text.object);
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
  }
  update(delta: number) {
    this.text.update(delta);
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
  snapshot() {
    return sceneSnapshot(this.playback.recipe, this.playback.time);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.text.dispose();
    this.plane.geometry.dispose();
    this.plane.material.dispose();
    this.texture.dispose();
  }
}
