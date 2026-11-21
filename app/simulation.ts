import { angleDifference, bearing, distance, findPath, free, PLACES, seesWater, WATER_SPOTS } from './space.ts';
import type { PlaceId, Point } from './space.ts';
import { speak } from './thoughts.ts';
import type { Thought, ThoughtKind } from './thoughts.ts';

export type Goal = 'drink' | 'eat' | 'rest' | 'read' | 'explore';
export type Pose = 'walking' | 'standing' | 'drinking' | 'eating' | 'sitting' | 'reading';
export type Basis = 'seen' | 'remembered' | 'unknown';
export type Body = Point & { heading: number; speed: number; pose: Pose; progress: number };
export type Needs = { hydration: number; nutrition: number; energy: number };
export type Belief = { place: PlaceId; time: number; certainty: number };
export type Drive = { motive: number; vision: number; memory: number; motor: number; language: number; body: number };
export type Plan = { goal: Goal; place: PlaceId; path: Point[]; tried: PlaceId[]; basis: Basis; confidence: number; phase: 'walk' | 'act'; elapsed: number };
export type Trace = { time: number; action: 'look_for_water'; place: PlaceId; basis: Basis; distance: number; success: boolean; hydration: number };
export type LearnedModel = { version: 1; probabilities: Record<string, number>; examples: number };
export type State = {
  version: 1;
  time: number;
  body: Body;
  needs: Needs;
  water: PlaceId;
  memory: Belief | null;
  plan: Plan | null;
  thoughts: Thought[];
  count: number;
  lastLeisure: PlaceId;
  lastRead: number;
  lastOutcome: string;
};
export const GOALS: Record<Goal, string> = { drink: 'Find water', eat: 'Have a snack', rest: 'Take a rest', read: 'Read the notebook', explore: 'Look around' };
export const clockTime = (seconds: number) => {
  const minutes = Math.floor(seconds / 60) % 1440;
  return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
};

const DURATION: Record<Goal, number> = { drink: 2.4, eat: 3.3, rest: 7.5, read: 6.0, explore: 2.4 };
const ACTION_POSE: Record<Goal, Pose> = { drink: 'drinking', eat: 'eating', rest: 'sitting', read: 'reading', explore: 'standing' };
const LEISURE: PlaceId[] = ['window', 'sofa', 'shelf', 'desk'];
const clamp = (n: number) => Math.max(0, Math.min(1, n));

export function initialState(): State {
  return {
    version: 1, time: 8 * 3600 + 10 * 60,
    body: { x: 1.12, z: 1.74, heading: -2.42, speed: 0, pose: 'standing', progress: 0 },
    needs: { hydration: 0.37, nutrition: 0.74, energy: 0.80 },
    water: 'kitchen', memory: { place: 'kitchen', time: 8 * 3600, certainty: 0.8 },
    plan: null, thoughts: [], count: 0, lastLeisure: 'sofa', lastRead: 0, lastOutcome: '',
  };
}

export function seedRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let bits = Math.imul(value ^ (value >>> 15), value | 1);
    bits ^= bits + Math.imul(bits ^ (bits >>> 7), bits | 61);
    return ((bits ^ (bits >>> 14)) >>> 0) / 4294967296;
  };
}

export class Simulation {
  state: State;
  traces: Trace[] = [];
  private visibleWater: PlaceId | null = null;
  private readonly random: () => number;
  private readonly model?: LearnedModel;
  private readonly language: () => number;
  private lastDecision = 0;

  constructor({ state, model, seed, language }: { state?: State; model?: LearnedModel; seed?: number; language?: () => number } = {}) {
    this.state = state ?? initialState();
    this.model = model;
    this.random = seed === undefined ? Math.random : seedRandom(seed);
    this.language = language ?? Math.random;
    if (this.state.thoughts.length === 0) this.think('wake');
  }

  moveWater(to?: PlaceId) {
    const previous = WATER_SPOTS.indexOf(this.state.water);
    this.state.water = to && WATER_SPOTS.includes(to) ? to : WATER_SPOTS[(previous + 1) % WATER_SPOTS.length];
    if (this.state.plan?.goal === 'drink' && this.state.plan.phase === 'act') {
      // A picked-up glass belongs to the body until the current action has finished.
      this.state.water = WATER_SPOTS[previous];
      return false;
    }
    return true;
  }

