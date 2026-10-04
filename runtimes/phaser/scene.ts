import Phaser from "phaser";
import { TextEffect } from "./effect.js";
import { paintLayers } from "../shared/layers.js";
import { sceneSnapshot, type Recipe } from "../shared/motion.js";
/** Native Phaser texture backed by procedural Canvas drawing; each instance owns its texture. */
export class SceneEffect {
  readonly text: TextEffect;
  readonly playback;
  private texture: Phaser.Textures.CanvasTexture;
  private layer: Phaser.GameObjects.Image;
  private disposed = false;
  private lastTime = NaN;
  private key: string;
  constructor(
    private scene: Phaser.Scene,
    recipe: Recipe,
    private images: Map<string, HTMLImageElement | HTMLCanvasElement>,
  ) {
    this.key = `gametool-${Phaser.Utils.String.UUID()}`;
    this.texture = scene.textures.createCanvas(
      this.key,
      recipe.width,
      recipe.height,
    )!;
    this.layer = scene.add.image(0, 0, this.key).setOrigin(0);
    this.text = new TextEffect(scene, structuredClone(recipe));
    this.playback = this.text.playback;
    this.text.node.setVisible(
      recipe.textVisible !== false && !recipe.typography?.enabled,
    );
    scene.events.on("update", this.render, this);
    scene.events.once("shutdown", this.dispose, this);
    this.render();
  }
  render() {
    if (this.disposed || this.lastTime === this.playback.time) return;
    this.lastTime = this.playback.time;
    paintLayers(
      this.texture.context,
      this.playback.recipe,
      this.playback.time,
      this.images,
    );
    this.texture.refresh();
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
    this.scene.events.off("update", this.render, this);
    this.scene.events.off("shutdown", this.dispose, this);
    this.text.dispose();
    this.layer.destroy();
    this.scene.textures.remove(this.key);
  }
}
