import { NeuralNetwork } from './neural.ts';
import type { NeuralFrame, Neuron } from './neural.ts';
import { Simulation } from './simulation.ts';
import type { LearnedModel, State } from './simulation.ts';
import type { Preset, Region } from './atlas.ts';
import type { PlaceId } from './space.ts';

export type Request =
  | { type: 'init'; state?: State; preset: Preset; model?: LearnedModel }
  | { type: 'paused'; value: boolean }
  | { type: 'speed'; value: number }
  | { type: 'water' }
  | { type: 'preset'; value: Preset }
  | { type: 'inspect'; id: number }
  | { type: 'restore'; state: State };
export type Response =
  | { type: 'snapshot'; state: State; frame: NeuralFrame; stepMs: number }
  | { type: 'region'; regions: Region[]; preset: Preset }
  | { type: 'neuron'; neuron?: Neuron }
  | { type: 'move'; success: boolean; place: PlaceId }
  | { type: 'error'; message: string };

let sim: Simulation;
let network: NeuralNetwork;
let model: LearnedModel | undefined;
let interval: number | undefined;
let paused = false;
let speed = 1;
let updates = 0;
let stepMs = 0;
const worker = self as unknown as DedicatedWorkerGlobalScope;

function send(message: Response, transfer?: Transferable[]) {
  worker.postMessage(message, transfer ?? []);
}

function setupNetwork(preset: Preset) {
  network = new NeuralNetwork(preset);
  send({ type: 'region', regions: network.regions, preset });
}

function snapshot() {
  const frame = network.frame();
  send({ type: 'snapshot', state: sim.state, frame, stepMs }, [frame.spikes.buffer, frame.rates.buffer]);
}

function evolve() {
  if (paused) return;
  const start = performance.now();
  for (let update = 0; update < speed; update++) {
    const stimulus = sim.stimulus();
    network.tick(stimulus);
    network.tick(stimulus);
    sim.step(0.05, network.readout());
  }
  stepMs = stepMs * 0.90 + (performance.now() - start) * 0.10;
  if (++updates % 2 === 0) snapshot();
}

worker.onmessage = ({ data }: MessageEvent<Request>) => {
  try {
    if (data.type === 'init') {
      model = data.model;
      sim = new Simulation({ state: data.state, model });
      setupNetwork(data.preset);
      snapshot();
      if (interval === undefined) interval = worker.setInterval(evolve, 50);
    } else if (data.type === 'paused') {
      paused = data.value;
      if (paused) snapshot();
    } else if (data.type === 'speed') {
      speed = [1, 2, 4].includes(data.value) ? data.value : 1;
    } else if (data.type === 'water') {
      const success = sim.moveWater();
      send({ type: 'move', success, place: sim.state.water });
      snapshot();
    } else if (data.type === 'preset') {
      setupNetwork(data.value);
      snapshot();
    } else if (data.type === 'inspect') {
      send({ type: 'neuron', neuron: network.describe(data.id) });
    } else if (data.type === 'restore') {
      sim = new Simulation({ state: data.state, model });
      snapshot();
    }
  } catch (error) {
    send({ type: 'error', message: error instanceof Error ? error.message : 'The simulation could not start.' });
  }
};
