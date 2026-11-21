import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource/instrument-serif/400.css';
import './styles.css';
import { PRESETS } from './atlas.ts';
import type { Preset, Region } from './atlas.ts';
import type { BrainView, NeuronScope } from './brain-view.ts';
import type { NeuralFrame, Neuron } from './neural.ts';
import { clockTime, GOALS, importState, initialState } from './simulation.ts';
import type { LearnedModel } from './simulation.ts';
import type { Request, Response } from './sim-worker.ts';
import { PLACES } from './space.ts';
import type { WorldView } from './world-view.ts';

const get = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const text = (id: string, value: string) => { const element = get(id); if (element.textContent !== value) element.textContent = value; };
const number = (n: number) => n.toLocaleString('en-US');
const SAVE_KEY = 'human-simulator:save:1';
const PREF_KEY = 'human-simulator:network:1';
const base = import.meta.env.BASE_URL;
const tabs = ['world', 'brain', 'journal'] as const;
type Tab = typeof tabs[number];
const dialog = get<HTMLDialogElement>('settings');
const scale = get<HTMLSelectElement>('scale');
const regionInput = get<HTMLSelectElement>('region');
const neuronInput = get<HTMLInputElement>('neuron-input');
const busy = new Set<Tab>();
let view: Tab = 'world';
let state = initialState();
let frame: NeuralFrame | undefined;
let regions: Region[] = [];
let region = -1;
let preset: Preset = 'standard';
let inspecting: Neuron | undefined;
let connectionRows: HTMLButtonElement[] = [];
let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let speed = 1;
let initialized = false;
let worker: Worker | undefined;
let world: Pick<WorldView, 'draw' | 'changeCamera'> | undefined;
let brain: Pick<BrainView, 'draw' | 'focus' | 'setRegions' | 'update'> | undefined;
let scope: NeuronScope | undefined;
let toastTimeout = 0;
let thoughtVersion = -1;
let lastSave = 0;
let workerStepMs = 0;
const visibleGraphics = { 'world-viewport': true, 'brain-viewport': true, scope: true };
const observers = new IntersectionObserver(entries => {
  for (const entry of entries) {
    const id = entry.target.id as keyof typeof visibleGraphics;
    visibleGraphics[id] = entry.isIntersecting;
    if (!entry.isIntersecting) continue;
    if (id === 'brain-viewport' && frame) brain?.update(frame);
    if (id === 'scope') scope?.draw(frame);
  }
}, { rootMargin: '24px' });
for (const id of Object.keys(visibleGraphics)) observers.observe(get(id));

try {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) state = importState(JSON.parse(saved));
  const preference = localStorage.getItem(PREF_KEY);
  if (preference && Object.hasOwn(PRESETS, preference)) preset = preference as Preset;
} catch {
  // Continue from a fresh state if the browser cleared storage or a save is invalid.
}

function post(request: Request) {
  worker?.postMessage(request);
}

function save() {
  if (!initialized) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // Export remains available when website storage is full or unavailable.
  }
}

function toast(message: string) {
  const box = get('toast');
  box.textContent = message;
  box.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => { box.hidden = true; }, 3200);
}

function syncPause() {
  const pauseButton = get<HTMLButtonElement>('pause');
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.lastElementChild!.textContent = paused ? 'Resume' : 'Pause';
  text('brain-pause', paused ? 'Resume' : 'Pause');
  text('world-status', initialized ? paused ? 'Paused' : 'Running' : 'Starting');
  text('brain-status', paused ? 'Paused' : 'Live activity');
  get('world-light').classList.toggle('paused', paused);
  get('brain-light').classList.toggle('paused', paused);
  post({ type: 'paused', value: paused || document.hidden });
}

function togglePause() {
  paused = !paused;
  syncPause();
  if (paused) save();
}

