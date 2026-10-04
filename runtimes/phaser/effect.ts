import Phaser from "phaser";
import { Playback, type Recipe } from "../shared/motion.js";

/** Owns its text and scene listener; the caller retains ownership of the Scene. */
export class TextEffect {
  readonly playback: Playback;
  readonly node: Phaser.GameObjects.Text;
  private disposed = false;
  constructor(
    private scene: Phaser.Scene,
    recipe: Recipe,
  ) {
    this.playback = new Playback(recipe);
    this.node = scene.add
      .text(recipe.width / 2, recipe.height / 2, recipe.text, {
        fontFamily: "GameToolSans",
        fontSize: `${recipe.fontSize}px`,
        color: recipe.color,
        align: "center",
        fontStyle: "bold",
        padding: { x: 12, y: 12 },
      })
      .setOrigin(0.5)
      .setResolution(2);
    scene.events.on("update", this.tick, this);
    scene.events.once("shutdown", this.dispose, this);
    this.render();
  }
  private tick(_time: number, delta: number) {
    this.playback.advance(delta / 1000);
    this.render();
  }
  render() {
    if (this.disposed) return;
    const s = this.playback.state,
      r = this.playback.recipe;
    this.node
      .setPosition(r.width / 2, r.height / 2 + s.y)
      .setAlpha(s.opacity)
      .setScale(s.scale);
  }
  seek(seconds: number) {
    this.playback.seek(seconds);
    this.render();
  }
  setText(text: string, color = this.playback.recipe.color) {
    this.node.setText(text).setColor(color);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.events.off("update", this.tick, this);
    this.scene.events.off("shutdown", this.dispose, this);
    this.node.destroy();
  }
}
