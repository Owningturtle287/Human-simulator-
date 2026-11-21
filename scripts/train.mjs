import { mkdir, writeFile } from 'node:fs/promises';
import { initialState, seedRandom, Simulation } from '../app/simulation.ts';
import { free, WATER_SPOTS } from '../app/space.ts';

function episode(seed, model) {
  const random = seedRandom(seed);
  const state = initialState();
  state.needs.hydration = .20 + random() * .19;
  const memoryPlace = WATER_SPOTS[Math.floor(random() * WATER_SPOTS.length)];
  state.memory = random() < .84 ? { place: memoryPlace, time: state.time - 600, certainty: .8 } : null;
  state.water = random() < .57 ? memoryPlace : WATER_SPOTS[Math.floor(random() * WATER_SPOTS.length)];
  for (let attempt = 0; attempt < 12; attempt++) {
    const sample = { x: -3.1 + random() * 6.1, z: -2.5 + random() * 5 };
    if (!free(sample)) continue;
    Object.assign(state.body, sample, { heading: random() * Math.PI * 2 });
    break;
  }
  const sim = new Simulation({ state, seed, language: random, model });
  for (let step = 0; step < 720; step++) {
    sim.step();
    if (state.thoughts.at(-1)?.kind === 'drink') return { solved: true, seconds: (step + 1) * .05, traces: sim.traces };
  }
  return { solved: false, seconds: 36, traces: sim.traces };
}

function fitting(rows) {
  const counts = new Map();
  for (const row of rows) {
    const key = row.place + ':' + row.basis;
    const values = counts.get(key) ?? { positive: 0, negative: 0 };
    if (row.success) values.positive++;
    else values.negative++;
    counts.set(key, values);
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { positive, negative }]) => [key, Number(((1 + positive) / (2 + positive + negative)).toFixed(5))]));
}

const batch = (amount, offset, model) => Array.from({ length: amount }, (_, index) => episode(offset + index * 31, model));
const training = batch(360, 1990).flatMap((run, episode) => run.traces.map(trace => ({ ...trace, episode })));
const model = { version: 1, probabilities: fitting(training), examples: training.length };
const baseline = batch(120, 93000);
const heldOut = batch(120, 93000, model);
const target = baseline.flatMap(run => run.traces);
const prior = { seen: .97, remembered: .8, unknown: .39 };
const mean = values => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const score = probability => mean(target.map(row => (Number(row.success) - probability(row)) ** 2));
const evaluate = runs => ({
  completed: runs.filter(run => run.solved).length,
  episodes: runs.length,
  meanSearchSeconds: Number(mean(runs.map(run => run.seconds)).toFixed(2)),
  meanChecks: Number(mean(runs.map(run => run.traces.length)).toFixed(2)),
});
const report = {
  trainingExamples: training.length, heldOutExamples: target.length,
  baselineBrier: Number(score(row => prior[row.basis]).toFixed(4)),
  learnedBrier: Number(score(row => model.probabilities[row.place + ':' + row.basis] ?? prior[row.basis]).toFixed(4)),
  baseline: evaluate(baseline),
  trained: evaluate(heldOut),
};
await mkdir('.training', { recursive: true });
await writeFile('.training/demonstrations.jsonl', training.map(trace => JSON.stringify(trace)).join('\n') + '\n');
await writeFile('.training/report.json', JSON.stringify(report, null, 2) + '\n');
await writeFile('public/model.json', JSON.stringify(model, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