get('pause').addEventListener('click', togglePause);
get('brain-pause').addEventListener('click', togglePause);
get('water').addEventListener('click', () => post({ type: 'water' }));
get('camera').addEventListener('click', () => {
  if (!world) return;
  const following = world.changeCamera() === 'close';
  const button = get('camera');
  button.setAttribute('aria-pressed', String(following));
  button.setAttribute('aria-label', following ? 'Show entire apartment' : 'Switch to close view');
  button.lastElementChild!.textContent = following ? 'Room' : 'Follow';
});
get('speed').addEventListener('click', () => {
  speed = speed === 1 ? 2 : speed === 2 ? 4 : 1;
  text('speed', speed + '×');
  get('speed').setAttribute('aria-label', 'Simulation speed, ' + speed + ' times');
  post({ type: 'speed', value: speed });
});
get('settings-open').addEventListener('click', () => dialog.showModal());
get('settings-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('pointerdown', event => { if (event.target === dialog) dialog.close(); });
get('export').addEventListener('click', () => {
  const handle = document.createElement('a');
  const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  handle.href = url;
  handle.download = 'sam-human-simulator.json';
  document.body.append(handle);
  handle.click();
  handle.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 15000);
  dialog.close();
  toast('Save exported.');
});
const fileInput = get<HTMLInputElement>('save-file');
get('import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  fileInput.value = '';
  if (!file) return;
  try {
    if (file.size > 600_000) throw new Error('This file is too large to be a simulation save.');
    const loaded = importState(JSON.parse(await file.text()));
    post({ type: 'restore', state: loaded });
    state = loaded;
    thoughtVersion = -1;
    save();
    dialog.close();
    toast('Save restored.');
  } catch (error) {
    dialog.close();
    toast(error instanceof SyntaxError ? 'Choose a valid Human Simulator JSON save.' : (error as Error).message);
  }
});

function meters() {
  for (const key of ['hydration', 'nutrition', 'energy'] as const) {
    const value = Math.round(state.needs[key] * 100);
    const control = get<HTMLProgressElement>(key);
    if (control.value !== value) control.value = value;
    text(key + '-value', value + '%');
  }
}

function updateWorld() {
  text('world-time', clockTime(state.time));
  text('thought', state.thoughts.at(-1)?.text ?? 'Sam is waking up.');
  text('goal', state.plan ? GOALS[state.plan.goal] : 'Getting oriented');
  meters();
}

function updateJournal() {
  if (state.count !== thoughtVersion) {
    thoughtVersion = state.count;
    const items = [...state.thoughts].reverse().map(thought => {
      const row = document.createElement('li');
      const when = document.createElement('time');
      const words = document.createElement('p');
      when.textContent = clockTime(thought.time);
      words.textContent = thought.text;
      row.append(when, words);
      return row;
    });
    get('journal-list').replaceChildren(...items);
  }
  const memory = state.memory;
  text('memory', memory ? 'Water was last seen at ' + PLACES[memory.place].label + '.' : 'Sam is unsure where the water is.');
  text('memory-time', memory ? clockTime(memory.time) + ' · ' + Math.round(memory.certainty * 100) + '% confidence' : '');
  text('outcome', state.lastOutcome || 'No completed actions yet.');
}

function setupRegions(items: Region[], activePreset: Preset) {
  regions = items;
  preset = activePreset;
  scale.value = preset;
  scale.disabled = false;
  regionInput.replaceChildren(new Option('Whole brain', '-1'), ...regions.map(item =>
    new Option(item.name + (item.side === 'midline' ? '' : ' · ' + (item.side === 'L' ? 'left' : 'right')), String(item.index))));
  const settings = PRESETS[preset];
  neuronInput.max = String(settings.neurons - 1);
  text('total-neurons', number(settings.neurons));
  text('total-connections', number(settings.neurons * settings.fanout));
  brain?.setRegions(regions);
  changeRegion(region);
}

function changeRegion(index: number, id?: number) {
  region = index;
  regionInput.value = String(index);
  brain?.focus(index);
  if (frame) brain?.update(frame);
  scope?.setRegion(regions[index], id);
  scope?.draw(frame);
  get<HTMLButtonElement>('scope-prev').disabled = index < 0;
  get<HTMLButtonElement>('scope-next').disabled = index < 0;
  renderSelection();
  updateBrain();
}

