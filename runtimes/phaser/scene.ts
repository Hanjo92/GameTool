import { StudioRuntime, type StudioSignal } from "../shared/studio.js";
import { paintStudio } from "../shared/studio-painter.js";
import type {
  StudioData,
  StudioQuality,
  StudioWidgetState,
} from "../shared/studio-types.js";
import Phaser from "phaser";
import { TextEffect } from "./effect.js";
import { paintLayers } from "../shared/layers.js";
import { sceneSnapshot, type Recipe } from "../shared/motion.js";
/** Native Phaser texture backed by procedural Canvas drawing; each instance owns its texture. */
export class SceneEffect {
  readonly text: TextEffect;
  readonly playback;
  readonly studio: StudioRuntime;
  private stopTransport: () => void;
  private overlay: Phaser.GameObjects.Image;
  private overlayTexture: Phaser.Textures.CanvasTexture;
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
    this.studio = new StudioRuntime(recipe);
    this.stopTransport = this.playback.onTransport((kind, previous, time) =>
      this.studio.transport(kind, previous, time),
    );
    this.overlayTexture = scene.textures.createCanvas(
      this.key + "-studio",
      recipe.width,
      recipe.height,
    )!;
    this.overlay = scene.add.image(0, 0, this.key + "-studio").setOrigin(0);
    scene.input.on("pointerdown", this.pointerDown, this);
    scene.input.on("pointerup", this.pointerUp, this);
    scene.input.on("pointerupoutside", this.pointerCancel, this);
    this.text.node.setVisible(
      recipe.textVisible !== false && !recipe.typography?.enabled,
    );
    scene.events.on("update", this.render, this);
    scene.events.once("shutdown", this.dispose, this);
    this.render();
  }
  render(_time?: number, delta?: number) {
    if (delta !== undefined && this.studio.advanceUI(delta / 1000))
      this.lastTime = NaN;
    if (this.disposed || this.lastTime === this.playback.time) return;
    this.lastTime = this.playback.time;
    paintLayers(
      this.texture.context,
      this.playback.recipe,
      this.playback.time,
      this.images,
    );
    this.texture.refresh();
    this.overlayTexture.context.clearRect(
      0,
      0,
      this.playback.recipe.width,
      this.playback.recipe.height,
    );
    paintStudio(
      this.overlayTexture.context,
      this.studio,
      this.playback.time,
      this.images,
    );
    this.overlayTexture.refresh();
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
  private pointerDown(pointer: Phaser.Input.Pointer) {
    this.pointer("down", pointer.worldX, pointer.worldY);
  }
  private pointerUp(pointer: Phaser.Input.Pointer) {
    this.pointer("up", pointer.worldX, pointer.worldY);
  }
  private pointerCancel(pointer: Phaser.Input.Pointer) {
    this.pointer("cancel", pointer.worldX, pointer.worldY);
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
    this.scene.events.off("update", this.render, this);
    this.scene.events.off("shutdown", this.dispose, this);
    this.stopTransport();
    this.studio.dispose();
    this.scene.input.off("pointerdown", this.pointerDown, this);
    this.scene.input.off("pointerup", this.pointerUp, this);
    this.scene.input.off("pointerupoutside", this.pointerCancel, this);
    this.overlay.destroy();
    this.scene.textures.remove(this.key + "-studio");
    this.text.dispose();
    this.layer.destroy();
    this.scene.textures.remove(this.key);
  }
}
