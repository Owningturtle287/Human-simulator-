import * as T from 'three';
import { PLACES, ROOM } from './space.ts';
import { seedRandom } from './simulation.ts';

const mat = (color: number, roughness = 0.72, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
const oak = mat(0xb88b63);
const walnut = mat(0x6c4631);
const oakEdge = mat(0xa98762);
const linen = mat(0xe4dbc5, 0.96);
const white = mat(0xf3e9d7);
const sage = mat(0x52665b, 0.92);
const terra = mat(0xa0664b, 0.88);
const ink = mat(0x303a37);
const brass = mat(0xb59157, 0.32, 0.57);
const steel = mat(0x9daba2, 0.28, 0.56);
const wall = mat(0xede5d4, 0.91);
const leafMats = [mat(0x4f684b), mat(0x6e8361), mat(0x375341), mat(0x808b62)];
const fabricColors = [0xd1b29a, 0xb88566, 0xd5c0a2, 0x586a62, 0x8e765a].map(color => mat(color, 0.97));

function mesh(parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) {
  const object = new T.Mesh(geometry, material);
  object.position.set(x, y, z);
  object.castShadow = true;
  object.receiveShadow = true;
  parent.add(object);
  return object;
}

function box(parent: T.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, material: T.Material) {
  return mesh(parent, new T.BoxGeometry(width, height, depth), material, x, y, z);
}

function cylinder(parent: T.Object3D, x: number, y: number, z: number, top: number, bottom: number, height: number, material: T.Material) {
  return mesh(parent, new T.CylinderGeometry(top, bottom, height, 24), material, x, y, z);
}

function oval(parent: T.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, material: T.Material) {
  const object = mesh(parent, new T.SphereGeometry(1, 16, 10), material, x, y, z);
  object.scale.set(width, height, depth);
  return object;
}

function group(parent: T.Object3D, x: number, y: number, z: number) {
  const object = new T.Group();
  object.position.set(x, y, z);
  parent.add(object);
  return object;
}

function texture(draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void, size = 768) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d')!;
  draw(context, size, size);
  const value = new T.CanvasTexture(canvas);
  value.colorSpace = T.SRGBColorSpace;
  value.wrapS = T.RepeatWrapping;
  value.wrapT = T.RepeatWrapping;
  value.anisotropy = 8;
  return value;
}

