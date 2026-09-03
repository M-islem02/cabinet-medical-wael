/**
 * Dental 3D Odontogram Module - Realistic Oral Anatomy & Modern Clinical 3D UI
 * Renders an anatomically authentic 3D human mouth (Maxilla, Mandible,
 * realistic sculpted teeth with cusps and grooves, scalloped gingiva,
 * vaulted hard palate, and contoured tongue) using Three.js.
 * Includes sleek glassmorphic camera dock, smooth camera gliding,
 * floating tooth HUD, and full 2D bidirectional sync.
 */

import * as THREE from '../libs/three.module.js';

let scene = null;
let camera = null;
let renderer = null;
let animationFrameId = null;
let resizeObserver = null;
let containerEl = null;

// Tooth meshes map: toothNumber (Number) -> THREE.Group
const toothGroups = new Map();
// Tooth data cache
let currentTeethData = {};
let currentTreatmentsCache = {};
let currentSelectedTooth = null;
let onToothSelectCallback = null;

// Raycaster & Mouse tracking
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredToothNumber = null;
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let currentViewPreset = 'default';

// Camera target and smooth spherical coordinates
const cameraTarget = new THREE.Vector3(0, 0, -0.2);
let cameraRadius = 14.5;
let cameraTheta = 0.28;
let cameraPhi = 1.35;

// Target angles for smooth camera gliding / interpolation
let targetRadius = 14.5;
let targetTheta = 0.28;
let targetPhi = 1.35;

// French anatomical tooth names
const ADULT_TEETH_NAMES = {
  18: 'Dent de sagesse sup. droite', 17: '2e molaire sup. droite', 16: '1re molaire sup. droite',
  15: '2e prémolaire sup. droite', 14: '1re prémolaire sup. droite', 13: 'Canine sup. droite',
  12: 'Incisive latérale sup. droite', 11: 'Incisive centrale sup. droite',
  21: 'Incisive centrale sup. gauche', 22: 'Incisive latérale sup. gauche', 23: 'Canine sup. gauche',
  24: '1re prémolaire sup. gauche', 25: '2e prémolaire sup. gauche', 26: '1re molaire sup. gauche',
  27: '2e molaire sup. gauche', 28: 'Dent de sagesse sup. gauche',
  38: 'Dent de sagesse inf. gauche', 37: '2e molaire inf. gauche', 36: '1re molaire inf. gauche',
  35: '2e prémolaire inf. gauche', 34: '1re prémolaire inf. gauche', 33: 'Canine inf. gauche',
  32: 'Incisive latérale inf. gauche', 31: 'Incisive centrale inf. gauche',
  41: 'Incisive centrale inf. droite', 42: 'Incisive latérale inf. droite', 43: 'Canine inf. droite',
  44: '1re prémolaire inf. droite', 45: '2e prémolaire inf. droite', 46: '1re molaire inf. droite',
  47: '2e molaire inf. droite', 48: 'Dent de sagesse inf. droite'
};

const STATUS_COLOR_HEX = {
  healthy:    0xfcfaf2,
  cavity:     0x9a3412,
  filled:     0x2563eb,
  crown:      0xd97706,
  bridge:     0x6366f1,
  rootCanal:  0xdb2777,
  extraction: 0x94a3b8,
  implant:    0x0891b2,
  missing:    0x94a3b8,
  fractured:  0xeab308,
  abscess:    0xdc2626,
  impacted:   0x71717a,
  prosthesis: 0x0284c7
};

const STATUS_LABELS_FR = {
  healthy: 'Saine',
  cavity: 'Carie',
  filled: 'Obturée',
  crown: 'Couronne',
  bridge: 'Bridge',
  rootCanal: 'Dévitalisée',
  extraction: 'Extraite',
  implant: 'Implant',
  missing: 'Absente',
  fractured: 'Fracturée',
  abscess: 'Abcès',
  impacted: 'Incluse',
  prosthesis: 'Prothèse'
};

function calculateTooth3DPosition(toothNumber) {
  const isUpper = toothNumber >= 11 && toothNumber <= 28;
  const isRight = (toothNumber >= 11 && toothNumber <= 18) || (toothNumber >= 41 && toothNumber <= 48);
  const toothIndex = (toothNumber % 10);

  const archWidth = isUpper ? 4.25 : 3.92;
  const archDepth = isUpper ? 4.05 : 3.75;
  const yBase = isUpper ? 1.05 : -1.05;

  const t = (toothIndex - 0.95) / 7.15;
  const angle = t * 1.36;

  const signX = isRight ? 1 : -1;
  const x = signX * Math.sin(angle) * archWidth;
  const z = -Math.cos(angle) * archDepth + (archDepth * 0.72) + (isUpper ? 0.22 : 0);
  const y = yBase;

  const rotY = signX * (angle + (toothIndex <= 2 ? 0.05 : 0.22));

  return { x, y, z, rotY, isUpper, toothIndex };
}