  private think(kind: ThoughtKind, place?: PlaceId, next?: PlaceId) {
    const state = this.state;
    let text = speak(kind, place, next, this.language);
    for (let attempts = 0; attempts < 3 && state.thoughts.slice(-3).some(thought => thought.text === text); attempts++) {
      text = speak(kind, place, next, this.language);
    }
    state.thoughts.push({ id: ++state.count, time: state.time, kind, text });
    if (state.thoughts.length > 32) state.thoughts.shift();
  }

  private probability(place: PlaceId, basis: Basis) {
    return this.model?.probabilities[place + ':' + basis]
      ?? (basis === 'seen' ? 0.97 : basis === 'remembered' ? this.state.memory?.certainty ?? 0.65 : 0.39);
  }

  private pickWater(tried: PlaceId[]) {
    if (this.visibleWater && !tried.includes(this.visibleWater)) return { place: this.visibleWater, basis: 'seen' as const };
    const memory = this.state.memory;
    if (memory && !tried.includes(memory.place)) return { place: memory.place, basis: 'remembered' as const };
    const candidates = WATER_SPOTS.filter(place => !tried.includes(place));
    if (!candidates.length) return null;
    const cost = (place: PlaceId) => distance(this.state.body, PLACES[place].stand) - this.probability(place, 'unknown') * 1.6;
    candidates.sort((a, b) => cost(a) - cost(b));
    return { place: candidates[0], basis: 'unknown' as const };
  }

  private target(goal: Goal, place: PlaceId, basis: Basis = 'unknown', tried: PlaceId[] = []) {
    this.state.plan = {
      goal, place, basis, tried, path: findPath(this.state.body, PLACES[place].stand),
      confidence: goal === 'drink' ? this.probability(place, basis) : 1, phase: 'walk', elapsed: 0,
    };
  }

  private decide(drive?: Drive) {
    const { needs, time } = this.state;
    const goals: [Goal, number][] = [
      ['drink', (0.61 - needs.hydration) * 2.10 + (drive?.motive ?? 0) * 0.12],
      ['eat', (0.57 - needs.nutrition) * 1.97 + (drive?.body ?? 0) * 0.06],
      ['rest', (0.64 - needs.energy) * 2.08 + (drive?.body ?? 0) * 0.10],
      ['read', time - this.state.lastRead > 520 ? 0.12 + this.random() * 0.06 + (drive?.language ?? 0) * 0.08 : 0.045],
      ['explore', 0.10 + this.random() * 0.05 + (drive?.vision ?? 0) * 0.08],
    ];
    goals.sort((a, b) => b[1] - a[1]);
    const goal = goals[0][0];
    if (goal === 'drink') {
      const choice = this.pickWater([]);
      if (choice) {
        this.target(goal, choice.place, choice.basis);
        this.think(choice.basis === 'remembered' ? 'recall' : 'search', choice.place);
      }
    } else if (goal === 'explore') {
      const candidates = LEISURE.filter(place => place !== this.state.lastLeisure && distance(this.state.body, PLACES[place].stand) > 0.6);
      const place = candidates[Math.floor(this.random() * candidates.length)] ?? 'window';
      this.state.lastLeisure = place;
      this.target(goal, place);
      this.think('explore', place);
    } else {
      const place = goal === 'eat' ? 'kitchen' : goal === 'rest' ? 'bed' : 'desk';
      this.target(goal, place);
      this.think(goal === 'eat' ? 'food' : goal, place);
    }
  }

