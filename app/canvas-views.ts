import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { buildApartment } from './apartment.ts';
import type { Region } from './atlas.ts';
import { project, renderScene, sizeCanvas } from './canvas-render.ts';
import type { NeuralFrame } from './neural.ts';
import { angleDifference, PLACES } from './space.ts';
import { seedRandom } from './simulation.ts';
import type { State } from './simulation.ts';

function addCanvas(viewport: HTMLElement, label: string) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', label);
  viewport.prepend(canvas);
  return canvas;
}

export class CanvasWorldView {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly camera = new T.OrthographicCamera();
  private readonly scene = new T.Scene();
  private readonly backdrop = document.createElement('canvas');
  private style: 'room' | 'close' = 'room';
  private readonly position = new T.Vector3();
  private heading = 0;
  private elapsed = 0;
  private initialized = false;

  constructor(private readonly viewport: HTMLElement) {
    this.canvas = addCanvas(viewport, 'Apartment and animated person in Canvas view');
    this.context = this.canvas.getContext('2d')!;
    const { cup } = buildApartment(this.scene);
    cup.removeFromParent();
    this.camera.near = .08;
    this.camera.far = 70;
    this.camera.position.set(7.8, 11.18, 11.2);
    this.camera.lookAt(0, .58, 0);
  }

  changeCamera() {
    this.style = this.style === 'room' ? 'close' : 'room';
    return this.style;
  }

  draw(state: State, dt: number, timeScale: number) {
    const resize = sizeCanvas(this.canvas, this.viewport);
    const { width, height } = this.canvas;
    if (resize || this.backdrop.width !== width || this.backdrop.height !== height) {
      const aspect = width / Math.max(1, height);
      const size = Math.max(8.5, 11.5 / aspect);
      this.camera.left = -size * aspect / 2;
      this.camera.right = size * aspect / 2;
      this.camera.top = size / 2;
      this.camera.bottom = -size / 2;
      this.camera.updateProjectionMatrix();
      this.backdrop.width = width;
      this.backdrop.height = height;
      renderScene(this.backdrop, this.scene, this.camera, 0xe1d5c2);
    }
    const { body } = state;
    const blend = this.initialized ? 1 - Math.exp(-dt * 12) : 1;
    this.initialized = true;
    this.position.lerp(new T.Vector3(body.x, 0, body.z), blend);
    this.heading += angleDifference(this.heading, body.heading) * blend;
    this.elapsed += dt * timeScale;
    const feet = project(this.position, this.camera, width, height);
    const context = this.context;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#e1d5c2';
    context.fillRect(0, 0, width, height);
    context.save();
    if (this.style === 'close') {
      context.translate(width / 2 - feet.x * 1.85, height * .57 - feet.y * 1.85);
      context.scale(1.85, 1.85);
    }
    context.drawImage(this.backdrop, 0, 0);
    const { look, surface } = PLACES[state.water];
    if (body.pose !== 'drinking' || body.progress < .18 || body.progress > .82) {
      const water = project(new T.Vector3(look.x, surface, look.z), this.camera, width, height);
      context.fillStyle = '#446f68';
      context.fillRect(water.x - 2, water.y - 5, 4, 5);
      context.fillStyle = '#d0e7d6';
      context.fillRect(water.x - 2, water.y - 6, 4, 1);
    }
    this.person(state, width, height);
    context.restore();
  }

  private person(state: State, width: number, height: number) {
    const context = this.context;
    const body = state.body;
    const relative = (x: number, y: number, z: number) => project(new T.Vector3(
      this.position.x + x * Math.cos(this.heading) + z * Math.sin(this.heading), y,
      this.position.z - x * Math.sin(this.heading) + z * Math.cos(this.heading),
    ), this.camera, width, height);
    const scale = width / (this.camera.right - this.camera.left);
    const gait = body.pose === 'walking' ? Math.sin(this.elapsed * 9.7) : 0;
    const seated = body.pose === 'sitting' ? Math.min(1, body.progress * 6, (1 - body.progress) * 6) : 0;
    const floor = relative(0, 0.01, 0);
    context.beginPath();
    context.fillStyle = '#43362936';
    context.ellipse(floor.x, floor.y, .24 * scale, .12 * scale, .17, 0, Math.PI * 2);
    context.fill();

    const limb = (joints: number[][], color: string, thickness: number) => {
      context.beginPath();
      joints.forEach(([x, y, z], index) => {
        const point = relative(x, y, z);
        if (index === 0) context.moveTo(point.x, point.y);
        else context.lineTo(point.x, point.y);
      });
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.strokeStyle = color;
      context.lineWidth = Math.max(1, thickness * scale);
      context.stroke();
    };
    for (const side of [-1, 1]) {
      const swing = side * gait;
      const footZ = swing * .23 + seated * .14;
      const footY = .078 + Math.max(0, swing) * .071;
      limb([[side * .086, .88 - .36 * seated, 0], [side * .10, .48 - .23 * seated, swing * .14 + seated * .28],
        [side * .105, footY, footZ]], side === -1 ? '#3a4743' : '#43534b', .155);
      limb([[side * .105, footY, footZ - .055], [side * .105, footY, footZ + .111]], '#302d29', .115);
    }
    const hips = relative(0, .85 - seated * .36, 0);
    const shoulders = relative(0, 1.39 - seated * .36, .01);
    const gradient = context.createLinearGradient(hips.x - scale * .15, hips.y, hips.x + scale * .18, shoulders.y);
    gradient.addColorStop(0, '#80594a');
    gradient.addColorStop(1, '#bd8b6e');
    context.lineCap = 'round';
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(4, scale * .33);
    context.beginPath();
    context.moveTo(hips.x, hips.y);
    context.lineTo(shoulders.x, shoulders.y);
    context.stroke();
    for (const side of [-1, 1]) {
      const gesture = side === -1 && (body.pose === 'drinking' || body.pose === 'eating') ? Math.sin(Math.PI * body.progress) : 0;
      limb([[side * .166, 1.39 - seated * .36, 0], [side * .226, 1.23 - seated * .34, -.035]], '#9b6c56', .142);
      limb([[side * .226, 1.23 - seated * .34, -.035], [side * .249, 1.09 - seated * .30, .11 * -side * gait + gesture * .18],
        [side * (.24 - gesture * .08), .92 - seated * .22 + gesture * .53, .17 * -side * gait + gesture * .23]], '#b17f60', .085);
      if (gesture > .5 && body.pose === 'drinking') {
        const glass = relative(side * (.24 - gesture * .08), 1.00 + gesture * .53, .17 * -side * gait + gesture * .23);
        context.fillStyle = '#7bb6a9';
        context.fillRect(glass.x - scale * .027, glass.y - scale * .06, scale * .063, scale * .11);
      }
    }
    const head = relative(0, 1.62 - seated * .36, .009);
    context.beginPath();
    context.fillStyle = '#bd8d6b';
    context.ellipse(head.x, head.y, .091 * scale, .114 * scale, -.10, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = '#49392e';
    context.ellipse(head.x - .014 * scale, head.y - .045 * scale, .091 * scale, .064 * scale, -.10, Math.PI, Math.PI * 2);
    context.fill();
  }
}

type MapPoint = { id: number; region: number; color: string; position: T.Vector3 };
export class CanvasBrainView {
  private readonly canvas: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly backdrop = document.createElement('canvas');
  private readonly camera = new T.OrthographicCamera();
  private readonly stage = new T.Group();
  private frame?: NeuralFrame;
  private points: MapPoint[] = [];
  private selected = -1;
  private dirty = true;

