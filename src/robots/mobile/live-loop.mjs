/** One cancellable render loop. Pausing keeps the pose but does no GPU work. */
export class RobotRenderLoop {
  constructor(
    render,
    // WebKit's frame APIs require Window as their receiver. Storing a raw
    // method and calling this.request/cancel rebinds it to RobotRenderLoop.
    request = (callback) => globalThis.requestAnimationFrame(callback),
    cancel = (id) => globalThis.cancelAnimationFrame(id),
  ) {
    this.render = render;
    this.request = request;
    this.cancel = cancel;
    this.active = false;
    this.disposed = false;
    this.frame = null;
    this.last = null;
  }

  setActive(active) {
    if (this.disposed || this.active === active) return;
    this.active = active;
    this.last = null;
    if (!active) {
      if (this.frame !== null) this.cancel(this.frame);
      this.frame = null;
    } else {
      this.schedule();
    }
  }

  schedule() {
    if (!this.active || this.disposed || this.frame !== null) return;
    this.frame = this.request((now) => {
      this.frame = null;
      if (!this.active || this.disposed) return;
      const dt = this.last === null ? 0 : Math.min(.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      this.render(dt, now);
      this.schedule();
    });
  }

  dispose() {
    this.setActive(false);
    this.disposed = true;
  }
}

/** Only pass the retiring shell's owned pivot, never its shared pick proxy. */
export function disposeStageTree(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((mesh) => {
    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of [mesh.material].flat()) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value);
      }
      for (const uniform of Object.values(material.uniforms ?? {})) {
        if (uniform?.value?.isTexture) textures.add(uniform.value);
      }
    }
  });
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
