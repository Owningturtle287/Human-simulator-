import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import type { Region } from './atlas.ts';
import type { NeuralFrame, Neuron } from './neural.ts';
import { seedRandom } from './simulation.ts';

const BASE = new T.Color(0x1c1824);
const asset = import.meta.env.BASE_URL + 'assets/brain.glb';
const accent = { cortex: 0xa88479, cerebellum: 0x5f817b, inner: 0x81738c, stem: 0x7d8885 };

const vertexShader = [
  'attribute float fired;',
  'attribute vec3 tint;',
  'varying float energy;',
  'varying vec3 glowColor;',
  'uniform float pixel;',
  'uniform float pulse;',
  'void main() {',
  '  energy = fired * pulse;',
  '  glowColor = tint;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = pixel * (1.1 + 4.0 * energy);',
  '}',
].join('\n');

const fragmentShader = [
  'varying float energy;',
  'varying vec3 glowColor;',
  'void main() {',
  '  float r = length(gl_PointCoord - vec2(.5));',
  '  float falloff = 1.0 - smoothstep(.06, .5, r);',
  '  vec3 color = mix(glowColor, vec3(1.0, .92, .78), energy *.70);',
  '  gl_FragColor = vec4(color, falloff * (.10 + energy *.75));',
  '}',
].join('\n');

export class BrainView {
  private readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(35, 1, 0.05, 25);
  private readonly controls: OrbitControls;
  private readonly viewport: HTMLElement;
  private readonly atlasRoot = new T.Group();
  private readonly materials: { name: string; material: T.MeshStandardMaterial }[] = [];
  private readonly stage = new T.Group();
  private readonly cloudMaterial: T.ShaderMaterial;
  private cloud?: T.Points;
  private indices = new Uint32Array();
  private regions: Region[] = [];
  private selected = -1;
  private timeSinceSignal = 0;
  private atlasLoaded = false;
  private width = 0;
  private height = 0;

  constructor(viewport: HTMLElement, status: (source: string) => void) {
    this.viewport = viewport;
    this.renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.scene.background = BASE;
    this.scene.add(new T.HemisphereLight(0xe8cabc, 0x55516e, 2.02));
    const light = new T.DirectionalLight(0xf5ddd1, 2.7);
    light.position.set(2.5, 2.8, 2.1);
    const rim = new T.DirectionalLight(0xa8b4e7, 1.6);
    rim.position.set(-1.8, .85, -2);
    this.scene.add(light, rim, this.stage);
    this.stage.add(this.atlasRoot);
    this.camera.position.set(3.7, 1.28, 2.05);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 2.3;
    this.controls.maxDistance = 7.5;
    this.controls.target.set(0, -.01, 0);
    this.controls.update();
    this.renderer.domElement.setAttribute('aria-label', 'Rotatable 3D brain atlas with live neuron activity');
    viewport.prepend(this.renderer.domElement);

    this.cloudMaterial = new T.ShaderMaterial({
      uniforms: { pixel: { value: this.renderer.getPixelRatio() }, pulse: { value: 1 } },
      vertexShader, fragmentShader, transparent: true, depthTest: false, depthWrite: false, blending: T.AdditiveBlending,
    });
    void this.loadAtlas(status);
  }