// Procedural Anatomical Tooth Geometries
function createIncisorGeometry(w, h, d, isUpper, isCentral) {
  const geom = new THREE.BufferGeometry();
  const rows = 12, cols = 16;
  const positions = [], indices = [];

  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    const y = (v - 0.5) * h * (isUpper ? -1 : 1);
    const curDepth = d * (1.0 - 0.75 * v);
    const curWidth = w * (0.82 + 0.26 * Math.sin(v * Math.PI * 0.5));

    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * Math.PI * 2;
      let x = Math.sin(theta) * curWidth * 0.5;
      let z = Math.cos(theta) * curDepth * 0.5;

      if (Math.cos(theta) > 0) {
        z += 0.09 * (1.0 - v * 0.5) * (1.0 - Math.min(1.0, (2 * x / curWidth) ** 2));
      } else {
        z += (v < 0.35 ? -0.06 * (1.0 - v / 0.35) : 0.04 * Math.sin(v * Math.PI));
      }
      positions.push(x, y, z);
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const nextI = (i + 1) % cols;
      const a = j * cols + i;
      const b = (j + 1) * cols + i;
      const c = (j + 1) * cols + nextI;
      const dIdx = j * cols + nextI;
      indices.push(a, b, c);
      indices.push(a, c, dIdx);
    }
  }

  const topRowStart = rows * cols;
  const centerIdx = positions.length / 3;
  positions.push(0, (0.5 * h) * (isUpper ? -1 : 1), 0);
  for (let i = 0; i < cols; i++) {
    const nextI = (i + 1) % cols;
    if (isUpper) {
      indices.push(centerIdx, topRowStart + nextI, topRowStart + i);
    } else {
      indices.push(centerIdx, topRowStart + i, topRowStart + nextI);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createCanineGeometry(w, h, d, isUpper) {
  const geom = new THREE.BufferGeometry();
  const rows = 12, cols = 16;
  const positions = [], indices = [];

  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    let y = (v - 0.5) * h * (isUpper ? -1 : 1);
    const curWidth = w * (0.85 + 0.22 * Math.sin(v * Math.PI * 0.7)) * (1.0 - 0.55 * (v ** 1.8));
    const curDepth = d * (1.0 - 0.55 * (v ** 1.6));

    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * Math.PI * 2;
      let x = Math.sin(theta) * curWidth * 0.5;
      let z = Math.cos(theta) * curDepth * 0.5;

      if (Math.cos(theta) > 0) {
        z += 0.12 * Math.cos(theta) * (1.0 - v * 0.4);
      } else {
        z -= (v < 0.35 ? 0.08 : 0.02);
      }
      positions.push(x, y, z);
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const nextI = (i + 1) % cols;
      const a = j * cols + i;
      const b = (j + 1) * cols + i;
      const c = (j + 1) * cols + nextI;
      const dIdx = j * cols + nextI;
      indices.push(a, b, c);
      indices.push(a, c, dIdx);
    }
  }

  const topRowStart = rows * cols;
  const centerIdx = positions.length / 3;
  positions.push(0, (0.5 * h + 0.12) * (isUpper ? -1 : 1), 0.05);
  for (let i = 0; i < cols; i++) {
    const nextI = (i + 1) % cols;
    if (isUpper) {
      indices.push(centerIdx, topRowStart + nextI, topRowStart + i);
    } else {
      indices.push(centerIdx, topRowStart + i, topRowStart + nextI);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createPremolarGeometry(w, h, d, isUpper) {
  const geom = new THREE.BufferGeometry();
  const rows = 12, cols = 16;
  const positions = [], indices = [];

  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    let y = (v - 0.5) * h * (isUpper ? -1 : 1);
    const barrel = 1.0 + 0.15 * Math.sin(v * Math.PI);
    const curW = w * 0.5 * (0.85 + 0.15 * v) * barrel;
    const curD = d * 0.5 * (0.85 + 0.15 * v) * barrel;

    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.85) * curW;
      const z = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.85) * curD;

      let curY = y;
      if (v > 0.65) {
        const cuspFactor = (v - 0.65) / 0.35;
        const cuspHeight = (cosT > 0 ? 0.14 : 0.10) * Math.abs(cosT);
        curY += (isUpper ? -1 : 1) * cuspHeight * cuspFactor;
      }
      positions.push(x, curY, z);
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const nextI = (i + 1) % cols;
      const a = j * cols + i;
      const b = (j + 1) * cols + i;
      const c = (j + 1) * cols + nextI;
      const dIdx = j * cols + nextI;
      indices.push(a, b, c);
      indices.push(a, c, dIdx);
    }
  }

  const topRowStart = rows * cols;
  const centerIdx = positions.length / 3;
  positions.push(0, (0.5 * h - 0.06) * (isUpper ? -1 : 1), 0);
  for (let i = 0; i < cols; i++) {
    const nextI = (i + 1) % cols;
    if (isUpper) {
      indices.push(centerIdx, topRowStart + nextI, topRowStart + i);
    } else {
      indices.push(centerIdx, topRowStart + i, topRowStart + nextI);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createMolarGeometry(w, h, d, isUpper, isWisdom) {
  const geom = new THREE.BufferGeometry();
  const rows = 12, cols = 18;
  const positions = [], indices = [];

  for (let j = 0; j <= rows; j++) {
    const v = j / rows;
    let y = (v - 0.5) * h * (isUpper ? -1 : 1);
    const barrel = 1.0 + 0.18 * Math.sin(v * Math.PI);
    const curW = w * 0.5 * (0.86 + 0.14 * v) * barrel;
    const curD = d * 0.5 * (0.86 + 0.14 * v) * barrel;

    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = Math.sign(sinT) * Math.pow(Math.abs(sinT), 0.78) * curW;
      const z = Math.sign(cosT) * Math.pow(Math.abs(cosT), 0.78) * curD;

      let curY = y;
      if (v > 0.65) {
        const cuspFactor = (v - 0.65) / 0.35;
        const cuspHeight = 0.18 * Math.sin(theta * 2 - Math.PI / 4) + 0.05 * Math.sin(theta * 4);
        curY += (isUpper ? -1 : 1) * Math.max(0, cuspHeight) * cuspFactor;
      }
      positions.push(x, curY, z);
    }
  }

  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const nextI = (i + 1) % cols;
      const a = j * cols + i;
      const b = (j + 1) * cols + i;
      const c = (j + 1) * cols + nextI;
      const dIdx = j * cols + nextI;
      indices.push(a, b, c);
      indices.push(a, c, dIdx);
    }
  }

  const topRowStart = rows * cols;
  const centerIdx = positions.length / 3;
  positions.push(0, (0.5 * h - 0.09) * (isUpper ? -1 : 1), 0);
  for (let i = 0; i < cols; i++) {
    const nextI = (i + 1) % cols;
    if (isUpper) {
      indices.push(centerIdx, topRowStart + nextI, topRowStart + i);
    } else {
      indices.push(centerIdx, topRowStart + i, topRowStart + nextI);
    }
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function createToothMesh(toothNumber) {
  const toothGroup = new THREE.Group();
  toothGroup.userData = { toothNumber };

  const toothIndex = (toothNumber % 10);
  const isUpper = toothNumber >= 11 && toothNumber <= 28;
  const isMolar = toothIndex >= 6;
  const isPremolar = toothIndex === 4 || toothIndex === 5;
  const isCanine = toothIndex === 3;
  const isIncisor = toothIndex <= 2;
  const isCentral = toothIndex === 1;
  const isWisdom = toothIndex === 8;

  const enamelMat = new THREE.MeshStandardMaterial({
    color: STATUS_COLOR_HEX.healthy,
    roughness: 0.18,
    metalness: 0.04,
    envMapIntensity: 1.1
  });

  const rootMat = new THREE.MeshStandardMaterial({
    color: 0xecd5bf,
    roughness: 0.45,
    metalness: 0.02
  });

  let crownMesh;
  const rootMeshes = [];

  if (isIncisor) {
    const w = isCentral ? (isUpper ? 0.74 : 0.56) : (isUpper ? 0.62 : 0.54);
    const h = isUpper ? 0.88 : 0.82;
    const d = 0.44;
    const crownGeom = createIncisorGeometry(w, h, d, isUpper, isCentral);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.42 : 0.42;

    const rootGeom = new THREE.CylinderGeometry(0.24, 0.06, 1.15, 10);
    const rootMesh = new THREE.Mesh(rootGeom, rootMat);
    rootMesh.position.y = isUpper ? 0.58 : -0.58;
    rootMeshes.push(rootMesh);

  } else if (isCanine) {
    const crownGeom = createCanineGeometry(0.72, 0.96, 0.56, isUpper);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.45 : 0.45;

    const rootGeom = new THREE.CylinderGeometry(0.32, 0.08, 1.45, 10);
    const rootMesh = new THREE.Mesh(rootGeom, rootMat);
    rootMesh.position.y = isUpper ? 0.72 : -0.72;
    rootMeshes.push(rootMesh);

  } else if (isPremolar) {
    const crownGeom = createPremolarGeometry(0.68, 0.76, 0.65, isUpper);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.38 : 0.38;

    const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.05, 1.05, 8), rootMat);
    r1.position.set(-0.13, isUpper ? 0.52 : -0.52, 0);
    r1.rotation.z = isUpper ? -0.08 : 0.08;

    const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.05, 1.0, 8), rootMat);
    r2.position.set(0.13, isUpper ? 0.52 : -0.52, 0);
    r2.rotation.z = isUpper ? 0.08 : -0.08;

    rootMeshes.push(r1, r2);

  } else {
    const w = isWisdom ? 0.88 : (toothIndex === 6 ? 1.04 : 0.94);
    const h = 0.78;
    const d = isWisdom ? 0.84 : (toothIndex === 6 ? 0.98 : 0.90);
    const crownGeom = createMolarGeometry(w, h, d, isUpper, isWisdom);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.38 : 0.38;

    if (isUpper) {
      const rPalatal = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.08, 1.15, 8), rootMat);
      rPalatal.position.set(0, 0.56, -0.22);
      rPalatal.rotation.x = -0.15;

      const rMB = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.06, 1.1, 8), rootMat);
      rMB.position.set(-0.25, 0.54, 0.16);
      rMB.rotation.z = -0.12;
      rMB.rotation.x = 0.12;

      const rDB = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.06, 1.05, 8), rootMat);
      rDB.position.set(0.25, 0.54, 0.16);
      rDB.rotation.z = 0.12;
      rDB.rotation.x = 0.12;

      rootMeshes.push(rPalatal, rMB, rDB);
    } else {
      const rMesial = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.07, 1.15, 8), rootMat);
      rMesial.position.set(-0.24, -0.56, 0);
      rMesial.rotation.z = -0.1;

      const rDistal = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.07, 1.12, 8), rootMat);
      rDistal.position.set(0.24, -0.56, 0);
      rDistal.rotation.z = 0.1;

      rootMeshes.push(rMesial, rDistal);
    }
  }

  const ringGeom = new THREE.TorusGeometry(0.56, 0.045, 10, 32);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, visible: false });
  const selectionRing = new THREE.Mesh(ringGeom, ringMat);
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.position.y = isUpper ? -0.84 : 0.84;
  selectionRing.name = 'selectionRing';

  const markerGeom = new THREE.SphereGeometry(0.18, 12, 12);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xea580c, visible: false, roughness: 0.35 });
  const conditionMarker = new THREE.Mesh(markerGeom, markerMat);
  conditionMarker.position.y = isUpper ? -0.78 : 0.78;
  conditionMarker.name = 'conditionMarker';

  const implantGeom = new THREE.CylinderGeometry(0.25, 0.16, 1.35, 16);
  const implantMat = new THREE.MeshStandardMaterial({
    color: 0xa1a1aa,
    metalness: 0.95,
    roughness: 0.16,
    visible: false
  });
  const implantPost = new THREE.Mesh(implantGeom, implantMat);
  implantPost.position.y = isUpper ? 0.65 : -0.65;
  implantPost.name = 'implantPost';

  crownMesh.userData = { toothNumber };
  toothGroup.add(crownMesh);
  rootMeshes.forEach(r => {
    r.userData = { toothNumber };
    toothGroup.add(r);
  });
  toothGroup.add(selectionRing);
  toothGroup.add(conditionMarker);
  toothGroup.add(implantPost);

  toothGroup.userData.crownMesh = crownMesh;
  toothGroup.userData.rootMeshes = rootMeshes;
  toothGroup.userData.selectionRing = selectionRing;
  toothGroup.userData.conditionMarker = conditionMarker;
  toothGroup.userData.implantPost = implantPost;

  return toothGroup;
}