  private arrive(plan: Plan) {
    const state = this.state;
    if (plan.goal === 'drink') {
      // Looking at an accessible surface is an observation, including finding it empty.
      const success = this.visibleWater === plan.place;
      this.traces.push({
        time: state.time, action: 'look_for_water', place: plan.place, basis: plan.basis,
        distance: distance(state.body, PLACES[plan.place].look), success, hydration: state.needs.hydration,
      });
      if (this.traces.length > 1000) this.traces.shift();
      if (!success) {
        if (state.memory?.place === plan.place) state.memory = null;
        const tried = [...plan.tried, plan.place];
        const next = this.pickWater(tried);
        if (next) {
          this.target('drink', next.place, next.basis, tried);
          state.lastOutcome = 'Expected the glass at ' + PLACES[plan.place].label + '. The surface was empty.';
          this.think('miss', plan.place, next.place);
        } else {
          state.plan = null;
        }
        return;
      }
    }
    plan.phase = 'act';
    if (plan.goal === 'read') this.think('reading', plan.place);
    if (plan.goal === 'explore') this.think('arrive', plan.place);
  }

  step(dt = 0.05, drive?: Drive) {
    const state = this.state;
    const { body, needs } = state;
    state.time += dt * 13;
    needs.hydration = clamp(needs.hydration - dt * (0.012 + body.speed * 0.001));
    needs.nutrition = clamp(needs.nutrition - dt * 0.0060);
    needs.energy = clamp(needs.energy - dt * (0.0042 + body.speed * 0.0017));

    const previouslyVisible = this.visibleWater;
    this.visibleWater = seesWater(body, body.heading, state.water) ? state.water : null;
    if (this.visibleWater) {
      const changed = state.memory?.place !== this.visibleWater;
      state.memory = { place: this.visibleWater, time: state.time, certainty: 0.98 };
      if (changed && previouslyVisible !== this.visibleWater && state.plan?.goal === 'drink') {
        this.think('notice', this.visibleWater);
        if (state.plan.phase === 'walk' && state.plan.place !== this.visibleWater) {
          this.target('drink', this.visibleWater, 'seen', state.plan.tried);
        }
      }
    } else if (state.memory) {
      state.memory.certainty = Math.max(0.33, state.memory.certainty - dt * 0.007);
    }
    this.lastDecision += dt;
    if (!state.plan && this.lastDecision > 0.2) {
      this.decide(drive);
      this.lastDecision = 0;
    }
    const plan = state.plan;
    if (!plan) return;
    body.progress = 0;
    const waypoint = plan.path[0];
    if (plan.phase === 'walk') {
      body.pose = 'standing';
      const look = waypoint ?? PLACES[plan.place].look;
      const adjustment = angleDifference(body.heading, bearing(body, look));
      body.heading += Math.max(-dt * 3.5, Math.min(dt * 3.5, adjustment));
      if (!waypoint && Math.abs(adjustment) < 0.23) {
        body.speed = 0;
        this.arrive(plan);
      } else if (waypoint && Math.abs(adjustment) < 1.30) {
        const length = distance(body, waypoint);
        const speed = 1.30 + (drive?.motor ?? 0) * 0.16 - (1 - needs.energy) * 0.21;
        const advance = Math.min(1, dt * speed / Math.max(length, 0.001));
        body.x += (waypoint.x - body.x) * advance;
        body.z += (waypoint.z - body.z) * advance;
        body.speed = speed;
        body.pose = 'walking';
        if (length < 0.075) plan.path.shift();
      } else {
        body.speed = 0;
      }
      return;
    }

    body.speed = 0;
    body.pose = ACTION_POSE[plan.goal];
    plan.elapsed += dt;
    body.progress = clamp(plan.elapsed / DURATION[plan.goal]);
    if (plan.goal === 'rest') needs.energy = clamp(needs.energy + dt * 0.075);
    if (plan.elapsed < DURATION[plan.goal]) return;
    if (plan.goal === 'drink') {
      needs.hydration = clamp(needs.hydration + 0.67);
      state.memory = { place: state.water, time: state.time, certainty: 1 };
      state.lastOutcome = 'Drank water at ' + PLACES[state.water].label + '.';
      this.think('drink', state.water);
    } else if (plan.goal === 'eat') {
      needs.nutrition = clamp(needs.nutrition + 0.65);
      state.lastOutcome = 'Ate an apple. Hunger eased.';
      this.think('eat');
    } else if (plan.goal === 'rest') {
      state.lastOutcome = 'Sat down until energy recovered.';
      this.think('rested');
    } else if (plan.goal === 'read') {
      state.lastRead = state.time;
      state.lastOutcome = 'Read a page of the notebook.';
    }
    body.pose = 'standing';
    body.progress = 0;
    state.plan = null;
    this.lastDecision = 0;
  }