  private async loadAtlas(status: (source: string) => void) {
    try {
      const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset);
      // FreeSurfer RAS (mm) to the simulator's right, up, anterior coordinates.
      this.atlasRoot.matrix.set(1 / 90, 0, 0, 0, 0, 0, 1 / 90, -4 / 90, 0, 1 / 90, 0, 17 / 90, 0, 0, 0, 1);
      this.atlasRoot.matrixAutoUpdate = false;
      gltf.scene.traverse(object => {
        if (!(object instanceof T.Mesh)) return;
        if (object.name.includes('Ventricle')) object.visible = false;
        const cortex = object.name.startsWith('Cortex');
        const cerebellum = object.name.startsWith('Cerebellum');
        const color = cortex ? accent.cortex : cerebellum ? accent.cerebellum : object.name === 'BrainStem' ? accent.stem : accent.inner;
        const material = new T.MeshStandardMaterial({
          color, roughness: .88, metalness: .04, transparent: true, opacity: cortex ? .47 : .76,
          depthWrite: !cortex, side: T.DoubleSide,
        });
        object.material = material;
        object.renderOrder = cortex ? 2 : 1;
        this.materials.push({ name: object.name, material });
      });
      this.atlasRoot.add(gltf.scene);
      this.atlasLoaded = true;
      this.focus(this.selected);
      status('FreeSurfer anatomical atlas');
    } catch {
      status('Activity map · atlas unavailable');
    }
  }

  setRegions(regions: Region[]) {
    this.regions = regions;
    this.focus(-1);
  }

  focus(index: number) {
    this.selected = index;
    if (this.cloud) {
      this.cloud.removeFromParent();
      this.cloud.geometry.dispose();
    }
    const positions: number[] = [];
    const colors: number[] = [];
    const neurons: number[] = [];
    const selectedRegion = this.regions[index];
    for (const region of this.regions) {
      if (selectedRegion && selectedRegion !== region) continue;
      const random = seedRandom(1400 + region.index);
      const limit = Math.min(region.count, selectedRegion ? 4800 : region.key === 'cerebellum' ? 1700 : 350);
      const color = new T.Color(region.color);
      const amplitude = region.key === 'cerebellum' ? [.33, .18, .27]
        : ['hypothalamus', 'hippocampus', 'amygdala', 'thalamus', 'ganglia', 'brainstem'].includes(region.key) ? [.08, .09, .10]
          : [.20, .14, .19];
      for (let index = 0; index < limit; index++) {
        const radius = Math.cbrt(random());
        const altitude = (random() - .5) * 2;
        const azimuth = random() * Math.PI * 2;
        const plane = Math.sqrt(1 - altitude * altitude);
        positions.push(
          region.position[0] + amplitude[0] * radius * plane * Math.cos(azimuth),
          region.position[1] + amplitude[1] * radius * altitude,
          region.position[2] + amplitude[2] * radius * plane * Math.sin(azimuth),
        );
        colors.push(color.r, color.g, color.b);
        neurons.push(region.from + Math.floor(index * region.count / limit));
      }
    }
    this.indices = Uint32Array.from(neurons);
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('tint', new T.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('fired', new T.BufferAttribute(new Float32Array(neurons.length), 1));
    this.cloud = new T.Points(geometry, this.cloudMaterial);
    this.cloud.renderOrder = 4;
    this.stage.add(this.cloud);
    for (const { name, material } of this.materials) {
      material.opacity = name.startsWith('Cortex') ? (selectedRegion ? .25 : .51) : selectedRegion ? .43 : .68;
    }
  }

  update(frame: NeuralFrame) {
    if (!this.cloud) return;
    this.timeSinceSignal = 0;
    const attribute = this.cloud.geometry.getAttribute('fired');
    const values = attribute.array as Float32Array;
    for (let index = 0; index < this.indices.length; index++) {
      const fires = frame.spikes[this.indices[index]];
      values[index] = fires ? Math.min(1, .67 + Math.max(0, fires - 1) * .11) : values[index] * .66;
    }
    attribute.needsUpdate = true;
  }

  draw(dt: number, paused: boolean) {
    const width = this.viewport.clientWidth;
    const height = this.viewport.clientHeight;
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
    if (!paused) this.timeSinceSignal += dt;
    this.cloudMaterial.uniforms.pulse.value = .36 + .64 * Math.exp(-this.timeSinceSignal * 3);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  get ready() {
    return this.atlasLoaded;
  }
}

const PAGE = 240;
export class NeuronScope {
  private readonly context: CanvasRenderingContext2D;
  private region?: Region;
  private page = 0;
  private selected?: Neuron;
  private selectedId = -1;
  private readonly canvas: HTMLCanvasElement;
  private readonly pick: (id: number) => void;
  private readonly countText: HTMLElement;

  constructor(canvas: HTMLCanvasElement, countText: HTMLElement, pick: (id: number) => void) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d')!;
    this.countText = countText;
    this.pick = pick;
    canvas.addEventListener('pointerdown', event => {
      const rect = canvas.getBoundingClientRect();
      const { columns, gapX, gapY, left, top } = this.layout(rect.width, rect.height);
      const column = Math.round((event.clientX - rect.left - left) / gapX);
      const row = Math.round((event.clientY - rect.top - top) / gapY);
      if (!this.region || column < 0 || column >= columns || row < 0) return;
      const offset = row * columns + column;
      const id = this.region.from + this.page * PAGE + offset;
      if (offset < PAGE && id < this.region.to) this.pick(id);
    });
  }

  setRegion(region?: Region, id?: number) {
    this.region = region;
    this.page = !region || id === undefined ? 0 : Math.floor((id - region.from) / PAGE);
    this.selected = undefined;
    this.selectedId = id ?? -1;
    this.syncLabel();
  }

  setNeuron(neuron?: Neuron) {
    this.selected = neuron;
    this.selectedId = neuron?.id ?? -1;
  }

  changePage(by: number) {
    const last = this.region ? Math.max(0, Math.ceil(this.region.count / PAGE) - 1) : 0;
    this.page = Math.max(0, Math.min(last, this.page + by));
    this.syncLabel();
  }

  private syncLabel() {
    const region = this.region;
    const start = region ? region.from + this.page * PAGE : 0;
    const end = region ? Math.min(start + PAGE, region.to) : 0;
    this.countText.textContent = region ? '#' + start.toLocaleString() + '–' + (end - 1).toLocaleString() : 'Choose a region to inspect';
  }

  private layout(width: number, height: number) {
    const columns = 24;
    return { columns, gapX: (width - 32) / (columns - 1), gapY: (height - 32) / 9, left: 16, top: 16 };
  }

  draw(frame?: NeuralFrame) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    const { columns, gapX, gapY, left, top } = this.layout(rect.width, rect.height);
    const context = this.context;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);
    const region = this.region;
    if (!region) return;
    const start = region.from + this.page * PAGE;
    const end = Math.min(start + PAGE, region.to);
    const x = (id: number) => left + ((id - start) % columns) * gapX;
    const y = (id: number) => top + Math.floor((id - start) / columns) * gapY;

    if (this.selected && this.selected.id >= start && this.selected.id < end) {
      context.lineWidth = 1;
      context.strokeStyle = frame?.spikes[this.selected.id] ? '#f5ba7e' : '#65566a';
      for (const connection of this.selected.connections) {
        if (connection.target < start || connection.target >= end) continue;
        context.beginPath();
        context.moveTo(x(this.selected.id), y(this.selected.id));
        context.lineTo(x(connection.target), y(connection.target));
        context.stroke();
      }
    }

    for (let id = start; id < end; id++) {
      const fire = Boolean(frame?.spikes[id]);
      const active = id === this.selectedId;
      if (active || fire) {
        context.beginPath();
        context.fillStyle = active ? '#75596f' : 'rgba(255,191,128,.19)';
        context.arc(x(id), y(id), active ? 6.0 : 4.9, 0, Math.PI * 2);
        context.fill();
      }
      context.beginPath();
      context.fillStyle = fire ? '#ffd2a3' : active ? '#fff4ea' : '#675a71';
      context.arc(x(id), y(id), fire || active ? 2.8 : 1.8, 0, Math.PI * 2);
      context.fill();
    }
  }
}