function pickNeuron(id: number) {
  if (!Number.isInteger(id) || id < 0 || id >= PRESETS[preset].neurons) return;
  const area = regions.find(item => id >= item.from && id < item.to);
  if (!area) return;
  if (region !== area.index) changeRegion(area.index, id);
  else scope?.setRegion(area, id);
  neuronInput.value = String(id);
  post({ type: 'inspect', id });
}

function renderSelection(neuron?: Neuron) {
  inspecting = neuron;
  scope?.setNeuron(neuron);
  get('neuron-fired').hidden = true;
  if (!neuron) {
    text('neuron-title', 'Connections');
    text('neuron-description', 'Select a neuron to follow its outgoing signals and inspect its targets, weights, and delays.');
    get('connections').replaceChildren();
    connectionRows = [];
    return;
  }
  const area = regions[neuron.region];
  text('neuron-title', 'Neuron #' + number(neuron.id));
  text('neuron-description', area.name + ' · ' + neuron.type + ' · ' + neuron.connections.length + ' outgoing synapses');
  const header = document.createElement('div');
  header.className = 'connections-header';
  for (const caption of ['Target neuron', 'Weight', 'Delay']) {
    const span = document.createElement('span');
    span.textContent = caption;
    header.append(span);
  }
  connectionRows = neuron.connections.map(connection => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'connection';
    const weight = (connection.weight >= 0 ? '+' : '') + connection.weight.toFixed(3);
    for (const caption of ['#' + number(connection.target), weight, connection.delay + ' ms']) {
      const cell = document.createElement('span');
      cell.textContent = caption;
      row.append(cell);
    }
    row.setAttribute('aria-label', 'Inspect target neuron ' + connection.target + ', weight ' + weight + ', delay ' + connection.delay + ' milliseconds');
    row.addEventListener('click', () => pickNeuron(connection.target));
    return row;
  });
  get('connections').replaceChildren(header, ...connectionRows);
  updateBrain();
}

function updateBrain() {
  if (view !== 'brain') return;
  const area = regions[region];
  const rate = area && frame ? (frame.rates[area.index] ?? 0).toFixed(1) + ' Hz' : '';
  text('region-note', area
    ? area.note + ' ' + number(area.count) + ' simulated neurons' + (rate ? ' · ' + rate + ' average.' : '.')
    : 'Choose a region to see its neurons. The 3D map samples live activity at approximate locations within the atlas.');
  text('total-spikes', number(frame?.recent ?? 0));
  text('performance', workerStepMs > 38 ? 'Try a smaller network for smoother playback' : '');
  if (inspecting && frame) {
    const bursts = frame.spikes[inspecting.id] ?? 0;
    get('neuron-fired').hidden = !bursts;
    connectionRows.forEach((row, index) => {
      row.classList.toggle('pulsed', Boolean(bursts));
      row.classList.toggle('recent-target', Boolean(frame?.spikes[inspecting!.connections[index].target]));
    });
  }
  if (visibleGraphics.scope) scope?.draw(frame);
}

regionInput.addEventListener('change', () => changeRegion(Number(regionInput.value)));
scale.addEventListener('change', () => {
  const choice = scale.value as Preset;
  scale.disabled = true;
  workerStepMs = 0;
  text('performance', 'Rebuilding network…');
  try { localStorage.setItem(PREF_KEY, choice); } catch { /* The selection lasts for this session. */ }
  post({ type: 'preset', value: choice });
});
get('scope-prev').addEventListener('click', () => { scope?.changePage(-1); scope?.draw(frame); });
get('scope-next').addEventListener('click', () => { scope?.changePage(1); scope?.draw(frame); });
get<HTMLFormElement>('neuron-form').addEventListener('submit', event => {
  event.preventDefault();
  if (neuronInput.value) pickNeuron(Number(neuronInput.value));
});

function unavailable(container: string, message: string) {
  const warning = document.createElement('p');
  warning.className = 'unavailable';
  warning.textContent = message;
  get(container).append(warning);
}

