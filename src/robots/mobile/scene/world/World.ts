import * as THREE from 'three';
import { SKY, createSky } from './sky';
import { createFuji } from './far';
import { createPetals } from './petals';
import { Pedestal } from './pedestal';
import { CLOUD_SUN, OrbitPath, Synapses, createCloudSea, createHaze, createPlatform } from './skystage';

const V = new THREE.Vector3();

/**
 * "Above the clouds": the stage the shells orbit on. Camera rests at the origin
 * looking down -z, tipped up a touch so the horizon sits under the orbit and the
 * shells read against open sky. The far world dissolves into fog and haze that
 * share the sky's own colours; the cast is drawn after the haze and stays crisp.
 */
export class World {
  readonly pedestal: Pedestal;
  readonly orbitPath: OrbitPath | null;
  readonly synapses = new Synapses(6);
  private sky!: THREE.Mesh;
  private skyMat!: THREE.ShaderMaterial;
  private clouds!: THREE.Mesh;
  private cloudLight!: THREE.Vector3;
  private haze!: THREE.Mesh;
  private hazeMat!: THREE.ShaderMaterial;
  private platform!: ReturnType<typeof createPlatform>;
  private petals!: THREE.Mesh;
  private pulseV = 0;
  private focus = new THREE.Vector3();
  private far!: THREE.Object3D;
  readonly brandBackdrop: boolean;

  constructor(scene: THREE.Scene, {brandBackdrop = false} = {}) {
    this.brandBackdrop = brandBackdrop;
    this.pedestal = new Pedestal(!brandBackdrop);
    this.orbitPath = brandBackdrop ? null : new OrbitPath();
    if (brandBackdrop) {
      scene.fog = null;
      // Retain only the character connections. The invisible empty pedestal
      // group keeps ownership of swap effects without creating its geometry.
      scene.add(this.synapses.group, this.pedestal.group);
      return;
    }
    this.platform = createPlatform();
    scene.fog = new THREE.Fog(new THREE.Color(SKY.haze), 40, 520);
    this.sky = createSky();
    this.skyMat = this.sky.material as THREE.ShaderMaterial;
    const sea = createCloudSea();
    this.clouds = sea.mesh;
    this.cloudLight = sea.light;
    this.haze = createHaze();
    this.hazeMat = this.haze.material as THREE.ShaderMaterial;
    const fuji = createFuji();
    this.far = fuji;
    fuji.renderOrder = -5;
    scene.add(this.sky, this.clouds, fuji, this.haze);
    scene.add(this.platform.group);
    this.platform.group.add(this.pedestal.group);
    scene.add(this.orbitPath!.mesh, this.synapses.group);
    this.petals = createPetals(64, { x: [-7, 7], y: [-2.2, 3.4], z: [-9.5, -2.4] });
    scene.add(this.petals);
  }

  /** Website art direction: let its quiet paper-and-lime composition show through. */
  useBrandBackdrop() {
    if (this.brandBackdrop) return;
    for (const object of [this.sky,this.clouds,this.haze,this.far,this.petals,this.platform.group,this.orbitPath!.mesh]) object.visible=false;
  }

  /** Camera framing per viewport. Desktop keeps the comp's 49° horizontal view. */
  cameraFor(w: number, h: number, portrait: boolean) {
    const aspect = w / h;
    if (portrait) {
      const fov = THREE.MathUtils.clamp(46 + (0.62 - aspect) * 40, 46, 60);
      const pitch = THREE.MathUtils.degToRad(7);
      return { fov, position: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, Math.tan(pitch) * 20, -20) };
    }
    const baseH = Math.tan(THREE.MathUtils.degToRad(17));
    const fov = aspect >= 1.5 ? 34 : THREE.MathUtils.radToDeg(2 * Math.atan((baseH * 1.5) / aspect));
    const pitch = THREE.MathUtils.degToRad(3);
    return { fov, position: new THREE.Vector3(0, 0, 0), target: new THREE.Vector3(0, Math.tan(pitch) * 20, -20) };
  }

  /** Seat the stage under the centre shell, aim the dawn glow behind it, and trace the orbit. */
  layout(camera: THREE.PerspectiveCamera, center: THREE.Vector3, centerWidth: number, orbit: THREE.Vector3[], closed = true) {
    this.focus.copy(center);
    if (this.brandBackdrop) return;
    const s = THREE.MathUtils.clamp(centerWidth / 1.24, 0.6, 1.4);
    const bottom = center.y - centerWidth * 0.4;
    const topY = bottom - 0.62 * s;
    this.platform.group.position.set(center.x, topY, center.z);
    this.platform.group.scale.setScalar(s);
    // tip the stage's top a few degrees towards us so its glowing inlay always reads
    this.platform.group.rotation.x = 0.09;
    this.pedestal.group.position.set(0, 0, 0);
    this.pedestal.setBeamHeight((bottom - topY - this.pedestal.height * s) / s);

    (this.skyMat.uniforms.uGlowDir.value as THREE.Vector3).copy(center).sub(camera.position).setY(0).normalize();
    this.orbitPath!.setPath(orbit, centerWidth * 0.006, closed);
  }

  pulse() {
    if (!this.brandBackdrop) this.pedestal.pulse();
    this.pulseV = 1;
  }

  update(dt: number, t: number, camera: THREE.PerspectiveCamera) {
    if (this.brandBackdrop) return;
    this.pulseV = Math.max(0, this.pulseV - dt * 1.5);
    (this.petals.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    this.pedestal.update(dt, t);
    this.platform.update(t, this.pulseV);
    this.orbitPath!.update(t);
    this.sky.position.copy(camera.position);
    this.clouds.position.x = Math.sin(t * 0.02) * 1.5;
    this.cloudLight.copy(CLOUD_SUN).transformDirection(camera.matrixWorldInverse);

    // keep the haze glued to the horizon and the orbit as the camera drifts with the pointer
    const u = this.hazeMat.uniforms;
    V.set(camera.position.x, camera.position.y, camera.position.z - 1e4).project(camera);
    u.uHorizon.value = V.y * 0.5 + 0.5;
    V.copy(this.focus).project(camera);
    (u.uFocus.value as THREE.Vector2).set(V.x * 0.5 + 0.5, V.y * 0.5 + 0.5);
    u.uAspect.value = camera.aspect;
  }
}
