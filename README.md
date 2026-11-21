# Human Simulator

Watch Sam live in a 3D apartment, read his inner monologue, and inspect the spiking network that contributes to his decisions and movement. The simulator is designed for iPhone and runs locally in the browser.

## Use it on iPhone

1. Open the GitHub Pages URL shown in the successful **Build and deploy** workflow.
2. In Safari, tap **Share**, then **Add to Home Screen**. Turn on **Open as Web App** and tap **Add**.
3. On **World**, try **Move water** while Sam is walking toward it. **Journal** shows what Sam remembered and how the search turned out. **Brain** lets you rotate the atlas, choose a region, and inspect any neuron by ID.
4. **Settings** has JSON save export and import. The site autosaves on the current device and pauses when hidden. Once the site has finished precaching, it can reopen offline.

## Run it locally

Use Node.js 22.18 or newer and curl. The asset step fetches, verifies, and optimizes two pinned source models.

```sh
npm ci
npm run assets
npm run dev
```

```sh
npm test
npm run train
npm run benchmark
npm run build
npm run preview
```

The source avatars and anatomical meshes are fetched at build time. The published app serves its files locally from the same site. See [asset credits and terms](docs/assets.md).

## Publish to GitHub Pages

In the repository’s **Settings → Pages**, set **Source** to **GitHub Actions**. Run **Build and deploy** from the **Actions** tab, or push to `main`. The workflow checks the simulation, produces a reusable site build, and publishes it once Pages is enabled.

## What this version models

- A collision-aware apartment, skinned 3D movement, basic internal needs, limited vision, remembered object locations, and recovery when a plan fails.
- A 30-population spiking network with up to **131,072 neurons** and **3,145,728 directed synapses**. The atlas shows the actual anatomical surface shape. The positions and connections of simulated cells are synthetic. The 3D map samples activity and the inspector exposes every cell.
- A randomized, local English renderer tied to the agent’s decisions and their outcomes, plus a reproducible model trained to estimate the chance of finding water.

[Anatomy, training, evaluation, and next steps](docs/brain-and-training.md)