function createMouthStructures() {
  const mouthGroup = new THREE.Group();

  const gumMat = new THREE.MeshStandardMaterial({
    color: 0xd86c82,
    roughness: 0.34,
    metalness: 0.03
  });

  const palateMat = new THREE.MeshStandardMaterial({
    color: 0xdf7a8d,
    roughness: 0.42,
    metalness: 0.02
  });

  const tongueMat = new THREE.MeshStandardMaterial({
    color: 0xd05469,
    roughness: 0.32,
    metalness: 0.04
  });

  // 1. UPPER ALVEOLAR GINGIVA
  const upperPts = [];
  const upperTeethOrder = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  upperTeethOrder.forEach(num => {
    const pos = calculateTooth3DPosition(num);
    upperPts.push(new THREE.Vector3(pos.x, pos.y + 0.48, pos.z));
  });
  const upperCurve = new THREE.CatmullRomCurve3(upperPts);
  const upperAlveolarGeom = new THREE.TubeGeometry(upperCurve, 48, 0.58, 16, false);
  const upperGumMesh = new THREE.Mesh(upperAlveolarGeom, gumMat);
  mouthGroup.add(upperGumMesh);

  const upperApronPts = upperPts.map(p => new THREE.Vector3(p.x * 1.08, p.y + 0.45, p.z * 1.04));
  const upperApronCurve = new THREE.CatmullRomCurve3(upperApronPts);
  const upperApronGeom = new THREE.TubeGeometry(upperApronCurve, 48, 0.42, 12, false);
  const upperApronMesh = new THREE.Mesh(upperApronGeom, gumMat);
  mouthGroup.add(upperApronMesh);

  // 2. VAULTED HARD PALATE (Roof of the mouth)
  const palateGeom = new THREE.BufferGeometry();
  const pRows = 10, pCols = 14;
  const pPos = [], pIndices = [];
  const pWidth = 3.65, pDepth = 3.35;

  for (let j = 0; j <= pRows; j++) {
    const v = j / pRows;
    const z = -v * pDepth + 1.25;
    const archSpan = Math.sqrt(Math.max(0, 1 - (z / -pDepth))) * (pWidth * 0.5);

    for (let i = 0; i <= pCols; i++) {
      const u = (i / pCols) * 2 - 1;
      const x = u * archSpan;
      const rugae = (v < 0.5) ? 0.03 * Math.sin(v * Math.PI * 8) * (1 - u * u) : 0;
      const y = 0.98 + (1 - u * u) * (0.62 * (1 - v * 0.42)) + rugae;
      pPos.push(x, y, z);
    }
  }

  for (let j = 0; j < pRows; j++) {
    for (let i = 0; i < pCols; i++) {
      const a = j * (pCols + 1) + i;
      const b = (j + 1) * (pCols + 1) + i;
      const c = (j + 1) * (pCols + 1) + i + 1;
      const d = j * (pCols + 1) + i + 1;
      pIndices.push(a, b, c);
      pIndices.push(a, c, d);
    }
  }
  palateGeom.setAttribute('position', new THREE.Float32BufferAttribute(pPos, 3));
  palateGeom.setIndex(pIndices);
  palateGeom.computeVertexNormals();
  const palateMesh = new THREE.Mesh(palateGeom, palateMat);
  mouthGroup.add(palateMesh);

  // 3. LOWER ALVEOLAR GINGIVA
  const lowerPts = [];
  const lowerTeethOrder = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  lowerTeethOrder.forEach(num => {
    const pos = calculateTooth3DPosition(num);
    lowerPts.push(new THREE.Vector3(pos.x, pos.y - 0.48, pos.z));
  });
  const lowerCurve = new THREE.CatmullRomCurve3(lowerPts);
  const lowerAlveolarGeom = new THREE.TubeGeometry(lowerCurve, 48, 0.56, 16, false);
  const lowerGumMesh = new THREE.Mesh(lowerAlveolarGeom, gumMat);
  mouthGroup.add(lowerGumMesh);

  const lowerApronPts = lowerPts.map(p => new THREE.Vector3(p.x * 1.08, p.y - 0.45, p.z * 1.04));
  const lowerApronCurve = new THREE.CatmullRomCurve3(lowerApronPts);
  const lowerApronGeom = new THREE.TubeGeometry(lowerApronCurve, 48, 0.40, 12, false);
  const lowerApronMesh = new THREE.Mesh(lowerApronGeom, gumMat);
  mouthGroup.add(lowerApronMesh);

  // 4. CONTOURED ANATOMICAL TONGUE (Floor of the mouth)
  const tongueGeom = new THREE.BufferGeometry();
  const tRows = 12, tCols = 14;
  const tPos = [], tIndices = [];
  const tLength = 3.3, tMaxWidth = 2.45;

  for (let j = 0; j <= tRows; j++) {
    const v = j / tRows;
    const z = -v * tLength + 1.15;
    const curW = tMaxWidth * Math.sin(v * Math.PI * 0.72 + 0.18);

    for (let i = 0; i <= tCols; i++) {
      const u = (i / tCols) * 2 - 1;
      const x = u * curW * 0.5;

      const medianGroove = 0.07 * Math.exp(-u * u * 12);
      const dorsalArch = (1 - u * u) * 0.38 * Math.sin(v * Math.PI * 0.78 + 0.12);
      const y = -0.92 + dorsalArch - medianGroove;

      tPos.push(x, y, z);
    }
  }

  for (let j = 0; j < tRows; j++) {
    for (let i = 0; i < tCols; i++) {
      const a = j * (tCols + 1) + i;
      const b = (j + 1) * (tCols + 1) + i;
      const c = (j + 1) * (tCols + 1) + i + 1;
      const d = j * (tCols + 1) + i + 1;
      tIndices.push(a, c, b);
      tIndices.push(a, d, c);
    }
  }
  tongueGeom.setAttribute('position', new THREE.Float32BufferAttribute(tPos, 3));
  tongueGeom.setIndex(tIndices);
  tongueGeom.computeVertexNormals();
  const tongueMesh = new THREE.Mesh(tongueGeom, tongueMat);
  mouthGroup.add(tongueMesh);

  return mouthGroup;
}