  constructor(private readonly viewport: HTMLElement, status: (label: string) => void) {
    this.canvas = addCanvas(viewport, 'FreeSurfer brain atlas with live neuron activity');
    this.context = this.canvas.getContext('2d')!;
    this.camera.near = .05;
    this.camera.far = 15;
    this.camera.position.set(3.7, 1.28, 2.05);
    this.camera.lookAt(0, -.01, 0);
    status('Loading anatomical atlas');
    void new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(import.meta.env.BASE_URL + 'assets/brain.glb').then(({ scene }) => {
      const colors = { cortex: 0xa78277, cerebellum: 0x677f78, internal: 0x716679 };
      scene.traverse(mesh => {
        if (!(mesh instanceof T.Mesh)) return;
        mesh.visible = !mesh.name.includes('Ventricle');
        const color = mesh.name.startsWith('Cortex') ? colors.cortex : mesh.name.startsWith('Cerebellum') ? colors.cerebellum : colors.internal;
        mesh.material = new T.MeshStandardMaterial({ color });
      });
      this.stage.matrix.set(1 / 90, 0, 0, 0, 0, 0, 1 / 90, -4 / 90, 0, 1 / 90, 0, 17 / 90, 0, 0, 0, 1);
      this.stage.matrixAutoUpdate = false;
      this.stage.add(scene);
      this.dirty = true;
      status('FreeSurfer atlas · Canvas view');
    }).catch(() => status('Activity map · atlas unavailable'));
  }

  setRegions(regions: Region[]) {
    this.points = regions.flatMap(region => {
      const random = seedRandom(1400 + region.index);
      const length = Math.min(region.count, region.key === 'cerebellum' ? 180 : 95);
      const spread = region.key === 'cerebellum' ? [.24, .14, .23] : [.14, .11, .14];
      return Array.from({ length }, (_, slot) => ({
        id: region.from + Math.floor(slot * region.count / length), region: region.index, color: region.color,
        position: new T.Vector3(...region.position).add(new T.Vector3(...spread.map(scale => (random() - .5) * scale * 2))),
      }));
    });
  }

  focus(index: number) {
    this.selected = index;
  }

  update(frame: NeuralFrame) {
    this.frame = frame;
  }

  draw() {
    const resize = sizeCanvas(this.canvas, this.viewport, 720);
    const { width, height } = this.canvas;
    if (resize || this.dirty) {
      const aspect = width / Math.max(1, height);
      const size = Math.max(2.31, 2.19 / aspect);
      this.camera.left = -size * aspect / 2;
      this.camera.right = size * aspect / 2;
      this.camera.top = size / 2;
      this.camera.bottom = -size / 2;
      this.camera.updateProjectionMatrix();
      this.backdrop.width = width;
      this.backdrop.height = height;
      renderScene(this.backdrop, this.stage, this.camera, 0x1c1824);
      this.dirty = false;
    }
    const context = this.context;
    context.drawImage(this.backdrop, 0, 0);
    for (const dot of this.points) {
      const spikes = this.frame?.spikes[dot.id] ?? 0;
      if (!spikes || (this.selected >= 0 && dot.region !== this.selected)) continue;
      const point = project(dot.position, this.camera, width, height);
      context.fillStyle = dot.color;
      context.globalAlpha = this.selected < 0 ? .48 : .82;
      context.beginPath();
      context.arc(point.x, point.y, this.selected < 0 ? 1.10 : 2.0, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }
}
