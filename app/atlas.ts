export type Channel = 'motive' | 'vision' | 'memory' | 'motor' | 'language' | 'body' | 'association';
type RegionDefinition = {
  key: string; name: string; share: number; bilateral: boolean; channel: Channel; note: string;
  position: readonly [number, number, number]; color: string;
};

// Approximate regional allocation, not a cellular human atlas. Positions are relative to the anatomical shell.
const REGIONS: RegionDefinition[] = [
  { key: 'prefrontal', name: 'Prefrontal cortex', share: 3.2, bilateral: true, channel: 'association', note: 'Maintains goals and combines signals from other systems.', position: [0.40, 0.35, 0.74], color: '#ffd391' },
  { key: 'motor', name: 'Motor cortex', share: 1.8, bilateral: true, channel: 'motor', note: 'Contributes to preparing and executing voluntary movement.', position: [0.42, 0.56, 0.17], color: '#ffb885' },
  { key: 'somatic', name: 'Somatosensory cortex', share: 1.5, bilateral: true, channel: 'body', note: 'Represents touch and the position of the body.', position: [0.43, 0.54, -0.02], color: '#ffc0b7' },
  { key: 'parietal', name: 'Parietal association cortex', share: 1.9, bilateral: true, channel: 'vision', note: 'Integrates spatial attention with information from multiple senses.', position: [0.46, 0.48, -0.36], color: '#b8b1fc' },
  { key: 'auditory', name: 'Auditory cortex', share: 1.1, bilateral: true, channel: 'language', note: 'Processes sound, including the acoustic features of speech.', position: [0.64, 0.04, 0.02], color: '#b8d9ff' },
  { key: 'temporal', name: 'Temporal association cortex', share: 2.8, bilateral: true, channel: 'language', note: 'Helps recognize objects and interpret language and meaning.', position: [0.53, -0.11, 0.22], color: '#a8c3fb' },
  { key: 'visual', name: 'Occipital visual cortex', share: 4.9, bilateral: true, channel: 'vision', note: 'Processes visual features and passes them to other cortical areas.', position: [0.33, 0.20, -0.72], color: '#c6b2ff' },
  { key: 'cingulate', name: 'Cingulate cortex', share: 1.0, bilateral: true, channel: 'motive', note: 'Participates in attention, effort, and evaluation of actions.', position: [0.08, 0.24, 0.34], color: '#ffc890' },
  { key: 'insula', name: 'Insular cortex', share: 0.8, bilateral: true, channel: 'body', note: 'Integrates signals from inside the body with other sensory information.', position: [0.38, -0.03, 0.13], color: '#ffdca6' },
  { key: 'hippocampus', name: 'Hippocampus', share: 0.26, bilateral: true, channel: 'memory', note: 'Supports forming episodic memories and mapping places.', position: [0.33, -0.21, -0.14], color: '#f9d87a' },
  { key: 'thalamus', name: 'Thalamus', share: 0.24, bilateral: true, channel: 'vision', note: 'Relays and modulates information reaching the cortex.', position: [0.17, -0.05, -0.07], color: '#a9c8fb' },
  { key: 'ganglia', name: 'Basal ganglia', share: 0.24, bilateral: true, channel: 'motor', note: 'Participates in choosing actions and learning from outcomes.', position: [0.25, -0.02, 0.22], color: '#ffb99b' },
  { key: 'amygdala', name: 'Amygdala', share: 0.12, bilateral: true, channel: 'motive', note: 'Participates in evaluating the significance of events.', position: [0.34, -0.22, 0.18], color: '#ffa99a' },
  { key: 'hypothalamus', name: 'Hypothalamus', share: 0.12, bilateral: false, channel: 'motive', note: 'Regulates internal states including thirst and hunger.', position: [0, -0.21, 0.16], color: '#ffd38d' },
  { key: 'brainstem', name: 'Brainstem', share: 0.22, bilateral: false, channel: 'body', note: 'Carries sensorimotor signals and helps regulate arousal and vital functions.', position: [0, -0.48, -0.10], color: '#8cdec8' },
  { key: 'cerebellum', name: 'Cerebellum', share: 79.8, bilateral: true, channel: 'motor', note: 'Supports movement timing, coordination, and error correction.', position: [0.40, -0.39, -0.48], color: '#9fdec9' },
];

export type Region = RegionDefinition & {
  id: string; side: 'L' | 'R' | 'midline'; from: number; to: number; count: number; index: number;
};

export function makeRegions(total: number): Region[] {
  let from = 0;
  let cumulativeShare = 0;
  return REGIONS.flatMap(definition => {
    const sides: Region['side'][] = definition.bilateral ? ['L', 'R'] : ['midline'];
    const share = definition.share / sides.length;
    return sides.map(side => {
      cumulativeShare += share;
      const to = Math.min(total, Math.round(total * cumulativeShare / 100));
      const region: Region = {
        ...definition, share, side, id: definition.key + '-' + side,
        position: [definition.position[0] * (side === 'L' ? -1 : 1), definition.position[1], definition.position[2]],
        from, to, count: to - from, index: 0,
      };
      from = to;
      return region;
    });
  }).map((region, index) => ({ ...region, index }));
}

export const LINKS: Readonly<Record<string, readonly string[]>> = {
  prefrontal: ['parietal', 'temporal', 'cingulate', 'ganglia', 'thalamus', 'motor', 'hippocampus'],
  motor: ['somatic', 'ganglia', 'thalamus', 'cerebellum', 'brainstem'],
  somatic: ['motor', 'parietal', 'thalamus', 'insula'],
  parietal: ['visual', 'somatic', 'prefrontal', 'temporal', 'motor'],
  auditory: ['temporal', 'thalamus', 'prefrontal'],
  temporal: ['auditory', 'visual', 'hippocampus', 'prefrontal', 'amygdala', 'parietal'],
  visual: ['thalamus', 'parietal', 'temporal'],
  cingulate: ['prefrontal', 'insula', 'hypothalamus', 'amygdala', 'hippocampus'],
  insula: ['somatic', 'cingulate', 'hypothalamus', 'amygdala'],
  hippocampus: ['temporal', 'cingulate', 'prefrontal', 'amygdala'],
  thalamus: ['visual', 'auditory', 'somatic', 'prefrontal', 'motor', 'ganglia'],
  ganglia: ['thalamus', 'motor', 'prefrontal', 'brainstem'],
  amygdala: ['hippocampus', 'insula', 'hypothalamus', 'cingulate', 'temporal'],
  hypothalamus: ['brainstem', 'insula', 'cingulate', 'thalamus'],
  brainstem: ['thalamus', 'hypothalamus', 'cerebellum', 'motor'],
  cerebellum: ['thalamus', 'brainstem', 'motor', 'somatic'],
};

export const PRESETS = {
  standard: { label: 'Standard', neurons: 24_576, fanout: 12 },
  high: { label: 'High', neurons: 65_536, fanout: 16 },
  maximum: { label: 'Maximum', neurons: 131_072, fanout: 24 },
} as const;
export type Preset = keyof typeof PRESETS;
