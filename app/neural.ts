import { LINKS, makeRegions, PRESETS } from './atlas.ts';
import type { Preset, Region } from './atlas.ts';
import { seedRandom } from './simulation.ts';
import type { Drive } from './simulation.ts';

export type Connection = { target: number; weight: number; delay: number };
export type Neuron = { id: number; region: number; type: 'excitatory' | 'inhibitory'; threshold: number; connections: Connection[] };
export type NeuralFrame = { spikes: Uint8Array; rates: Float32Array; recent: number; total: number; step: number; synapticEvents: number };
const STEP_MS = 25;
const DELAY_STEPS = 4;
const decay = 0.63;

export class NeuralNetwork {
  readonly regions: Region[];
  readonly count: number;
  readonly fanout: number;
  private readonly targets: Uint32Array;
  private readonly weights: Float32Array;
  private readonly delays: Uint8Array;
  private readonly inhibitory: Uint8Array;
  private readonly threshold: Float32Array;
  private readonly voltage: Float32Array;
  private readonly refractory: Uint8Array;
  private readonly windowCounts: Uint8Array;
  private readonly regionCounts: Uint32Array;
  private readonly rates: Float32Array;
  private readonly inbox: Float32Array[];
  private stepCount = 0;
  private total = 0;
  private recent = 0;
  private events = 0;
  private windowSteps = 0;

  constructor(preset: Preset, seed = 0x18f6203) {
    const { neurons, fanout } = PRESETS[preset];
    this.count = neurons;
    this.fanout = fanout;
    this.regions = makeRegions(neurons);
    this.targets = new Uint32Array(neurons * fanout);
    this.weights = new Float32Array(neurons * fanout);
    this.delays = new Uint8Array(neurons * fanout);
    this.inhibitory = new Uint8Array(neurons);
    this.threshold = new Float32Array(neurons);
    this.voltage = new Float32Array(neurons);
    this.refractory = new Uint8Array(neurons);
    this.windowCounts = new Uint8Array(neurons);
    this.regionCounts = new Uint32Array(this.regions.length);
    this.rates = new Float32Array(this.regions.length);
    this.inbox = Array.from({ length: DELAY_STEPS }, () => new Float32Array(neurons));

    const random = seedRandom(seed);
    const anatomy = new Map(this.regions.map(region => [region.id, region]));
    for (const region of this.regions) {
      const partner = anatomy.get(region.key + '-' + (region.side === 'L' ? 'R' : 'L'));
      const projections = LINKS[region.key].flatMap(key => {
        const same = anatomy.get(key + '-' + region.side) ?? anatomy.get(key + '-midline');
        return same ? [same] : [anatomy.get(key + '-L'), anatomy.get(key + '-R')].filter((area): area is Region => Boolean(area));
      });
      for (let neuron = region.from; neuron < region.to; neuron++) {
        this.inhibitory[neuron] = Number(random() < (region.key === 'cerebellum' ? 0.14 : 0.20));
        this.threshold[neuron] = 0.84 + random() * 0.22;
        this.voltage[neuron] = random() * 0.60;
        const sign = this.inhibitory[neuron] ? -1.45 : 1;
        const offset = neuron * fanout;
        const gain = 12 / fanout;
        for (let edge = 0; edge < fanout; edge++) {
          const roll = random();
          const destination = roll < 0.58 ? region
            : roll < 0.69 && partner ? partner : projections[Math.floor(random() * projections.length)] ?? region;
          let target = destination.from + Math.floor(random() * destination.count);
          // Resolve duplicate pairings and exclude autapses. Every identifier is a real edge in the network.
          while (target === neuron || this.targets.subarray(offset, offset + edge).includes(target)) {
            target = (target + 1) % neurons;
          }
          const index = offset + edge;
          this.targets[index] = target;
          this.weights[index] = gain * sign * (0.06 + random() * 0.14);
          this.delays[index] = 1 + Math.floor(random() * (DELAY_STEPS - 1));
        }
      }
    }
  }

  tick(stimulus: Drive) {
    const current = this.stepCount % DELAY_STEPS;
    const incoming = this.inbox[current];
    const pulse = this.stepCount * 31;
    const fanout = this.fanout;
    this.windowSteps++;
    for (const region of this.regions) {
      const signal = region.channel === 'association'
        ? (stimulus.motive + stimulus.memory + stimulus.vision) / 3
        : stimulus[region.channel];
      const baseline = 0.112 + signal * 0.29;
      let sum = 0;
      for (let cell = region.from; cell < region.to; cell++) {
        const input = incoming[cell];
        incoming[cell] = 0;
        if (this.refractory[cell]) {
          this.refractory[cell]--;
          this.voltage[cell] = 0.075;
          continue;
        }
        const background = (Math.imul(cell, 69) + pulse) % 193 < 6 ? 0.48 : 0;
        const next = Math.max(-0.5, this.voltage[cell] * decay + input + baseline + background);
        if (next < this.threshold[cell]) {
          this.voltage[cell] = next;
          continue;
        }
        this.voltage[cell] = 0.075;
        this.refractory[cell] = 1;
        this.windowCounts[cell] = Math.min(255, this.windowCounts[cell] + 1);
        sum++;
        const end = (cell + 1) * fanout;
        for (let edge = cell * fanout; edge < end; edge++) {
          this.inbox[(current + this.delays[edge]) % DELAY_STEPS][this.targets[edge]] += this.weights[edge];
        }
      }
      this.regionCounts[region.index] += sum;
      this.total += sum;
      this.recent += sum;
      this.events += sum * fanout;
    }
    this.stepCount++;
  }

  readout(): Drive {
    const result: Drive = { motive: 0, vision: 0, memory: 0, motor: 0, language: 0, body: 0 };
    const count = { ...result };
    for (const region of this.regions) {
      if (region.channel === 'association') continue;
      result[region.channel] += Math.min(1, this.rates[region.index] / 12);
      count[region.channel]++;
    }
    for (const key of Object.keys(result) as (keyof Drive)[]) result[key] /= Math.max(1, count[key]);
    return result;
  }

  frame(): NeuralFrame {
    if (this.windowSteps > 0) {
      for (const region of this.regions) {
        this.rates[region.index] = this.regionCounts[region.index] * (1000 / STEP_MS) / region.count / this.windowSteps;
      }
    }
    const output = {
      spikes: this.windowCounts.slice(), rates: this.rates.slice(), recent: this.recent, total: this.total,
      step: this.stepCount, synapticEvents: this.events,
    };
    this.windowCounts.fill(0);
    this.regionCounts.fill(0);
    this.windowSteps = 0;
    this.recent = 0;
    return output;
  }

  describe(id: number): Neuron | undefined {
    const region = this.regions.find(candidate => id >= candidate.from && id < candidate.to);
    if (!region || !Number.isInteger(id)) return undefined;
    const connections = Array.from({ length: this.fanout }, (_, index) => {
      const edge = id * this.fanout + index;
      return { target: this.targets[edge], weight: this.weights[edge], delay: this.delays[edge] * STEP_MS };
    });
    return { id, region: region.index, type: this.inhibitory[id] ? 'inhibitory' : 'excitatory', threshold: this.threshold[id], connections };
  }
}
