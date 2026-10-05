import * as THREE from "three";
import type { StudioRuntime, StudioFrame } from "../shared/studio.js";
/** Optional sprite batching. Canvas remains the fidelity path for trails, glow and procedural shapes. */
export class WorldParticleBatches {
  readonly object = new THREE.Group();
  private batches = new Map<
    string,
    {
      mesh: THREE.InstancedMesh;
      texture: THREE.Texture;
      alpha: THREE.InstancedBufferAttribute;
      cells: THREE.InstancedBufferAttribute;
    }
  >();
  constructor(
    private runtime: StudioRuntime,
    private images: Map<string, HTMLImageElement | HTMLCanvasElement>,
  ) {}
  update(time: number) {
    for (const batch of this.batches.values()) batch.mesh.visible = false;
    const frames = this.runtime.frames(time);
    for (const f of frames) {
      if (f.kind !== "particles" || !f.visible || !f.points.length) continue;
      const batch = this.batches.get(f.id) ?? this.create(f);
      const count = Math.min(
        5000,
        f.points.length * this.runtime.quality.instances,
      );
      batch.mesh.visible = true;
      batch.mesh.count = count;
      const rotation = (f.rotation * Math.PI) / 180;
      for (let i = 0; i < count; i++) {
        const p = f.points[i % f.points.length],
          x = p.x * f.scale,
          y = p.y * f.scale;
        const position = new THREE.Vector3(
          f.x +
            x * Math.cos(rotation) -
            y * Math.sin(rotation) -
            this.runtime.recipe.width / 2,
          this.runtime.recipe.height / 2 -
            f.y -
            x * Math.sin(rotation) -
            y * Math.cos(rotation),
          0.001 * f.zIndex,
        );
        const matrix = new THREE.Matrix4().compose(
          position,
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            -rotation - p.rotation,
          ),
          new THREE.Vector3(p.size * f.scale, p.size * f.scale, 1),
        );
        batch.mesh.setMatrixAt(i, matrix);
        batch.mesh.setColorAt(
          i,
          p.red === undefined
            ? new THREE.Color(f.particles?.color ?? f.color)
            : new THREE.Color(`rgb(${p.red},${p.green},${p.blue})`),
        );
        batch.alpha.setX(i, p.opacity * f.opacity);
        const s = f.sprite,
          frame = s
            ? s.loop
              ? Math.floor(f.localTime * s.fps) % s.frames
              : Math.min(s.frames - 1, Math.floor(f.localTime * s.fps))
            : 0;
        batch.cells.setXYZW(
          i,
          s ? (frame % s.columns) / s.columns : 0,
          s ? 1 - (Math.floor(frame / s.columns) + 1) / s.rows : 0,
          s ? 1 / s.columns : 1,
          s ? 1 / s.rows : 1,
        );
      }
      batch.mesh.instanceMatrix.needsUpdate = true;
      if (batch.mesh.instanceColor) batch.mesh.instanceColor.needsUpdate = true;
      batch.alpha.needsUpdate = true;
      batch.cells.needsUpdate = true;
    }
  }
  private create(f: StudioFrame) {
    let image = f.assetId ? this.images.get(f.assetId) : undefined;
    if (!image) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 32;
      const c = canvas.getContext("2d")!;
      c.fillStyle = "#fff";
      c.beginPath();
      c.arc(16, 16, 15, 0, Math.PI * 2);
      c.fill();
      image = canvas;
    }
    const texture = new THREE.Texture(image);
    texture.needsUpdate = true;
    texture.colorSpace = THREE.SRGBColorSpace;
    const geometry = new THREE.PlaneGeometry(1, 1),
      alpha = new THREE.InstancedBufferAttribute(new Float32Array(5000), 1),
      cells = new THREE.InstancedBufferAttribute(new Float32Array(5000 * 4), 4);
    geometry.setAttribute("particleAlpha", alpha);
    geometry.setAttribute("particleCell", cells);
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: this.runtime.recipe.studio?.space === "world",
      blending:
        f.particles?.blend === "add"
          ? THREE.AdditiveBlending
          : THREE.NormalBlending,
      uniforms: { spriteMap: { value: texture } },
      vertexShader: `attribute float particleAlpha; attribute vec4 particleCell; varying vec2 spriteUv; varying vec3 tint; varying float opacity; void main(){spriteUv=particleCell.xy+uv*particleCell.zw;tint=instanceColor;opacity=particleAlpha;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
      fragmentShader: `uniform sampler2D spriteMap; varying vec2 spriteUv; varying vec3 tint; varying float opacity; void main(){vec4 color=texture2D(spriteMap,spriteUv);gl_FragColor=vec4(color.rgb*tint,color.a*opacity);}`,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, 5000);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.setColorAt(0, new THREE.Color("#ffffff"));
    this.object.add(mesh);
    const batch = { mesh, texture, alpha, cells };
    this.batches.set(f.id, batch);
    return batch;
  }
  dispose() {
    this.object.removeFromParent();
    for (const { mesh, texture } of this.batches.values()) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      texture.dispose();
    }
    this.batches.clear();
  }
}