function floorTexture() {
  return texture((context, width, height) => {
    const random = seedRandom(192);
    context.fillStyle = '#4b332a';
    context.fillRect(0, 0, width, height);
    const rows = 18;
    const rowSize = height / rows;
    for (let row = 0; row < rows; row++) {
      for (let x = -180 + (row % 3) * 66; x < width; x += 193) {
        const y = row * rowSize;
        const shade = Math.floor(random() * 16);
        const wood = 'rgb(' + (161 + shade) + ' ' + (117 + shade) + ' ' + (81 + shade) + ')';
        context.fillStyle = wood;
        context.fillRect(x + 0.5, y + 0.7, 192, rowSize - 1);
        context.save();
        context.beginPath();
        context.rect(x + 1, y + 1, 191, rowSize - 2);
        context.clip();
        for (let grain = 0; grain < 28; grain++) {
          const start = y + random() * rowSize;
          context.strokeStyle = grain % 4 === 0 ? 'rgba(245,223,185,.15)' : 'rgba(70,41,28,.14)';
          context.lineWidth = 0.35 + random() * 1.1;
          context.beginPath();
          context.moveTo(x, start);
          context.bezierCurveTo(x + 35, start + (random() - 0.5) * 5, x + 99, start + (random() - 0.5) * 6, x + 193, start);
          context.stroke();
        }
        if (random() < .24) {
          const point = x + random() * 150;
          context.strokeStyle = 'rgba(79,48,32,.19)';
          context.beginPath();
          context.ellipse(point, y + rowSize / 2, 8 + random() * 13, 2.1, 0.09, 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
        context.fillStyle = 'rgba(255,236,205,.19)';
        context.fillRect(x + 2, y + 1, 190, .75);
      }
    }
  }, 1024);
}

function fabricTexture(color: string, accent: string, border = false) {
  return texture((context, width, height) => {
    const random = seedRandom(837);
    context.fillStyle = color;
    context.fillRect(0, 0, width, height);
    for (let y = 1; y < height; y += 2) {
      context.fillStyle = random() > 0.5 ? 'rgba(255,250,232,.11)' : 'rgba(43,39,35,.11)';
      context.fillRect(0, y, width, 1);
    }
    for (let x = 1; x < width; x += 3) {
      context.fillStyle = random() > .5 ? 'rgba(255,247,221,.08)' : 'rgba(29,29,25,.09)';
      context.fillRect(x, 0, 1, height);
    }
    if (border) {
      context.strokeStyle = accent;
      context.lineWidth = 6;
      context.strokeRect(25, 25, width - 50, height - 50);
      context.lineWidth = 2;
      context.strokeRect(38, 38, width - 76, height - 76);
    }
  }, 512);
}

function outsideTexture() {
  return texture((context, width, height) => {
    const random = seedRandom(673);
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, '#b4c7c7');
    gradient.addColorStop(.65, '#e8dfc5');
    gradient.addColorStop(1, '#aeb092');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.fillStyle = 'rgba(88,100,82,.20)';
    for (let i = 0; i < 25; i++) {
      const x = random() * width;
      const y = height * (.75 + random() * .35);
      const size = width * (.045 + random() * .115);
      context.beginPath();
      context.ellipse(x, y, size * .5, size * (1.0 + random()), 0, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function plant(parent: T.Object3D, x: number, y: number, z: number, scale = 1) {
  const object = group(parent, x, y, z);
  object.scale.setScalar(scale);
  cylinder(object, 0, .12, 0, .18, .14, .24, terra);
  cylinder(object, 0, .243, 0, .153, .148, .01, walnut);
  const random = seedRandom(430);
  for (let i = 0; i < 9; i++) {
    const angle = i * 2.40;
    const reach = .15 + random() * .16;
    const height = .3 + random() * .39;
    const end = new T.Vector3(Math.cos(angle) * reach, .24 + height, Math.sin(angle) * reach);
    const stem = cylinder(object, 0, 0, 0, .008, .013, end.clone().sub(new T.Vector3(0, .24, 0)).length(), leafMats[2]);
    stem.position.copy(end.clone().lerp(new T.Vector3(0, .24, 0), .5));
    stem.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), end.clone().sub(new T.Vector3(0, .24, 0)).normalize());
    for (const side of [-1, 1]) {
      const leaf = oval(object, end.x + Math.cos(angle + side) * .065, end.y, end.z + Math.sin(angle + side) * .065, .12, .026, .061, leafMats[i % leafMats.length]);
      leaf.rotation.set(side * .5, -angle - side * .7, side * .25);
    }
  }
}

function book(parent: T.Object3D, x: number, y: number, z: number, width: number, depth: number, color: T.Material) {
  const item = group(parent, x, y, z);
  box(item, 0, .018, 0, width, .031, depth, linen);
  box(item, 0, .038, 0, width + .014, .011, depth + .013, color);
  box(item, 0, .003, 0, width + .014, .010, depth + .013, color);
  box(item, -width / 2, .019, 0, .010, .038, depth + .014, color);
  return item;
}

function picture(parent: T.Object3D, x: number, y: number, z: number, width: number, height: number, sideways = false) {
  const frame = group(parent, x, y, z);
  if (sideways) frame.rotation.y = Math.PI / 2;
  box(frame, 0, 0, 0, width, height, .035, walnut);
  box(frame, 0, 0, .021, width - .033, height - .033, .014, white);
  box(frame, 0, 0, .030, width - .13, height - .13, .012, fabricColors[0]);
  const sun = oval(frame, .08, .12, .04, .10, .10, .005, fabricColors[1]);
  sun.castShadow = false;
  box(frame, -.07, -.13, .040, width * .44, height * .20, .012, sage).rotation.z = .18;
  box(frame, .09, -.17, .045, width * .40, height * .12, .012, terra).rotation.z = -.18;
}

function addWalls(parent: T.Object3D) {
  box(parent, -4.72, 1.39, 0, .21, 2.78, 7.78, wall);
  box(parent, -1.89, 1.39, -3.89, 5.64, 2.78, .20, wall);
  box(parent, 4.37, 1.39, -3.89, .66, 2.78, .20, wall);
  box(parent, 2.51, .46, -3.89, 3.16, .92, .20, wall);
  box(parent, 2.51, 2.59, -3.89, 3.16, .38, .20, wall);
  box(parent, -4.59, .063, 0, .035, .125, 7.58, white);
  box(parent, 0, .063, -3.77, 9.42, .125, .035, white);
  const daylight = new T.MeshBasicMaterial({ map: outsideTexture() });
  mesh(parent, new T.PlaneGeometry(3.17, 1.47), daylight, 2.51, 1.65, -3.984).castShadow = false;
  for (const x of [.96, 2.00, 3.03, 4.06]) box(parent, x, 1.65, -3.80, .051, 1.48, .16, oakEdge);
  for (const y of [.93, 1.68, 2.38]) box(parent, 2.51, y, -3.80, 3.16, .046, .16, oakEdge);
  box(parent, 2.51, .94, -3.72, 3.31, .062, .34, white);
  for (const z of [1.02, 1.57]) picture(parent, -4.565, 1.69, z, .40, .54, true);
  picture(parent, -.51, 1.92, -3.76, .61, .76);
}

function kitchen(parent: T.Object3D) {
  const counter = group(parent, -2.79, 0, -3.25);
  box(counter, 0, .47, 0, 3.52, .88, .82, sage);
  box(counter, 0, .10, .04, 3.53, .17, .76, ink);
  box(counter, 0, .92, 0, 3.57, .080, .87, white);
  box(counter, 0, 1.035, -.409, 3.57, .18, .055, white);
  for (let door = 0; door < 5; door++) {
    const x = -1.39 + door * .695;
    box(counter, x, .51, .424, .678, .72, .041, mat(door === 4 ? 0x5c7166 : 0x687c6b));
    box(counter, x, .77, .453, .21, .021, .020, brass);
  }
  box(counter, -1.00, .964, -.006, .67, .012, .47, steel);
  box(counter, -.98, .973, -.008, .52, .012, .34, ink);
  box(counter, -.98, .977, -.02, .43, .017, .27, steel);
  cylinder(counter, -1.06, 1.044, -.26, .032, .042, .22, steel);
  const spout = mesh(counter, new T.TorusGeometry(.11, .019, 9, 18, Math.PI * 0.93), steel, -1.06, 1.14, -.147);
  spout.rotation.y = Math.PI / 2;
  const board = box(counter, 1.11, .982, .06, .55, .037, .37, oak);
  board.rotation.y = -.16;
  cylinder(counter, 1.12, 1.03, .08, .20, .14, .074, terra);
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.399;
    oval(counter, 1.12 + Math.cos(angle) * .087, 1.10, .08 + Math.sin(angle) * .09, .071, .065, .068, mat(i % 2 ? 0xac5140 : 0xc1664b));
  }
  box(counter, .60, 1.815, -.29, 1.64, .043, .30, walnut);
  for (let i = 0; i < 4; i++) {
    cylinder(counter, .13 + i * .22, 1.879, -.25, .073, .063, .090, fabricColors[i]);
  }
  plant(counter, 1.11, 1.837, -.258, .46);
  const wallTexture = fabricTexture('#d8c8ae', '#d8c8ae');
  const backsplash = new T.MeshStandardMaterial({ map: wallTexture, roughness: .96 });
  box(counter, 0, 1.34, -.46, 3.5, .55, .04, backsplash);
  for (let i = 0; i < 7; i++) box(counter, -1.52 + i * .50, 1.34, -.432, .013, .55, .008, linen);
  box(counter, 0, 1.37, -.432, 3.45, .012, .008, linen);
}

function desk(parent: T.Object3D) {
  const furniture = group(parent, -3.95, 0, -.65);
  box(furniture, 0, .755, 0, .89, .057, 1.76, oakEdge);
  for (const x of [-.385, .385]) for (const z of [-.77, .77]) box(furniture, x, .371, z, .065, .71, .071, walnut);
  box(furniture, -.26, .61, .32, .35, .22, .80, oak);
  box(furniture, -.086, .635, .32, .029, .022, .15, brass);
  const notebook = group(furniture, .13, .803, -.09);
  notebook.rotation.y = -.24;
  for (const x of [-.103, .103]) {
    box(notebook, x, 0, 0, .201, .031, .31, linen).rotation.z = x * .25;
    for (let line = 0; line < 7; line++) box(notebook, x, .018, -.10 + line * .030, .14, .003, .0035, oakEdge);
  }
  cylinder(furniture, -.26, .814, -.57, .122, .124, .037, brass);
  cylinder(furniture, -.26, 1.034, -.57, .017, .021, .46, brass);
  const light = cylinder(furniture, -.23, 1.29, -.57, .087, .153, .16, linen);
  light.rotation.z = .27;
  book(furniture, -.15, .795, .59, .26, .30, sage);
  book(furniture, -.16, .839, .57, .21, .24, terra).rotation.y = -.2;
}

function bedroom(parent: T.Object3D) {
  const bed = group(parent, 2.77, 0, -2.02);
  for (const x of [-.89, .89]) for (const z of [-1.0, 1.0]) box(bed, x, .14, z, .15, .29, .15, walnut);
  box(bed, 0, .29, 0, 2.20, .24, 2.66, oak);
  box(bed, 0, .68, -1.22, 2.20, 1.20, .19, oakEdge);
  box(bed, 0, .78, -1.106, 2.06, .83, .044, fabricColors[4]);
  box(bed, 0, .455, .028, 2.07, .21, 2.39, linen);
  const bedding = new T.MeshStandardMaterial({ map: fabricTexture('#c2bba4', '#b4ad98'), roughness: .94 });
  box(bed, 0, .57, .31, 2.108, .067, 1.84, bedding);
  box(bed, 0, .497, 1.25, 2.105, .203, .034, bedding);
  for (const x of [-.53, .53]) {
    const pillow = oval(bed, x, .615, -.78, .445, .112, .336, white);
    pillow.rotation.y = x * .15;
  }
  const throwMatter = new T.MeshStandardMaterial({ map: fabricTexture('#797f69', '#797f69'), roughness: .94 });
  box(bed, 0, .617, .91, 2.125, .043, .54, throwMatter);
  box(bed, 0, .515, 1.24, 2.126, .195, .06, throwMatter);
  for (let i = 0; i < 19; i++) box(bed, -.99 + i * .11, .408, 1.273, .025, .076, .011, sage);
  box(parent, 3.93, .23, -2.97, .47, .44, .50, walnut);
  box(parent, 3.93, .47, -2.97, .50, .073, .55, oakEdge);
  plant(parent, 3.93, .51, -2.99, .58);
}

function living(parent: T.Object3D) {
  const sofa = group(parent, -2.77, 0, 1.53);
  box(sofa, 0, .24, 0, 2.60, .34, .99, walnut);
  box(sofa, 0, .65, .39, 2.60, .80, .24, sage);
  for (const x of [-1.20, 1.20]) box(sofa, x, .54, 0, .23, .43, .99, sage);
  for (const x of [-.66, 0, .66]) {
    box(sofa, x, .45, -.07, .646, .151, .72, sage);
    box(sofa, x, .76, .274, .635, .49, .18, sage).rotation.x = -.095;
  }
  oval(sofa, -.81, .64, .12, .235, .23, .12, fabricColors[0]).rotation.z = -.27;
  oval(sofa, .82, .64, .09, .22, .22, .12, fabricColors[1]).rotation.z = .27;
  const rugMaterial = new T.MeshStandardMaterial({ map: fabricTexture('#a69278', '#c4b39b', true), roughness: .98 });
  const rug = mesh(parent, new T.PlaneGeometry(3.84, 2.70), rugMaterial, -2.42, .012, 2.03);
  rug.rotation.x = -Math.PI / 2;
  rug.castShadow = false;
  const table = group(parent, -1.82, 0, 2.77);
  for (const x of [-.55, .55]) for (const z of [-.24, .24]) box(table, x, .19, z, .054, .39, .057, walnut);
  box(table, 0, .405, 0, 1.35, .077, .67, oak);
  book(table, -.34, .45, -.01, .27, .35, sage).rotation.y = -.18;
  oval(table, .32, .467, .10, .16, .032, .13, terra);
  plant(parent, -4.14, 0, 2.95, 1.18);

  const shelf = group(parent, 4.16, 0, 1.35);
  for (const z of [-.9, .9]) box(shelf, 0, .67, z, .61, 1.34, .062, oakEdge);
  for (const y of [.13, .53, .95, 1.31]) box(shelf, 0, y, 0, .62, .064, 1.76, oak);
  box(shelf, .27, .66, 0, .044, 1.28, 1.77, walnut);
  for (let level = 0; level < 2; level++) {
    for (let i = 0; i < 7; i++) {
      const height = .20 + (i % 3) * .046;
      box(shelf, -.09, .17 + level * .40 + height / 2, -.69 + i * .128, .32, height, .103, fabricColors[(i + level) % fabricColors.length]);
      box(shelf, -.257, .22 + level * .40, -.69 + i * .128, .007, .018, .063, linen);
    }
  }
  plant(shelf, -.023, 1.35, .60, .71);
}

export function makeGlass() {
  const cup = new T.Group();
  const glass = new T.MeshPhysicalMaterial({ color: 0xb8d9d1, roughness: .13, metalness: .14, transparent: true, opacity: .73, clearcoat: 1 });
  const liquid = new T.MeshStandardMaterial({ color: 0x91c6bf, roughness: .21, metalness: .09, transparent: true, opacity: .73 });
  cylinder(cup, 0, .077, 0, .066, .050, .154, glass).geometry = new T.CylinderGeometry(.066, .05, .154, 24, 1, true);
  cylinder(cup, 0, .048, 0, .053, .048, .083, liquid);
  const rim = mesh(cup, new T.TorusGeometry(.065, .004, 8, 24), glass, 0, .151, 0);
  rim.rotation.x = Math.PI / 2;
  return cup;
}

export function buildApartment(parent: T.Scene) {
  const apartment = new T.Group();
  parent.add(apartment);
  const wood = new T.MeshStandardMaterial({ map: floorTexture(), roughness: .75 });
  box(apartment, 0, -.155, 0, ROOM.width + .20, .28, ROOM.depth + .22, walnut);
  const floor = mesh(apartment, new T.PlaneGeometry(ROOM.width, ROOM.depth), wood, 0, 0, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  box(apartment, 0, -.022, 3.81, 9.45, .060, .036, oakEdge);
  box(apartment, 4.705, -.025, 0, .036, .060, 7.62, oakEdge);
  addWalls(apartment);
  kitchen(apartment);
  desk(apartment);
  bedroom(apartment);
  living(apartment);
  const vase = cylinder(apartment, .71, 1.031, -3.715, .066, .080, .124, terra);
  vase.rotation.z = -.06;

  const cup = makeGlass();
  const { look, surface } = PLACES.kitchen;
  cup.position.set(look.x, surface, look.z);
  apartment.add(cup);
  return { cup };
}
