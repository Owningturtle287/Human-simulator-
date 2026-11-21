import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildApartment } from './apartment.ts';
import { angleDifference, PLACES } from './space.ts';
import type { Body, State } from './simulation.ts';

const CREAM = 0xe1d5c2;
const CAMERA_OFFSET = new T.Vector3(7.8, 10.6, 11.2);
const asset = (name: string) => import.meta.env.BASE_URL + 'assets/' + name + '.glb';
const box = new T.Box3();
const vector = new T.Vector3();
const smooth = (value: number) => value * value * (3 - 2 * value);

function batchApartment(root: T.Object3D, cup: T.Group) {
  const source: T.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    if (object instanceof T.Mesh && object.parent !== cup && !Array.isArray(object.material)) source.push(object);
  });
  const groups = new Map<string, T.Mesh[]>();
  for (const mesh of source) {
    if (Array.isArray(mesh.material)) continue;
    const key = mesh.material.uuid + (mesh.castShadow ? '+shadow' : '+unlit');
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const transformed = list.map(object => object.geometry.clone().applyMatrix4(object.matrixWorld));
    const geometry = mergeGeometries(transformed);
    for (const item of transformed) item.dispose();
    if (!geometry) continue;
    const merged = new T.Mesh(geometry, list[0].material);
    merged.castShadow = list[0].castShadow;
    merged.receiveShadow = list[0].receiveShadow;
    root.add(merged);
    for (const object of list) {
      object.removeFromParent();
      object.geometry.dispose();
    }
  }
}