  stimulus(): Drive {
    return {
      motive: Math.max(1 - this.state.needs.hydration, 1 - this.state.needs.nutrition) * 0.95,
      vision: this.visibleWater ? 0.85 : this.state.body.pose === 'walking' ? 0.54 : 0.22,
      memory: this.state.plan?.basis === 'remembered' ? 0.9 : this.state.memory ? 0.42 : 0.15,
      motor: this.state.body.pose === 'walking' ? 0.9 : this.state.plan?.phase === 'act' ? 0.53 : 0.17,
      language: this.state.body.pose === 'reading' ? 0.92 : this.state.plan?.elapsed === 0 ? 0.58 : 0.23,
      body: 1 - this.state.needs.energy * 0.65,
    };
  }
}

export function importState(value: unknown): State {
  if (!value || typeof value !== 'object') throw new Error('Choose a Human Simulator save.');
  const input = value as Partial<State>;
  const body = input.body;
  const needs = input.needs;
  const validPoint = (point: unknown): point is Point => {
    if (!point || typeof point !== 'object') return false;
    const { x, z } = point as Point;
    return Number.isFinite(x) && Number.isFinite(z) && free({ x, z });
  };
  const validPlace = (place: unknown): place is PlaceId => typeof place === 'string' && Object.hasOwn(PLACES, place);
  if (input.version !== 1 || !body || !needs || !validPoint(body)
      || ![body.heading, input.time].every(Number.isFinite)
      || ![needs.hydration, needs.nutrition, needs.energy].every(n => Number.isFinite(n) && n >= 0 && n <= 1)
      || !WATER_SPOTS.includes(input.water as PlaceId)) throw new Error('This save is invalid or uses a different version.');

  const state = initialState();
  state.time = Math.max(0, Math.min(input.time!, 1e12));
  state.body = { ...state.body, x: body.x, z: body.z, heading: body.heading % (Math.PI * 2) };
  state.needs = { hydration: needs.hydration, nutrition: needs.nutrition, energy: needs.energy };
  state.water = input.water!;
  const memory = input.memory;
  state.memory = memory && validPlace(memory.place) && WATER_SPOTS.includes(memory.place) && Number.isFinite(memory.time) && Number.isFinite(memory.certainty)
    ? { place: memory.place, time: memory.time, certainty: clamp(memory.certainty) } : null;
  state.lastLeisure = validPlace(input.lastLeisure) ? input.lastLeisure : state.lastLeisure;
  state.lastRead = Number.isFinite(input.lastRead) ? input.lastRead! : 0;
  state.lastOutcome = typeof input.lastOutcome === 'string' ? input.lastOutcome.slice(0, 240) : '';
  if (Array.isArray(input.thoughts)) {
    state.thoughts = input.thoughts.slice(-32).filter(thought => thought && typeof thought.text === 'string' && Number.isFinite(thought.time))
      .map((thought, index) => ({ id: index + 1, time: thought.time, kind: thought.kind, text: thought.text.slice(0, 260) }));
    state.count = state.thoughts.length;
  }
  const plan = input.plan;
  if (plan && Object.hasOwn(GOALS, plan.goal) && validPlace(plan.place) && Array.isArray(plan.path) && plan.path.length < 100
      && plan.path.every(validPoint) && Array.isArray(plan.tried) && plan.tried.every(place => WATER_SPOTS.includes(place))
      && ['seen', 'remembered', 'unknown'].includes(plan.basis) && ['walk', 'act'].includes(plan.phase)
      && Number.isFinite(plan.elapsed) && Number.isFinite(plan.confidence)) {
    state.plan = {
      goal: plan.goal, place: plan.place, path: plan.phase === 'walk' ? findPath(state.body, PLACES[plan.place].stand) : [],
      basis: plan.basis, tried: plan.tried.slice(0, 3), confidence: clamp(plan.confidence),
      phase: plan.phase, elapsed: Math.max(0, Math.min(DURATION[plan.goal], plan.elapsed)),
    };
  }
  return state;
}
