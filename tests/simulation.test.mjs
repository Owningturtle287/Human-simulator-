import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS } from '../app/atlas.ts';
import { NeuralNetwork } from '../app/neural.ts';
import { findPath, free, PLACES } from '../app/space.ts';
import { importState, initialState, Simulation } from '../app/simulation.ts';
import { speak } from '../app/thoughts.ts';

test('Sam uses remembered position, discovers moved water and recovers', () => {
  const sim = new Simulation({ seed: 72, language: () => .7 });
  sim.moveWater('shelf');
  for (let step = 0; step < 700 && sim.state.thoughts.at(-1)?.kind !== 'drink'; step++) sim.step();
  assert.ok(sim.state.thoughts.some(thought => thought.kind === 'recall' && thought.text.includes('kitchen')));
  assert.ok(sim.state.thoughts.some(thought => thought.kind === 'miss'));
  assert.ok(sim.state.thoughts.some(thought => thought.kind === 'drink'));
  assert.equal(sim.state.memory.place, 'shelf');
  assert.ok(sim.state.needs.hydration > .65);
  assert.ok(sim.traces[0].success === false && sim.traces.at(-1).success);
});

test('all landmarks connect around furniture without intersecting its footprint', () => {
  for (const start of Object.values(PLACES)) {
    for (const target of Object.values(PLACES)) {
      const path = findPath(start.stand, target.stand);
      assert.deepEqual(path.at(-1), target.stand);
      let from = start.stand;
      for (const to of path) {
        for (let index = 0; index <= 20; index++) {
          assert.ok(free({ x: from.x + (to.x - from.x) * index / 20, z: from.z + (to.z - from.z) * index / 20 }));
        }
        from = to;
      }
    }
  }
});

test('the same memory produces varied English while preserving its meaning', () => {
  const choices = new Set(Array.from({ length: 16 }, (_, index) => speak('recall', 'desk', undefined, () => index / 16)));
  assert.ok(choices.size > 3);
  assert.ok([...choices].every(text => text.includes('the desk')));
});

test('a saved life restores body, memory, plan and existing thoughts', () => {
  const sim = new Simulation({ seed: 1 });
  for (let index = 0; index < 64; index++) sim.step();
  const restored = importState(JSON.parse(JSON.stringify(sim.state)));
  assert.equal(restored.time, sim.state.time);
  assert.deepEqual(restored.memory, sim.state.memory);
  assert.deepEqual(restored.thoughts.map(thought => thought.text), sim.state.thoughts.map(thought => thought.text));
  assert.equal(restored.plan.goal, sim.state.plan.goal);
  assert.throws(() => importState({ ...initialState(), body: { x: 99, z: 0, heading: 0 } }));
});

test('neuron IDs cover all populations and logged firing propagates across actual edges', () => {
  const brain = new NeuralNetwork('standard', 38);
  const { neurons, fanout } = PRESETS.standard;
  assert.equal(brain.regions.reduce((count, region) => count + region.count, 0), neurons);
  for (const id of [0, 400, 1100, 10_000, neurons - 1]) {
    const neuron = brain.describe(id);
    assert.equal(neuron.id, id);
    assert.equal(neuron.connections.length, fanout);
    assert.equal(new Set(neuron.connections.map(edge => edge.target)).size, fanout);
    assert.ok(neuron.connections.every(edge => edge.target >= 0 && edge.target < neurons && edge.target !== id));
  }
  const stimulus = { motive: .92, vision: .91, memory: .9, motor: .89, language: .88, body: .87 };
  for (let index = 0; index < 20; index++) brain.tick(stimulus);
  const frame = brain.frame();
  assert.ok(frame.recent > 0);
  assert.equal(frame.spikes.reduce((sum, value) => sum + value, 0), frame.recent);
  assert.equal(frame.total * fanout, frame.synapticEvents);
  assert.ok(Object.values(brain.readout()).some(value => value > .1));
});