function fallbackBody() {
  const dark = new T.MeshStandardMaterial({ color: 0x393e39, roughness: .85 });
  const shirt = new T.MeshStandardMaterial({ color: 0xc18c72, roughness: .90 });
  const skin = new T.MeshStandardMaterial({ color: 0xc49577, roughness: .76 });
  const hair = new T.MeshStandardMaterial({ color: 0x514236, roughness: .98 });
  const group = new T.Group();
  function ellipse(parent: T.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: T.Material) {
    const mesh = new T.Mesh(new T.SphereGeometry(1, 20, 14), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  ellipse(group, 0, 1.22, 0, .208, .285, .122, shirt);
  ellipse(group, 0, .94, 0, .176, .165, .117, dark);
  ellipse(group, 0, 1.50, 0, .065, .085, .065, skin);
  ellipse(group, 0, 1.641, .005, .101, .131, .102, skin);
  ellipse(group, 0, 1.72, -.019, .101, .073, .09, hair);
  ellipse(group, 0, 1.62, .097, .026, .031, .022, skin);
  const pivots = [-1, 1].map(side => {
    const leg = new T.Group(), arm = new T.Group();
    leg.position.set(side * .091, .89, 0);
    arm.position.set(side * .225, 1.39, 0);
    group.add(leg, arm);
    ellipse(leg, 0, -.36, 0, .077, .384, .078, dark);
    ellipse(leg, 0, -.795, .036, .074, .048, .14, dark);
    ellipse(arm, 0, -.215, .018, .043, .245, .042, skin);
    ellipse(arm, 0, -.068, 0, .071, .119, .068, shirt);
    ellipse(arm, 0, -.459, .012, .047, .072, .042, skin);
    return { leg, arm };
  });
  return { group, pivots };
}

function aim(bone: T.Object3D, child: T.Object3D, desired: T.Vector3) {
  const base = bone.getWorldPosition(new T.Vector3());
  const current = child.getWorldPosition(new T.Vector3()).sub(base).normalize();
  const direction = desired.clone().sub(base).normalize();
  const parentRotation = bone.parent!.getWorldQuaternion(new T.Quaternion());
  const adjustment = new T.Quaternion().setFromUnitVectors(current, direction);
  const local = parentRotation.clone().invert().multiply(adjustment).multiply(parentRotation);
  bone.quaternion.premultiply(local);
  bone.updateMatrixWorld(true);
}

export class WorldView {
  private readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.OrthographicCamera();
  private readonly controls: OrbitControls;
  private readonly person = new T.Group();
  private readonly fallback = fallbackBody();
  private readonly cup: T.Group;
  private readonly viewport: HTMLElement;
  private readonly mixTarget = new T.Vector3();
  private readonly actorPosition = new T.Vector3();
  private currentAction?: T.AnimationAction;
  private mixer?: T.AnimationMixer;
  private actions = new Map<string, T.AnimationAction>();
  private rightArm?: { upper: T.Object3D; forearm: T.Object3D; hand: T.Object3D };
  private head?: T.Object3D;
  private assetStatus: (message: string) => void;
  private width = 0;
  private height = 0;
  private style: 'room' | 'close' = 'room';
  private heading?: number;
  private motionTime = 0;
  private lastPose: Body['pose'] = 'standing';

  constructor(viewport: HTMLElement, assetStatus: (message: string) => void) {
    this.viewport = viewport;
    this.assetStatus = assetStatus;
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.26;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.scene.background = new T.Color(CREAM);
    this.scene.add(new T.HemisphereLight(0xfff1da, 0x9a8c7e, 2.10));
    const sun = new T.DirectionalLight(0xfff0d5, 2.32);
    sun.position.set(7.5, 12, 1.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8;
    sun.shadow.camera.right = 8;
    sun.shadow.camera.top = 8;
    sun.shadow.camera.bottom = -8;
    sun.shadow.camera.far = 30;
    sun.shadow.normalBias = .024;
    sun.shadow.bias = -.00038;
    this.scene.add(sun);
    const bounce = new T.DirectionalLight(0xd4e5ed, 0.62);
    bounce.position.set(-2.3, 4, 4.7);
    this.scene.add(bounce);
    this.cup = buildApartment(this.scene).cup;
    batchApartment(this.scene.children.find(object => object instanceof T.Group)!, this.cup);
    this.person.add(this.fallback.group);
    this.scene.add(this.person);
    this.camera.near = .08;
    this.camera.far = 70;
    this.camera.position.copy(CAMERA_OFFSET).add(new T.Vector3(0, .58, 0));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, .58, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = .30;
    this.controls.maxPolarAngle = 1.21;
    this.controls.minAzimuthAngle = -.09;
    this.controls.maxAzimuthAngle = 1.23;
    this.controls.minZoom = .72;
    this.controls.maxZoom = 3.0;
    this.controls.update();
    this.renderer.domElement.setAttribute('aria-label', 'Interactive 3D apartment with a walking human');
    viewport.prepend(this.renderer.domElement);
    void this.loadPerson();
  }

  private async loadPerson() {
    try {
      const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
      const person = await loader.loadAsync(asset('person'));
      person.scene.updateMatrixWorld(true);
      box.setFromObject(person.scene);
      const height = box.max.y - box.min.y;
      if (height > .1) {
        person.scene.scale.setScalar(1.78 / height);
        person.scene.position.y = -box.min.y * person.scene.scale.y;
      }
      person.scene.traverse(object => {
        if (object instanceof T.Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
        }
      });
      this.person.add(person.scene);
      this.fallback.group.visible = false;
      this.mixer = new T.AnimationMixer(person.scene);
      for (const clip of person.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
      const upper = person.scene.getObjectByName('upperarm_r');
      const forearm = person.scene.getObjectByName('lowerarm_r');
      const hand = person.scene.getObjectByName('hand_r');
      if (upper && forearm && hand) this.rightArm = { upper, forearm, hand };
      this.head = person.scene.getObjectByName('head');
      this.assetStatus('');
    } catch {
      this.assetStatus('Simplified avatar');
    }
  }

  changeCamera() {
    this.style = this.style === 'room' ? 'close' : 'room';
    this.controls.reset();
    if (this.style === 'room') {
      this.controls.target.set(0, .58, 0);
      this.camera.position.copy(CAMERA_OFFSET).add(this.controls.target);
      this.camera.zoom = 1;
    } else {
      this.controls.target.copy(this.actorPosition).add(new T.Vector3(0, .79, 0));
      this.camera.position.copy(this.controls.target).add(new T.Vector3(3.8, 4.0, 5.7));
      this.camera.zoom = 2.05;
    }
    this.camera.updateProjectionMatrix();
    this.controls.update();
    return this.style;
  }

  private resize() {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    const aspect = Math.max(.2, width / Math.max(1, height));
    const size = Math.max(8.5, 11.5 / aspect);
    this.camera.left = -size * aspect / 2;
    this.camera.right = size * aspect / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  draw(state: State, dt: number, timeScale: number) {
    this.resize();
    const body = state.body;
    const blend = this.heading === undefined ? 1 : 1 - Math.exp(-dt * 12);
    this.heading = (this.heading ?? body.heading) + angleDifference(this.heading ?? body.heading, body.heading) * blend;
    const sitting = body.pose === 'sitting';
    const sittingBlend = sitting ? Math.min(1, body.progress * 6, (1 - body.progress) * 6) : 0;
    const seating = Math.PI * sittingBlend;
    this.actorPosition.lerp(vector.set(body.x + sittingBlend * .45, 0, body.z), blend);
    this.person.position.copy(this.actorPosition);
    this.person.rotation.y = this.heading + seating;
    if (this.style === 'close') {
      this.mixTarget.copy(this.actorPosition).add(new T.Vector3(0, .78, 0)).sub(this.controls.target).multiplyScalar(blend * .39);
      this.camera.position.add(this.mixTarget);
      this.controls.target.add(this.mixTarget);
    }
    this.motionTime += dt * timeScale;
    const gesture = body.pose === 'drinking' || body.pose === 'eating';
    if (this.mixer) {
      const clip = body.pose === 'walking' ? (timeScale > 1 ? 'Walk_Brisk' : 'Walk_Relaxed')
        : sitting ? 'Sit_Stand' : 'Idle_Standing';
      const action = this.actions.get(clip);
      if (action && action !== this.currentAction) {
        this.currentAction?.fadeOut(.18);
        action.reset().setEffectiveWeight(1).play().fadeIn(.18);
        this.currentAction = action;
      }
      if (action && sitting) {
        action.paused = true;
        action.time = action.getClip().duration * body.progress;
      } else if (action) {
        action.paused = false;
      }
      this.mixer.update(dt * (timeScale > 0 ? Math.min(timeScale, 2.3) : 0));
      if (gesture && this.rightArm) this.gesture(body);
    } else {
      const phase = body.pose === 'walking' ? Math.sin(this.motionTime * 7.2) : Math.sin(this.motionTime * 2) * .06;
      this.fallback.pivots.forEach(({ leg, arm }, index) => {
        const side = index ? 1 : -1;
        arm.rotation.x = phase * side * .52;
        leg.rotation.x = -phase * side * .48 - sittingBlend * .35;
        if (gesture && index === 1) arm.rotation.x = -1.18 * Math.sin(Math.PI * body.progress);
      });
      this.fallback.group.position.y = -sittingBlend * .37;
    }
    const place = PLACES[state.water];
    this.cup.position.set(place.look.x, place.surface, place.look.z);
    this.cup.rotation.set(0, 0, 0);
    if (body.pose === 'drinking' && body.progress > .17 && body.progress < .83) {
      if (this.rightArm) {
        this.rightArm.hand.getWorldPosition(this.cup.position);
        this.cup.position.y += .035;
      } else {
        this.cup.position.copy(this.person.localToWorld(new T.Vector3(-.15, 1.40, .22)));
      }
      this.cup.rotation.z = Math.sin(Math.PI * body.progress) * .33;
    }
    this.lastPose = body.pose;
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private gesture(body: Body) {
    const { upper, forearm, hand } = this.rightArm!;
    if (this.lastPose !== body.pose) this.person.updateMatrixWorld(true);
    const shoulder = upper.getWorldPosition(new T.Vector3());
    const elbow = forearm.getWorldPosition(new T.Vector3());
    const currentHand = hand.getWorldPosition(new T.Vector3());
    const a = shoulder.distanceTo(elbow);
    const b = elbow.distanceTo(currentHand);
    const reach = smooth(Math.min(1, body.progress * 5.7, (1 - body.progress) * 5.7));
    const sip = smooth(Math.min(1, Math.max(0, (body.progress - .18) * 5), Math.max(0, (.83 - body.progress) * 5)));
    const position = new T.Vector3(-.19 + sip * .12, 1.10 + sip * .44, .42 - sip * .17);
    if (this.head && body.pose === 'eating') position.z -= .025;
    const desiredHand = currentHand.clone().lerp(this.person.localToWorld(position), reach);
    const direction = desiredHand.clone().sub(shoulder).normalize();
    const reachDistance = Math.max(.09, Math.min(a + b - .009, shoulder.distanceTo(desiredHand)));
    const projection = (a * a + reachDistance * reachDistance - b * b) / (2 * reachDistance);
    const height = Math.sqrt(Math.max(.001, a * a - projection * projection));
    const bend = new T.Vector3(-.65, -.9, .05).applyQuaternion(this.person.quaternion);
    bend.addScaledVector(direction, -bend.dot(direction)).normalize();
    const desiredElbow = shoulder.clone().addScaledVector(direction, projection).addScaledVector(bend, height);
    aim(upper, forearm, desiredElbow);
    aim(forearm, hand, desiredHand);
  }
}