function updateCameraPosition() {
  if (!camera) return;
  camera.position.x = cameraTarget.x + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
  camera.position.y = cameraTarget.y + cameraRadius * Math.cos(cameraPhi);
  camera.position.z = cameraTarget.z + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  camera.lookAt(cameraTarget);
}

// ========== FLOATING MODERN 3D UI OVERLAY ==========

function build3DUIOverlay(container) {
  // 1. Bottom Dock (Camera View Angles)
  const dock = document.createElement('div');
  dock.id = 'dental-3d-floating-dock';
  dock.style.cssText = 'position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-radius: 30px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.08); border: 1px solid rgba(255, 255, 255, 0.9); z-index: 10; user-select: none;';

  const views = [
    { id: 'face', label: 'Face' },
    { id: 'upper', label: 'Maxillaire' },
    { id: 'lower', label: 'Mandibule' },
    { id: 'right', label: 'Droit' },
    { id: 'left', label: 'Gauche' }
  ];

  views.forEach(v => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dental-3d-dock-btn' + (currentViewPreset === v.id ? ' is-active' : '');
    btn.dataset.view = v.id;
    btn.textContent = v.label;
    btn.style.cssText = 'border: none; background: ' + (currentViewPreset === v.id ? '#0284c7' : 'transparent') + '; color: ' + (currentViewPreset === v.id ? '#ffffff' : '#334155') + '; padding: 5px 14px; font-size: 12px; font-weight: 600; border-radius: 20px; cursor: pointer; transition: all 0.2s ease; outline: none; box-shadow: ' + (currentViewPreset === v.id ? '0 2px 6px rgba(2,132,199,0.35)' : 'none') + ';';
    btn.onclick = () => setDental3DView(v.id);
    dock.appendChild(btn);
  });
  container.appendChild(dock);

  // 2. Top-Right Floating Toolset (Zoom In, Zoom Out, Center)
  const toolset = document.createElement('div');
  toolset.id = 'dental-3d-floating-tools';
  toolset.style.cssText = 'position: absolute; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 6px; background: rgba(255, 255, 255, 0.88); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); padding: 5px; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10); border: 1px solid rgba(255, 255, 255, 0.8); z-index: 10;';

  const makeToolBtn = (text, title, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.title = title;
    b.style.cssText = 'width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: none; background: transparent; color: #334155; font-size: 14px; font-weight: 700; border-radius: 8px; cursor: pointer; transition: background 0.15s ease;';
    b.onmouseenter = () => { b.style.background = '#f1f5f9'; };
    b.onmouseleave = () => { b.style.background = 'transparent'; };
    b.onclick = onClick;
    return b;
  };

  toolset.appendChild(makeToolBtn('+', 'Zoom avant', () => zoomDental3D(-1.8)));
  toolset.appendChild(makeToolBtn('−', 'Zoom arrière', () => zoomDental3D(1.8)));
  toolset.appendChild(makeToolBtn('⟲', 'Recentrer la vue', () => resetDental3DCamera()));
  container.appendChild(toolset);

  // 3. Bottom-Left Navigation Pill
  const hint = document.createElement('div');
  hint.id = 'dental-3d-hint';
  hint.style.cssText = 'position: absolute; bottom: 16px; left: 16px; font-size: 11px; font-weight: 500; color: #64748b; background: rgba(255, 255, 255, 0.75); backdrop-filter: blur(10px); padding: 5px 10px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.8); pointer-events: none; z-index: 9;';
  hint.textContent = 'Pivoter : Glisser · Zoomer : Molette · Dent : Cliquer';
  container.appendChild(hint);

  // 4. Top-Left Active Tooth HUD Card
  const hud = document.createElement('div');
  hud.id = 'dental-3d-active-hud';
  hud.style.cssText = 'position: absolute; top: 16px; left: 16px; display: none; background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); padding: 8px 14px; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10); border: 1px solid rgba(255, 255, 255, 0.9); z-index: 10;';
  container.appendChild(hud);
}

