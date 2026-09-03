/**
 * Dental 3D Odontogram Module
 * Renders an interactive 3D dental model (Maxilla and Mandible with all 32 FDI teeth,
 * anatomical crowns, roots, and gums) with Three.js.
 * Fully synchronized with 2D dental chart patient records.
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

// Camera target and spherical coordinates for orbit
const cameraTarget = new THREE.Vector3(0, 0, 0);
let cameraRadius = 14.5;
let cameraTheta = Math.PI / 4;  // Azimuthal angle
let cameraPhi = Math.PI / 2.8;   // Polar angle

// Tooth names for tooltip
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
  healthy:    0xfbf9f5,
  cavity:     0xea580c,
  filled:     0x3b82f6,
  crown:      0xd97706,
  bridge:     0x6366f1,
  rootCanal:  0xec4899,
  extraction: 0x94a3b8,
  implant:    0x06b6d4,
  missing:    0x94a3b8,
  fractured:  0xeab308,
  abscess:    0xef4444,
  impacted:   0x78716c,
  prosthesis: 0x0ea5e9
};

// Calculate 3D anatomical position for each FDI tooth number
function calculateTooth3DPosition(toothNumber) {
  const isUpper = toothNumber >= 11 && toothNumber <= 28;
  const isRight = (toothNumber >= 11 && toothNumber <= 18) || (toothNumber >= 41 && toothNumber <= 48);
  const toothIndex = (toothNumber % 10); // 1 = central incisor, 8 = wisdom tooth

  // Arch parameters
  const archWidth = isUpper ? 4.1 : 3.85;
  const archDepth = isUpper ? 3.9 : 3.65;
  const yBase = isUpper ? 1.05 : -1.05;

  // Normalized position along the parabolic dental arch (0 to 1)
  const t = (toothIndex - 0.95) / 7.2;
  const angle = t * 1.38; // radians around arch

  const signX = isRight ? 1 : -1;
  const x = signX * Math.sin(angle) * archWidth;
  const z = -Math.cos(angle) * archDepth + (archDepth * 0.7);
  const y = yBase;

  // Tangent rotation around Y so teeth align along the curve of the dental arch
  const rotY = signX * (angle + (toothIndex <= 2 ? 0.05 : 0.22));

  return { x, y, z, rotY, isUpper, toothIndex };
}

// Create 3D anatomical tooth geometry based on tooth category
function createToothMesh(toothNumber) {
  const toothGroup = new THREE.Group();
  toothGroup.userData = { toothNumber };

  const toothIndex = (toothNumber % 10);
  const isUpper = toothNumber >= 11 && toothNumber <= 28;
  const isMolar = toothIndex >= 6;
  const isPremolar = toothIndex === 4 || toothIndex === 5;
  const isCanine = toothIndex === 3;
  const isIncisor = toothIndex <= 2;

  // Crown Materials
  const enamelMat = new THREE.MeshStandardMaterial({
    color: STATUS_COLOR_HEX.healthy,
    roughness: 0.25,
    metalness: 0.06,
    envMapIntensity: 0.9
  });

  const rootMat = new THREE.MeshStandardMaterial({
    color: 0xedd5be,
    roughness: 0.48,
    metalness: 0.02
  });

  let crownMesh, rootMeshes = [];

  if (isIncisor) {
    // Shovel-shaped flattened crown with incisal edge
    const crownGeom = new THREE.BoxGeometry(0.68, 0.78, 0.42, 2, 2, 2);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.38 : 0.38;

    // Single tapered conical root
    const rootGeom = new THREE.ConeGeometry(0.24, 1.1, 8);
    const rootMesh = new THREE.Mesh(rootGeom, rootMat);
    rootMesh.rotation.x = isUpper ? 0 : Math.PI;
    rootMesh.position.y = isUpper ? 0.52 : -0.52;
    rootMeshes.push(rootMesh);

  } else if (isCanine) {
    // Pointed cusp crown
    const crownGeom = new THREE.CylinderGeometry(0.12, 0.46, 0.95, 8);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.rotation.x = isUpper ? Math.PI : 0;
    crownMesh.position.y = isUpper ? -0.42 : 0.42;

    // Long thick root
    const rootGeom = new THREE.ConeGeometry(0.3, 1.35, 8);
    const rootMesh = new THREE.Mesh(rootGeom, rootMat);
    rootMesh.rotation.x = isUpper ? 0 : Math.PI;
    rootMesh.position.y = isUpper ? 0.65 : -0.65;
    rootMeshes.push(rootMesh);

  } else if (isPremolar) {
    // Bicuspid crown (two rounded cusps)
    const crownGeom = new THREE.CylinderGeometry(0.44, 0.48, 0.72, 8);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.36 : 0.36;

    // Bifurcated roots
    const rootGeom1 = new THREE.ConeGeometry(0.2, 0.95, 6);
    const r1 = new THREE.Mesh(rootGeom1, rootMat);
    r1.position.set(-0.12, isUpper ? 0.45 : -0.45, 0);
    r1.rotation.x = isUpper ? 0 : Math.PI;
    r1.rotation.z = isUpper ? -0.08 : 0.08;

    const rootGeom2 = new THREE.ConeGeometry(0.18, 0.9, 6);
    const r2 = new THREE.Mesh(rootGeom2, rootMat);
    r2.position.set(0.12, isUpper ? 0.45 : -0.45, 0);
    r2.rotation.x = isUpper ? 0 : Math.PI;
    r2.rotation.z = isUpper ? 0.08 : -0.08;

    rootMeshes.push(r1, r2);

  } else {
    // Molar: Quad-cuspid occlusal table
    const crownGeom = new THREE.BoxGeometry(0.88, 0.72, 0.82, 2, 2, 2);
    crownMesh = new THREE.Mesh(crownGeom, enamelMat);
    crownMesh.position.y = isUpper ? -0.35 : 0.35;

    // 2-3 curved roots
    const rootGeom = new THREE.ConeGeometry(0.22, 1.05, 6);
    const r1 = new THREE.Mesh(rootGeom, rootMat);
    r1.position.set(-0.25, isUpper ? 0.52 : -0.52, -0.15);
    r1.rotation.x = isUpper ? -0.1 : Math.PI + 0.1;
    r1.rotation.z = isUpper ? -0.12 : 0.12;

    const r2 = new THREE.Mesh(rootGeom, rootMat);
    r2.position.set(0.25, isUpper ? 0.52 : -0.52, -0.15);
    r2.rotation.x = isUpper ? -0.1 : Math.PI + 0.1;
    r2.rotation.z = isUpper ? 0.12 : -0.12;

    const r3 = new THREE.Mesh(rootGeom, rootMat);
    r3.position.set(0, isUpper ? 0.52 : -0.52, 0.22);
    r3.rotation.x = isUpper ? 0.15 : Math.PI - 0.15;

    rootMeshes.push(r1, r2, r3);
  }

  // Selection ring highlight (initially hidden)
  const ringGeom = new THREE.TorusGeometry(0.55, 0.05, 8, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, visible: false });
  const selectionRing = new THREE.Mesh(ringGeom, ringMat);
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.position.y = isUpper ? -0.8 : 0.8;
  selectionRing.name = 'selectionRing';

  // Occlusal marker (for cavity or filling)
  const markerGeom = new THREE.SphereGeometry(0.18, 8, 8);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xea580c, visible: false, roughness: 0.4 });
  const conditionMarker = new THREE.Mesh(markerGeom, markerMat);
  conditionMarker.position.y = isUpper ? -0.74 : 0.74;
  conditionMarker.name = 'conditionMarker';

  // Implant titanium post (hidden unless status is implant)
  const implantGeom = new THREE.CylinderGeometry(0.24, 0.15, 1.25, 12);
  const implantMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.92,
    roughness: 0.2,
    visible: false
  });
  const implantPost = new THREE.Mesh(implantGeom, implantMat);
  implantPost.position.y = isUpper ? 0.6 : -0.6;
  implantPost.name = 'implantPost';

  // Tag meshes for raycaster lookup
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

// Create upper and lower gums using smooth 3D curves
function createGumsMesh() {
  const gumGroup = new THREE.Group();
  const gumMat = new THREE.MeshStandardMaterial({
    color: 0xe58b9d,
    roughness: 0.55,
    metalness: 0.05
  });

  // Upper gum arch points
  const upperPts = [];
  const upperTeethOrder = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
  upperTeethOrder.forEach(num => {
    const pos = calculateTooth3DPosition(num);
    upperPts.push(new THREE.Vector3(pos.x, pos.y + 0.45, pos.z));
  });
  const upperCurve = new THREE.CatmullRomCurve3(upperPts);
  const upperGeom = new THREE.TubeGeometry(upperCurve, 40, 0.48, 12, false);
  const upperGum = new THREE.Mesh(upperGeom, gumMat);
  gumGroup.add(upperGum);

  // Lower gum arch points
  const lowerPts = [];
  const lowerTeethOrder = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];
  lowerTeethOrder.forEach(num => {
    const pos = calculateTooth3DPosition(num);
    lowerPts.push(new THREE.Vector3(pos.x, pos.y - 0.45, pos.z));
  });
  const lowerCurve = new THREE.CatmullRomCurve3(lowerPts);
  const lowerGeom = new THREE.TubeGeometry(lowerCurve, 40, 0.45, 12, false);
  const lowerGum = new THREE.Mesh(lowerGeom, gumMat);
  gumGroup.add(lowerGum);

  return gumGroup;
}

// Update camera position from orbit spherical coordinates
function updateCameraPosition() {
  if (!camera) return;
  camera.position.x = cameraTarget.x + cameraRadius * Math.sin(cameraPhi) * Math.sin(cameraTheta);
  camera.position.y = cameraTarget.y + cameraRadius * Math.cos(cameraPhi);
  camera.position.z = cameraTarget.z + cameraRadius * Math.sin(cameraPhi) * Math.cos(cameraTheta);
  camera.lookAt(cameraTarget);
}

// Initialize Three.js scene
export function initDental3D(container, options = {}) {
  containerEl = container;
  onToothSelectCallback = options.onSelect || null;

  // Clear container
  containerEl.innerHTML = '';
  toothGroups.clear();

  // Create Scene
  scene = new THREE.Scene();

  // Create Camera
  const width = containerEl.clientWidth || 700;
  const height = containerEl.clientHeight || 500;
  camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  cameraRadius = 14.0;
  cameraTheta = 0.28;
  cameraPhi = 1.35;
  updateCameraPosition();

  // Create Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0); // Transparent for sleek card integration
  containerEl.appendChild(renderer.domElement);

  // Studio Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const mainLight = new THREE.DirectionalLight(0xffffff, 1.4);
  mainLight.position.set(5, 10, 8);
  scene.add(mainLight);

  const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.7);
  fillLight.position.set(-6, -6, 5);
  scene.add(fillLight);

  const backLight = new THREE.DirectionalLight(0xfff7ed, 0.8);
  backLight.position.set(0, 5, -8);
  scene.add(backLight);

  // Add Gums
  scene.add(createGumsMesh());

  // Add all 32 Teeth
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

  // Floating Tooltip Badge
  const tooltip = document.createElement('div');
  tooltip.id = 'dental-3d-tooltip';
  tooltip.style.cssText = 'position: absolute; display: none; pointer-events: none; background: rgba(15, 23, 42, 0.88); color: #ffffff; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; z-index: 10; box-shadow: 0 4px 12px rgba(0,0,0,0.15); backdrop-filter: blur(4px); transition: opacity 0.15s ease;';
  containerEl.appendChild(tooltip);

  // Setup Interaction Listeners
  setupEventListeners(containerEl, tooltip);

  // Auto-resize
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

  // Start Animation Loop
  animate();

  // Apply current data if any
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

      // Orbit rotation
      cameraTheta -= deltaX * 0.008;
      cameraPhi = Math.max(0.15, Math.min(Math.PI - 0.15, cameraPhi - deltaY * 0.008));
      updateCameraPosition();

      previousMousePosition = { x: e.clientX, y: e.clientY };
      tooltip.style.display = 'none';
      return;
    }

    // Raycast for hover
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
      // Update floating tooltip
      const name = ADULT_TEETH_NAMES[hitTooth] || ('Dent ' + hitTooth);
      const data = currentTeethData[hitTooth];
      const status = data?.status || 'healthy';
      tooltip.innerHTML = `<strong>Dent ${hitTooth}</strong> : ${name} <span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:4px;font-size:11px;background:#0284c7;">${status}</span>`;
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

  // Click on tooth
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

  // Zoom with wheel
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    cameraRadius = Math.max(7.0, Math.min(26.0, cameraRadius + e.deltaY * 0.015));
    updateCameraPosition();
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
  // Deselect previous
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
}

// Update all 3D teeth colors and statuses
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

    // Reset visibility
    marker.material.visible = false;
    implant.material.visible = false;
    crown.material.transparent = false;
    crown.material.opacity = 1.0;

    // Base color from status
    const hexColor = STATUS_COLOR_HEX[status] || STATUS_COLOR_HEX.healthy;
    crown.material.color.setHex(hexColor);

    if (status === 'cavity') {
      marker.material.visible = true;
      marker.material.color.setHex(0xb45309);
    } else if (status === 'filled') {
      marker.material.visible = true;
      marker.material.color.setHex(0x2563eb);
    } else if (status === 'implant') {
      implant.material.visible = true;
      crown.material.color.setHex(0xe2e8f0);
    } else if (status === 'crown') {
      crown.material.color.setHex(0xd97706);
      crown.material.metalness = 0.55;
      crown.material.roughness = 0.2;
    } else if (status === 'extraction' || status === 'missing') {
      crown.material.transparent = true;
      crown.material.opacity = 0.22;
      group.userData.rootMeshes.forEach(r => {
        r.material.transparent = true;
        r.material.opacity = 0.15;
      });
    }

    // Treatment color override if any
    const treatment = currentTreatmentsCache[num];
    if (treatment && treatment.status === 'completed') {
      crown.material.color.setHex(0x16a34a); // Completed green
    } else if (treatment && treatment.status === 'in_progress') {
      crown.material.color.setHex(0x2563eb); // In progress blue
    }

    // Selection highlight
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
}

// Preset Camera Views
export function setDental3DView(preset) {
  currentViewPreset = preset;
  switch (preset) {
    case 'face':
      cameraTheta = 0;
      cameraPhi = Math.PI / 2;
      cameraRadius = 13.0;
      break;
    case 'upper':
      cameraTheta = 0;
      cameraPhi = Math.PI - 0.25;
      cameraRadius = 12.0;
      break;
    case 'lower':
      cameraTheta = 0;
      cameraPhi = 0.25;
      cameraRadius = 12.0;
      break;
    case 'right':
      cameraTheta = Math.PI / 2;
      cameraPhi = Math.PI / 2.2;
      cameraRadius = 13.5;
      break;
    case 'left':
      cameraTheta = -Math.PI / 2;
      cameraPhi = Math.PI / 2.2;
      cameraRadius = 13.5;
      break;
    default:
      cameraTheta = 0.28;
      cameraPhi = 1.35;
      cameraRadius = 14.0;
      break;
  }
  updateCameraPosition();
}

export function resetDental3DCamera() {
  setDental3DView('default');
}

// Animation Render Loop
function animate() {
  animationFrameId = requestAnimationFrame(animate);
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

// Cleanup
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

// Expose globals for onclick buttons in HTML
if (typeof window !== 'undefined') {
  window.setDental3DView = setDental3DView;
  window.resetDental3DCamera = resetDental3DCamera;
}
