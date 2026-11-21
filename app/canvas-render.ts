import * as T from 'three';

type Texture = { data: Uint8ClampedArray; width: number; height: number };
const textures = new WeakMap<T.Texture, Texture>();
const light = new T.Vector3(.34, .78, .53).normalize();

function imageData(map?: T.Texture | null) {
  if (!map) return undefined;
  if (textures.has(map)) return textures.get(map);
  const image = map.image;
  if (!(image instanceof HTMLCanvasElement)) return undefined;
  const context = image.getContext('2d');
  if (!context) return undefined;
  const { width, height } = image;
  const result = { data: context.getImageData(0, 0, width, height).data, width, height };
  textures.set(map, result);
  return result;
}

export function sizeCanvas(canvas: HTMLCanvasElement, viewport: HTMLElement, maxWidth = 820) {
  const ratio = Math.min(1.3, maxWidth / Math.max(1, viewport.clientWidth));
  const width = Math.round(viewport.clientWidth * ratio);
  const height = Math.round(viewport.clientHeight * ratio);
  if (!width || !height || (width === canvas.width && height === canvas.height)) return false;
  canvas.width = width;
  canvas.height = height;
  return true;
}

export function project(point: T.Vector3, camera: T.Camera, width: number, height: number) {
  const p = point.clone().project(camera);
  return { x: (p.x + 1) * .5 * width, y: (1 - p.y) * .5 * height };
}

// Orthographic CPU rasterizer used only when a browser cannot create a WebGL context.
// Static geometry is rendered once, with live characters and spikes composited above it.
export function renderScene(canvas: HTMLCanvasElement, scene: T.Object3D, camera: T.OrthographicCamera, background: number) {
  const { width, height } = canvas;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(width, height);
  const rgba = pixels.data;
  const depth = new Float32Array(width * height).fill(Infinity);
  const normal = new T.Vector3();
  const view = new T.Matrix4();
  camera.updateMatrixWorld();
  scene.updateMatrixWorld(true);

  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = background >> 16 & 255;
    rgba[index + 1] = background >> 8 & 255;
    rgba[index + 2] = background & 255;
    rgba[index + 3] = 255;
  }

  scene.traverseVisible(object => {
    if (!(object instanceof T.Mesh) || Array.isArray(object.material)) return;
    const material = object.material as T.MeshStandardMaterial;
    if (!material.color) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const indices = geometry.getIndex();
    const count = indices?.count ?? position.count;
    const color = material.color.getHex(T.SRGBColorSpace);
    const rgb = [color >> 16 & 255, color >> 8 & 255, color & 255];
    const tex = imageData(material.map);
    const basis = new T.Matrix3().getNormalMatrix(object.matrixWorld);
    view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(object.matrixWorld);
    const elements = view.elements;
    const coords = new Float32Array(position.count * 3);
    for (let vertex = 0; vertex < position.count; vertex++) {
      const x = position.getX(vertex), y = position.getY(vertex), z = position.getZ(vertex);
      const offset = vertex * 3;
      coords[offset] = (1 + elements[0] * x + elements[4] * y + elements[8] * z + elements[12]) * width / 2;
      coords[offset + 1] = (1 - elements[1] * x - elements[5] * y - elements[9] * z - elements[13]) * height / 2;
      coords[offset + 2] = elements[2] * x + elements[6] * y + elements[10] * z + elements[14];
    }
    for (let face = 0; face + 2 < count; face += 3) {
      const a = indices ? indices.getX(face) : face;
      const b = indices ? indices.getX(face + 1) : face + 1;
      const c = indices ? indices.getX(face + 2) : face + 2;
      const ax = coords[a * 3], ay = coords[a * 3 + 1], az = coords[a * 3 + 2];
      const bx = coords[b * 3], by = coords[b * 3 + 1], bz = coords[b * 3 + 2];
      const cx = coords[c * 3], cy = coords[c * 3 + 1], cz = coords[c * 3 + 2];
      const firstX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
      const lastX = Math.min(width - 1, Math.ceil(Math.max(ax, bx, cx)));
      const firstY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
      const lastY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
      const determinant = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(determinant) < .001 || firstX > lastX || firstY > lastY) continue;
      let brightness = 1;
      if (normals && !(material instanceof T.MeshBasicMaterial)) {
        normal.set(normals.getX(a) + normals.getX(b) + normals.getX(c), normals.getY(a) + normals.getY(b) + normals.getY(c), normals.getZ(a) + normals.getZ(b) + normals.getZ(c)).applyNormalMatrix(basis);
        brightness = .72 + Math.max(0, normal.dot(light)) * .39;
      }
      const hasTexture = Boolean(tex && uv);
      const ua = hasTexture ? uv.getX(a) : 0, va = hasTexture ? uv.getY(a) : 0;
      const ub = hasTexture ? uv.getX(b) : 0, vb = hasTexture ? uv.getY(b) : 0;
      const uc = hasTexture ? uv.getX(c) : 0, vc = hasTexture ? uv.getY(c) : 0;
      for (let y = firstY; y <= lastY; y++) {
        for (let x = firstX; x <= lastX; x++) {
          const u = ((by - cy) * (x + .5 - cx) + (cx - bx) * (y + .5 - cy)) / determinant;
          const v = ((cy - ay) * (x + .5 - cx) + (ax - cx) * (y + .5 - cy)) / determinant;
          const w = 1 - u - v;
          if (u < -.0001 || v < -.0001 || w < -.0001) continue;
          const z = u * az + v * bz + w * cz;
          const pixel = y * width + x;
          if (z >= depth[pixel]) continue;
          depth[pixel] = z;
          const index = pixel * 4;
          if (tex && hasTexture) {
            const s = Math.max(0, Math.min(tex.width - 1, Math.floor((u * ua + v * ub + w * uc) * tex.width)));
            const t = Math.max(0, Math.min(tex.height - 1, Math.floor((1 - u * va - v * vb - w * vc) * tex.height)));
            const begin = (t * tex.width + s) * 4;
            rgba[index] = tex.data[begin] * brightness * rgb[0] / 255;
            rgba[index + 1] = tex.data[begin + 1] * brightness * rgb[1] / 255;
            rgba[index + 2] = tex.data[begin + 2] * brightness * rgb[2] / 255;
          } else {
            rgba[index] = rgb[0] * brightness;
            rgba[index + 1] = rgb[1] * brightness;
            rgba[index + 2] = rgb[2] * brightness;
          }
        }
      }
    }
  });
  context.putImageData(pixels, 0, 0);
}