function updateActiveToothHUD(toothNumber) {
  const hud = document.getElementById('dental-3d-active-hud');
  if (!hud) return;
  if (!toothNumber) {
    hud.style.display = 'none';
    return;
  }
  const name = ADULT_TEETH_NAMES[toothNumber] || ('Dent ' + toothNumber);
  const data = currentTeethData[toothNumber];
  const status = data ? data.status : 'healthy';
  const statusLabel = STATUS_LABELS_FR[status] || status;

  hud.innerHTML = `
    <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0284c7;">Dent sélectionnée</div>
    <div style="font-size: 13.5px; font-weight: 700; color: #0f172a; margin: 1px 0 3px 0;">Dent ${toothNumber} : ${name}</div>
    <div style="display: flex; align-items: center; gap: 6px;">
      <span style="font-size: 11.5px; color: #64748b;">Statut :</span>
      <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; background: #e0f2fe; color: #0369a1;">${statusLabel}</span>
    </div>
  `;
  hud.style.display = 'block';
}

function updateDockActiveState() {
  const btns = document.querySelectorAll('.dental-3d-dock-btn');
  btns.forEach(b => {
    const isAct = b.dataset.view === currentViewPreset;
    b.style.background = isAct ? '#0284c7' : 'transparent';
    b.style.color = isAct ? '#ffffff' : '#334155';
    b.style.boxShadow = isAct ? '0 2px 6px rgba(2,132,199,0.35)' : 'none';
  });
}

