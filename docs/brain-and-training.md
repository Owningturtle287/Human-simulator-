# Brain anatomy and training

## Anatomy and physiology

The atlas comes from FreeSurfer’s fsaverage subject. The display includes the cerebral hemispheres, cerebellum, brainstem, and landmarks such as the hippocampi, thalami, amygdalae, and basal ganglia. The simulator separates 30 bilateral and midline populations. Cortical regions such as the prefrontal, visual, and sensorimotor populations are located approximately inside the atlas. The ventral diencephalon mesh gives anatomical context for the simulated hypothalamus.

Azevedo and colleagues estimated approximately 86 billion neurons in adult human brains, with roughly 19% in the cerebral cortex and most of the remainder in the cerebellum. The three broad buckets in this simulator follow that scale relationship. Allocations within the buckets and their projection patterns are design choices. Human Connectome Project imaging measures connections at the level of large fiber bundles. One nanoscale human cortical reconstruction covered about one cubic millimeter. Those datasets are useful at different scales and leave the whole individual human cell-to-cell wiring undetermined.

| Setting | Neurons | Directed synapses |
| --- | ---: | ---: |
| Standard | 24,576 | 294,912 |
| High | 65,536 | 1,048,576 |
| Maximum | 131,072 | 3,145,728 |

The browser worker simulates a leaky integrate-and-fire network with excitatory and inhibitory units, fixed thresholds, a refractory interval, and synthetic long-range and local wiring. Each update has a 25 ms model interval. Synapses transmit signed weights after one to three intervals. This coarse time resolution and the fixed wiring are computational choices for the browser. Inhibition ratios, individual-cell positions, time constants, and regional firing rates have yet to be validated against biological recordings.

The 3D view samples activity around regional landmarks. The grid and ID inspector use actual simulated cells and the latest firing window. When a source cell fires, every displayed outgoing edge queues a signal with the specified weight and delay. A highlighted target also fired during the same observation window. Synaptic transmission and a target spike can occur independently because each target integrates multiple signals.

## How the network participates in behavior

The environment advances in fixed steps. Internal needs, visible objects, motion, memory recall and reading supply inputs to the corresponding neural populations. Measured population activity feeds back into goal selection and walking speed. Explicit route planning and working memory keep the behavior traceable. The English journal is generated from the selected goal, retrieved memory and action outcome. Wording is sampled locally. It can describe a mistaken belief, such as expecting water at an empty counter, and then describe the resulting change in plan.

Walking and sitting use a skinned character rig. Reaching uses inverse kinematics. Movement uses collision-aware paths and authored clips. Training a physics-driven body from human motion remains a separate milestone.

## Training included in this version

`npm run train` runs the same simulation engine as the browser with fixed seeds and varied starting positions, headings and water locations. It collects example checks with the information Sam used (seen, remembered, or uncertain), location, and result. It estimates a smoothed success probability for each pair of location and evidence type. The browser uses these estimates to rank uncertain search targets and represent plan confidence.

The checked-in model uses 465 examples. On 120 held-out scenarios in the same apartment, both planners completed 120 searches. Prediction Brier score fell from 0.1599 to 0.1515 (lower is better). Mean search time was 7.08 seconds for the rule baseline and 7.13 seconds for the fitted model. The result supports better probability estimates in this test. A single apartment and a synthetic teacher provide a limited measure of generalization.

The command writes the model to `public/model.json`, action examples to `.training/demonstrations.jsonl`, and the metrics to `.training/report.json`. `npm run benchmark` times network generation and update steps for all three scales on the current machine.

## Next training stages

1. Collect human demonstrations in several apartment layouts, holding entire layouts and conditions out of training. Fit a skill-selection policy from the recorded observations and actions. Let the policy run in unfamiliar scenarios and collect human corrections at its errors.
2. Train a prediction model for changes in the world, including what can be seen or reached after moving and what happens when an action fails. Compare it with the current planner on goal completion, unnecessary checks, recovery and delayed recall.
3. Fit a separate controller for joint targets in a physics engine using licensed human motion data. Evaluate foot contact, falls, trajectory error, and reaching. Keep the same high-level skill interface for the browser app.
4. For greater anatomical fidelity, simulate a focused circuit at finer time resolution. Fit it against measured response data before expanding it. Treat regions, cell types, neural dynamics, and anatomical geometry as separate validation targets.

## Research

- [NIH NINDS, Know Your Brain](https://www.ninds.nih.gov/sites/default/files/2025-05/know-your-brain-brian-basics.pdf)
- [Azevedo et al., human brain neuronal counts](https://pubmed.ncbi.nlm.nih.gov/19226510/)
- [NIMH, Human Connectome Project](https://www.nimh.nih.gov/research/research-funded-by-nimh/research-initiatives/human-connectome-project-hcp)
- [Shapson-Coe et al., nanoscale human temporal cortex](https://research.google/pubs/a-connectomic-study-of-a-petascale-fragment-of-human-cerebral-cortex/)
- [Fischl et al., cortical surface registration](https://doi.org/10.1002/(SICI)1097-0193(1999)8:4%3C272::AID-HBM10%3E3.0.CO;2-4)
- [Fischl et al., whole-brain segmentation](https://doi.org/10.1016/S0896-6273(02)00569-X)
- [Ross et al., imitation learning with DAgger](https://proceedings.mlr.press/v15/ross11a.html)
- [Hafner et al., learning with world models](https://www.nature.com/articles/s41586-025-08744-2)
- [Peng et al., DeepMimic](https://xbpeng.github.io/projects/DeepMimic/index.html)