async function loadView(tab: Tab) {
  if (busy.has(tab)) return;
  busy.add(tab);
  if (tab === 'world') {
    try {
      const { WorldView } = await import('./world-view.ts');
      world = new WorldView(get('world-viewport'), message => text('world-asset', message));
    } catch {
      try {
        const { CanvasWorldView } = await import('./canvas-views.ts');
        world = new CanvasWorldView(get('world-viewport'));
        text('world-asset', 'Canvas view');
        text('scene-hint', '');
      } catch {
        unavailable('world-viewport', 'The apartment viewer is unavailable on this browser.');
        get<HTMLButtonElement>('camera').disabled = true;
      }
    }
  }
  if (tab === 'brain') {
    try {
      const { BrainView, NeuronScope } = await import('./brain-view.ts');
      scope = new NeuronScope(get<HTMLCanvasElement>('scope'), get('scope-range'), pickNeuron);
      scope.setRegion(regions[region]);
      try {
        brain = new BrainView(get('brain-viewport'), source => text('atlas-status', source));
        brain.setRegions(regions);
        brain.focus(region);
        if (frame) brain.update(frame);
      } catch {
        const { CanvasBrainView } = await import('./canvas-views.ts');
        brain = new CanvasBrainView(get('brain-viewport'), source => text('atlas-status', source));
        text('brain-hint', '');
        brain.setRegions(regions);
        brain.focus(region);
        if (frame) brain.update(frame);
      }
      updateBrain();
    } catch {
      unavailable('brain-viewport', 'The brain viewer could not load.');
    }
  }
}

function switchView() {
  const hash = location.hash.slice(1);
  const next = tabs.find(tab => tab === hash) ?? 'world';
  if (next !== view) window.scrollTo(0, 0);
  view = next;
  for (const tab of tabs) {
    get(tab).hidden = tab !== view;
    const link = document.querySelector('[data-view="' + tab + '"]')!;
    if (tab === view) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  if (view === 'world') updateWorld();
  if (view === 'brain') updateBrain();
  if (view === 'journal') updateJournal();
  void loadView(view);
}

let lastDraw = 0;
function animate(now: number) {
  requestAnimationFrame(animate);
  if (document.hidden || now - lastDraw < (1000 / 32)) return;
  const dt = Math.max(0, Math.min((now - lastDraw) / 1000, .065));
  lastDraw = now;
  if (view === 'world' && visibleGraphics['world-viewport']) world?.draw(state, dt, paused ? 0 : speed);
  if (view === 'brain' && visibleGraphics['brain-viewport']) brain?.draw(dt, paused);
}

async function start() {
  try {
    worker = new Worker(new URL('./sim-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }: MessageEvent<Response>) => {
      if (data.type === 'region') setupRegions(data.regions, data.preset);
      if (data.type === 'snapshot') {
        state = data.state;
        frame = data.frame;
        workerStepMs = data.stepMs;
        if (!initialized) {
          initialized = true;
          syncPause();
        }
        if (view === 'world') updateWorld();
        if (view === 'journal') updateJournal();
        if (view === 'brain') {
          if (visibleGraphics['brain-viewport']) brain?.update(frame);
          updateBrain();
        }
        if (performance.now() - lastSave > 1800) {
          lastSave = performance.now();
          save();
        }
      }
      if (data.type === 'neuron') renderSelection(data.neuron);
      if (data.type === 'move') {
        toast(data.success ? 'Water moved to ' + PLACES[data.place].label + '.'
          : 'Sam is holding the glass right now.');
      }
      if (data.type === 'error') toast(data.message);
    };
    worker.onerror = () => { text('world-status', 'Unavailable'); toast('The simulation worker could not start.'); };
    const model = await fetch(base + 'model.json').then(response => response.ok ? response.json() as Promise<LearnedModel> : undefined).catch(() => undefined);
    post({ type: 'init', state, preset, model: model?.version === 1 ? model : undefined });
    post({ type: 'speed', value: speed });
    syncPause();
  } catch {
    text('world-status', 'Unavailable');
    toast('The simulation could not start on this browser.');
  }
}

window.addEventListener('hashchange', switchView);
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  post({ type: 'paused', value: paused || document.hidden });
  if (document.hidden) save();
});
switchView();
requestAnimationFrame(animate);
void start();
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { void navigator.serviceWorker.register(base + 'sw.js').catch(() => {}); });
}
