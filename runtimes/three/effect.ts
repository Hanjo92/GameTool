import * as THREE from "three";
import { Playback, type Recipe } from "../shared/motion.js";

/** A screen-aligned plane. The host owns its renderer, camera and animation loop. */
export class TextEffect {
  readonly playback: Playback;
  readonly object: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private canvas = document.createElement("canvas");
  private texture: THREE.CanvasTexture;
  private disposed = false;
  constructor(recipe: Recipe) {
    this.playback = new Playback(recipe);
    this.canvas.width = recipe.width * 2;
    this.canvas.height = recipe.height * 2;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.object = new THREE.Mesh(
      new THREE.PlaneGeometry(recipe.width, recipe.height),
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.setText(recipe.text, recipe.color);
    this.render();
  }
  setText(text: string, color = this.playback.recipe.color) {
    if (this.disposed) return;
    const r = this.playback.recipe,
      ctx = this.canvas.getContext("2d")!;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.font = `bold ${r.fontSize * 2}px GameToolSans`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    const lines = text.split("\n"),
      lineHeight = r.fontSize * 2.3;
    lines.forEach((line, i) =>
      ctx.fillText(
        line,
        this.canvas.width / 2,
        this.canvas.height / 2 + (i - (lines.length - 1) / 2) * lineHeight,
      ),
    );
    this.texture.needsUpdate = true;
  }
  update(deltaSeconds: number) {
    this.playback.advance(deltaSeconds);
    this.render();
  }
  seek(seconds: number) {
    this.playback.seek(seconds);
    this.render();
  }
  render() {
    if (this.disposed) return;
    const s = this.playback.state;
    this.object.position.y = -s.y;
    this.object.scale.setScalar(s.scale);
    this.object.material.opacity = s.opacity;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
    this.texture.dispose();
  }
}
