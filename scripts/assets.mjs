import './icons.mjs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rename, stat } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMaterialsSpecular, KHRMeshQuantization, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const sources = {
  avatar: {
    url: 'https://files.innerscene.com/library/locomotion-collection-sam-3d-person-animated-dc23800f/735aec6a564c1def48e8/locomotion-collection-sam-3d-person-animated.glb',
    sha256: 'b29700eeba1607d879f85f0a93a58ad458d5397ec509226826b0868b2ce40777',
  },
  brain: {
    url: 'https://raw.githubusercontent.com/takuhironishimura/Brain_Model/1e30bf3beba09a4672913991dab612b3090d0bf2/brain.glb',
    sha256: 'e68797921f2aee77d0de39f8df752ec8266168cd03cad17f429f6deda393ac9d',
  },
};

await mkdir('.asset-cache', { recursive: true });
await mkdir('public/assets', { recursive: true });

async function download(name, { sha256, url }) {
  const path = '.asset-cache/' + name + '.glb';
  const existing = await readFile(path).catch(() => null);
  if (existing && createHash('sha256').update(existing).digest('hex') === sha256) return path;
  const local = name + '-source.glb';
  const input = await stat(local).then(() => local).catch(() => null);
  const pending = path + '.download';
  if (input) {
    await copyFile(input, pending);
  } else {
    execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2',
      '--max-time', '90', url, '--output', pending], { stdio: 'inherit' });
  }
  const bytes = await readFile(pending);
  if (createHash('sha256').update(bytes).digest('hex') !== sha256) throw new Error(name + ' source checksum does not match');
  await rename(pending, path);
  return path;
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions([KHRMaterialsSpecular, KHRMeshQuantization, EXTMeshoptCompression, EXTTextureWebP])
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const [avatarPath, brainPath] = await Promise.all(Object.entries(sources).map(([name, spec]) => download(name, spec)));
const avatar = await io.read(avatarPath);
const clips = new Set(['Idle_Standing', 'Walk_Relaxed', 'Walk_Brisk', 'Sit_Stand']);
for (const clip of avatar.getRoot().listAnimations()) if (!clips.has(clip.getName())) clip.dispose();
for (const node of avatar.getRoot().listNodes()) if (node.getName() === 'Phone') node.dispose();
await avatar.transform(dedup(), prune(), textureCompress({ encoder: sharp, resize: [768, 768], quality: 83, targetFormat: 'webp' }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write('public/assets/person.glb', avatar);
const brain = await io.read(brainPath);
await brain.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write('public/assets/brain.glb', brain);
for (const name of ['person', 'brain']) console.log(name + ' · ' + ((await stat('public/assets/' + name + '.glb')).size / 1048576).toFixed(2) + ' MB');