export function zoomDental3D(delta) {
  targetRadius = Math.max(7.0, Math.min(24.0, targetRadius + delta));
}

// Initialize Three.js scene
export function initDental3D(container, options = {}) {
  containerEl = container;
  onToothSelectCallback = options.onSelect || null;

  containerEl.innerHTML = '';
  toothGroups.clear();

  // Modern Medical Studio Viewport Styling
  containerEl.style.background = 'radial-gradient(circle at 50% 45%, #f8fafc 0%, #e2e8f0 70%, #cbd5e1 100%)';
  containerEl.style.borderRadius = '12px';
  containerEl.style.overflow = 'hidden';
  containerEl.style.boxShadow = 'inset 0 2px 10px rgba(0, 0, 0, 0.05)';
  containerEl.style.border = '1px solid #cbd5e1';

  scene = new THREE.Scene();

  const width = containerEl.clientWidth || 700;
  const height = containerEl.clientHeight || 500;
  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  cameraRadius = 14.2;
  targetRadius = 14.2;
  cameraTheta = 0.28;
  targetTheta = 0.28;
  cameraPhi = 1.35;
  targetPhi = 1.35;
  updateCameraPosition();

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  containerEl.appendChild(renderer.domElement);

  // Dental Operatory Studio Lighting
  const ambientLight = new THREE.AmbientLight(0xfff7ed, 0.95);
  scene.add(ambientLight);

  const operatoryLight = new THREE.DirectionalLight(0xffffff, 1.5);
  operatoryLight.position.set(2, 9, 8);
  scene.add(operatoryLight);

  const leftFillLight = new THREE.DirectionalLight(0xf0f9ff, 0.75);
  leftFillLight.position.set(-7, 2, 6);
  scene.add(leftFillLight);

  const rightFillLight = new THREE.DirectionalLight(0xf0f9ff, 0.75);
  rightFillLight.position.set(7, 2, 6);
  scene.add(rightFillLight);

  const rimLight = new THREE.DirectionalLight(0xffedd5, 0.65);
  rimLight.position.set(0, 5, -8);
  scene.add(rimLight);

  // Complete Anatomical Mouth Structures
  scene.add(createMouthStructures());

  // Add All 32 FDI Adult Teeth
  const allTeeth = [
    18, 17, 16, 15, 14, 13, 12, 11,
    21, 22, 23, 24, 25, 26, 27, 28,
    38, 37, 36, 35, 34, 33, 32, 31,
    48, 47, 46, 45, 44, 43, 42, 41
  ];

  allTeeth.forEach(toothNumber => {
    const toothGroup = createToothMesh(toothNumber);
    const pos = calculateTooth3DPosition(toothNumber);
    toothGroup.position.set(pos.x, pos.y, pos.z);
    toothGroup.rotation.y = pos.rotY;
    scene.add(toothGroup);
    toothGroups.set(toothNumber, toothGroup);
  });

  // Floating Interactive Tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'dental-3d-tooltip';
  tooltip.style.cssText = 'position: absolute; display: none; pointer-events: none; background: rgba(15, 23, 42, 0.90); color: #ffffff; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; z-index: 20; box-shadow: 0 4px 14px rgba(0,0,0,0.22); backdrop-filter: blur(6px); transition: opacity 0.15s ease; border: 1px solid rgba(255,255,255,0.12);';
  containerEl.appendChild(tooltip);

  // Modern Floating UI Overlay
  build3DUIOverlay(containerEl);

  setupEventListeners(containerEl, tooltip);

  resizeObserver = new ResizeObserver(() => {
    if (!renderer || !camera || !containerEl) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    if (w > 0 && h > 0) {
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
  });
  resizeObserver.observe(containerEl);

  animate();
  updateDental3DData(currentTeethData, currentTreatmentsCache, currentSelectedTooth);
}

function setupEventListeners(container, tooltip) {
  const canvas = renderer.domElement;

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (isDragging) {
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      targetTheta -= deltaX * 0.008;
      targetPhi = Math.max(0.15, Math.min(Math.PI - 0.15, targetPhi - deltaY * 0.008));
      currentViewPreset = 'custom';
      updateDockActiveState();

      previousMousePosition = { x: e.clientX, y: e.clientY };
      tooltip.style.display = 'none';
      return;
    }

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    let hitTooth = null;

    for (const hit of intersects) {
      let cur = hit.object;
      while (cur && cur !== scene) {
        if (cur.userData && cur.userData.toothNumber) {
          hitTooth = cur.userData.toothNumber;
          break;
        }
        cur = cur.parent;
      }
      if (hitTooth) break;
    }

    if (hitTooth) {
      canvas.style.cursor = 'pointer';
      if (hoveredToothNumber !== hitTooth) {
        hoveredToothNumber = hitTooth;
        highlightHoveredTooth(hitTooth);
      }
      const name = ADULT_TEETH_NAMES[hitTooth] || ('Dent ' + hitTooth);
      const data = currentTeethData[hitTooth];
      const status = data?.status || 'healthy';
      const statusFr = STATUS_LABELS_FR[status] || status;
      tooltip.innerHTML = `<strong>Dent ${hitTooth}</strong> : ${name} <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;background:#0284c7;color:#ffffff;">${statusFr}</span>`;
      tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      tooltip.style.top = (e.clientY - rect.top + 14) + 'px';
      tooltip.style.display = 'block';
    } else {
      canvas.style.cursor = 'grab';
      if (hoveredToothNumber !== null) {
        unhighlightHoveredTooth(hoveredToothNumber);
        hoveredToothNumber = null;
      }
      tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    for (const hit of intersects) {
      let cur = hit.object;
      while (cur && cur !== scene) {
        if (cur.userData && cur.userData.toothNumber) {
          const clickedNumber = cur.userData.toothNumber;
          selectToothIn3D(clickedNumber);
          if (typeof onToothSelectCallback === 'function') {
            onToothSelectCallback(clickedNumber);
          }
          return;
        }
        cur = cur.parent;
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    targetRadius = Math.max(6.5, Math.min(26.0, targetRadius + e.deltaY * 0.015));
  }, { passive: false });
}

function highlightHoveredTooth(num) {
  const group = toothGroups.get(num);
  if (group && group.userData.crownMesh) {
    group.userData.crownMesh.material.emissive = new THREE.Color(0x0284c7);
    group.userData.crownMesh.material.emissiveIntensity = 0.28;
  }
}

function unhighlightHoveredTooth(num) {
  const group = toothGroups.get(num);
  if (group && group.userData.crownMesh) {
    if (num === currentSelectedTooth) {
      group.userData.crownMesh.material.emissive = new THREE.Color(0xf59e0b);
      group.userData.crownMesh.material.emissiveIntensity = 0.45;
    } else {
      group.userData.crownMesh.material.emissive = new THREE.Color(0x000000);
      group.userData.crownMesh.material.emissiveIntensity = 0;
    }
  }
}

export function selectToothIn3D(toothNumber) {
  if (currentSelectedTooth && toothGroups.has(currentSelectedTooth)) {
    const prevGroup = toothGroups.get(currentSelectedTooth);
    if (prevGroup.userData.selectionRing) prevGroup.userData.selectionRing.material.visible = false;
    if (prevGroup.userData.crownMesh) {
      prevGroup.userData.crownMesh.material.emissive = new THREE.Color(0x000000);
      prevGroup.userData.crownMesh.material.emissiveIntensity = 0;
    }
  }

  currentSelectedTooth = toothNumber;

  if (toothNumber && toothGroups.has(toothNumber)) {
    const group = toothGroups.get(toothNumber);
    if (group.userData.selectionRing) group.userData.selectionRing.material.visible = true;
    if (group.userData.crownMesh) {
      group.userData.crownMesh.material.emissive = new THREE.Color(0xf59e0b);
      group.userData.crownMesh.material.emissiveIntensity = 0.45;
    }
  }

  updateActiveToothHUD(toothNumber);
}

export function isDental3DInitialized() {
  return Boolean(scene && renderer && renderer.domElement && containerEl);
}

export function updateDental3DData(teethData = {}, treatmentsCache = {}, selectedTooth = null) {
  currentTeethData = teethData || {};
  currentTreatmentsCache = treatmentsCache || {};
  currentSelectedTooth = selectedTooth;

  toothGroups.forEach((group, num) => {
    const data = currentTeethData[num];
    const status = data ? data.status : 'healthy';
    const crown = group.userData.crownMesh;
    const ring = group.userData.selectionRing;
    const marker = group.userData.conditionMarker;
    const implant = group.userData.implantPost;

    if (!crown) return;

    marker.material.visible = false;
    implant.material.visible = false;
    crown.material.transparent = false;
    crown.material.opacity = 1.0;
    crown.material.metalness = 0.04;
    crown.material.roughness = 0.18;

    const hexColor = STATUS_COLOR_HEX[status] || STATUS_COLOR_HEX.healthy;
    crown.material.color.setHex(hexColor);

    if (status === 'cavity') {
      marker.material.visible = true;
      marker.material.color.setHex(0x78350f);
    } else if (status === 'filled') {
      marker.material.visible = true;
      marker.material.color.setHex(0x1d4ed8);
    } else if (status === 'implant') {
      implant.material.visible = true;
      crown.material.color.setHex(0xf1f5f9);
      crown.material.metalness = 0.85;
      crown.material.roughness = 0.18;
    } else if (status === 'crown') {
      crown.material.color.setHex(0xd97706);
      crown.material.metalness = 0.68;
      crown.material.roughness = 0.16;
    } else if (status === 'bridge') {
      crown.material.color.setHex(0x6366f1);
      crown.material.metalness = 0.45;
      crown.material.roughness = 0.22;
    } else if (status === 'rootCanal') {
      crown.material.color.setHex(0xdb2777);
    } else if (status === 'fractured') {
      marker.material.visible = true;
      marker.material.color.setHex(0xeab308);
      crown.material.color.setHex(0xfef08a);
    } else if (status === 'abscess') {
      marker.material.visible = true;
      marker.material.color.setHex(0xdc2626);
      crown.material.color.setHex(0xfecaca);
    } else if (status === 'prosthesis') {
      crown.material.color.setHex(0x0284c7);
      crown.material.metalness = 0.35;
    } else if (status === 'impacted') {
      crown.material.color.setHex(0x71717a);
    } else if (status === 'extraction' || status === 'missing') {
      crown.material.transparent = true;
      crown.material.opacity = 0.16;
      group.userData.rootMeshes.forEach(r => {
        r.material.transparent = true;
        r.material.opacity = 0.12;
      });
    }

    if (status !== 'extraction' && status !== 'missing') {
      group.userData.rootMeshes.forEach(r => {
        r.material.transparent = false;
        r.material.opacity = 1.0;
      });
    }

    const treatment = currentTreatmentsCache[num];
    if (treatment && treatment.status === 'completed') {
      crown.material.color.setHex(0x16a34a);
    } else if (treatment && treatment.status === 'in_progress') {
      crown.material.color.setHex(0x2563eb);
    }

    if (selectedTooth === num) {
      if (ring) ring.material.visible = true;
      crown.material.emissive = new THREE.Color(0xf59e0b);
      crown.material.emissiveIntensity = 0.45;
    } else {
      if (ring) ring.material.visible = false;
      crown.material.emissive = new THREE.Color(0x000000);
      crown.material.emissiveIntensity = 0;
    }
  });

  updateActiveToothHUD(selectedTooth);
}

// Preset Camera Views with Smooth Gliding
export function setDental3DView(preset) {
  currentViewPreset = preset;
  switch (preset) {
    case 'face':
      targetTheta = 0;
      targetPhi = Math.PI / 2;
      targetRadius = 13.2;
      break;
    case 'upper':
      targetTheta = 0;
      targetPhi = Math.PI - 0.22;
      targetRadius = 12.2;
      break;
    case 'lower':
      targetTheta = 0;
      targetPhi = 0.22;
      targetRadius = 12.2;
      break;
    case 'right':
      targetTheta = Math.PI / 2;
      targetPhi = Math.PI / 2.2;
      targetRadius = 13.5;
      break;
    case 'left':
      targetTheta = -Math.PI / 2;
      targetPhi = Math.PI / 2.2;
      targetRadius = 13.5;
      break;
    default:
      targetTheta = 0.28;
      targetPhi = 1.35;
      targetRadius = 14.2;
      break;
  }
  updateDockActiveState();
}

export function resetDental3DCamera() {
  setDental3DView('default');
}

// Animation Render Loop with Smooth Camera Damping / Gliding
function animate() {
  animationFrameId = requestAnimationFrame(animate);

  // Smooth camera interpolation
  cameraTheta += (targetTheta - cameraTheta) * 0.12;
  cameraPhi += (targetPhi - cameraPhi) * 0.12;
  cameraRadius += (targetRadius - cameraRadius) * 0.12;
  updateCameraPosition();

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

export function destroyDental3D() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  scene = null;
  camera = null;
  containerEl = null;
  toothGroups.clear();
}

if (typeof window !== 'undefined') {
  window.setDental3DView = setDental3DView;
  window.resetDental3DCamera = resetDental3DCamera;
  window.zoomDental3D = zoomDental3D;
}
