import { PRESETS } from '../app/atlas.ts';
import { NeuralNetwork } from '../app/neural.ts';
import { Simulation } from '../app/simulation.ts';

for (const [preset, info] of Object.entries(PRESETS)) {
  const startedAt = performance.now();
  const brain = new NeuralNetwork(preset);
  const initializedAt = performance.now();
  const sim = new Simulation({ seed: 42 });
  const times = [];
  let frame;
  for (let sample = 0; sample < 240; sample++) {
    const start = performance.now();
    const stimulus = sim.stimulus();
    brain.tick(stimulus);
    brain.tick(stimulus);
    sim.step(.05, brain.readout());
    if (sample % 2) frame = brain.frame();
    if (sample >= 40) times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  console.log(preset, {
    neurons: info.neurons, synapses: info.neurons * info.fanout,
    initializeMs: Math.round(initializedAt - startedAt),
    p95MsPer50msStep: Number(times[Math.floor(times.length * .95)].toFixed(2)),
    spikes: frame.total,
  });
}
