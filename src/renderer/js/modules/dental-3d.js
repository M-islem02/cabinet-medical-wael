/**
 * Dental 3D Odontogram Module - True 3D Segmented Dental Anatomy
 *
 * 1. Loads human_mouth_optimized.glb with 28 physically separated tooth meshes.
 * 2. Maps upper_tooth_1..14 and lower_tooth_1..14 directly to FDI dental notation (17-27, 47-37).
 * 3. Highlights the ACTUAL 3D TOOTH GEOMETRY on hover (emissive cyan glow) and select (emissive gold).
 * 4. Extracted/missing teeth physically vanish from the dental arch in real-time.
 * 5. Pixel-perfect raycasting directly on the authentic 3D tooth polygons with clean mouseleave/unhighlight.
 * 6. Comfortable wide-angle dental operatory framing (proper zoom distance).
 * 7. Zero-idle demand rendering for maximum performance (0% GPU/CPU when still).
 */

import * as THREE from '../libs/three.module.js';
import { GLTFLoader } from '../libs/GLTFLoader.js';

let scene = null;
let camera = null;
let renderer = null;
let animationFrameId = null;
let resizeObserver = null;
let containerEl = null;
let mouthModel = null;

// Demand-based rendering flags (0% idle CPU/GPU consumption)
let needsRender = true;
let isRenderLoopActive = false;

// Orbit Camera State - Centered on oral cavity with comfortable wide framing
let cameraRadius = 30.0;
let targetRadius = 30.0;
let cameraTheta = 0.0;
let targetTheta = 0.0;
let cameraPhi = Math.PI / 2;
let targetPhi = Math.PI / 2;
const cameraTarget = new THREE.Vector3(0, 0.0, 3.8);

let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };
let hoveredToothNumber = null;
let currentSelectedTooth = null;
let currentViewPreset = 'face';

// Tooth mesh storage: FDI Number -> THREE.Mesh
const toothMeshMap = new Map();
const toothMeshList = []; // Array of meshes for ultra-fast raycasting

let currentTeethData = {};
let currentTreatmentsCache = {};
let onToothSelectCallback = null;

// FDI 2-digit Adult Teeth French Names
const ADULT_TEETH_NAMES = {
  18: '3ème molaire sup. droite',
  17: '2ème molaire sup. droite',
  16: '1ère molaire sup. droite',
  15: '2ème prémolaire sup. droite',
  14: '1ère prémolaire sup. droite',
  13: 'Canine sup. droite',
  12: 'Incisive latérale sup. droite',
  11: 'Incisive centrale sup. droite',

  21: 'Incisive centrale sup. gauche',
  22: 'Incisive latérale sup. gauche',
  23: 'Canine sup. gauche',
  24: '1ère prémolaire sup. gauche',
  25: '2ème prémolaire sup. gauche',
  26: '1ère molaire sup. gauche',
  27: '2ème molaire sup. gauche',
  28: '3ème molaire sup. gauche',

  38: '3ème molaire inf. gauche',
  37: '2ème molaire inf. gauche',
  36: '1ère molaire inf. gauche',
  35: '2ème prémolaire inf. gauche',
  34: '1ère prémolaire inf. gauche',
  33: 'Canine inf. gauche',
  32: 'Incisive latérale inf. gauche',
  31: 'Incisive centrale inf. gauche',

  41: 'Incisive centrale inf. droite',
  42: 'Incisive latérale inf. droite',
  43: 'Canine inf. droite',
  44: '1ère prémolaire inf. droite',
  45: '2ème prémolaire inf. droite',
  46: '1ère molaire inf. droite',
  47: '2ème molaire inf. droite',
  48: '3ème molaire inf. droite'
};

const STATUS_LABELS_FR = {
  healthy: 'Saine',
  cavity: 'Carie active',
  filled: 'Soignée / Obturée',
  crown: 'Couronne prothétique',
  bridge: 'Pilier de bridge',
  implant: 'Implant ostéointégré',
  rootCanal: 'Traitement endodontique',
  fractured: 'Dent fracturée',
  abscess: 'Abcès périapical',
  prosthesis: 'Prothèse',
  impacted: 'Dent incluse',
  extraction: 'À extraire',
  missing: 'Absente / Édentement'
};

const STATUS_CARD_COLORS = {
  healthy:    { bg: '#e8f5e9', border: '#4caf50', tc: '#2e7d32', label: 'Saine' },
  cavity:     { bg: '#fff3e0', border: '#ff9800', tc: '#e65100', label: 'Carie' },
  filled:     { bg: '#e3f2fd', border: '#2196f3', tc: '#1565c0', label: 'Obturée' },
  crown:      { bg: '#f3e5f5', border: '#9c27b0', tc: '#6a1b9a', label: 'Couronne' },
  bridge:     { bg: '#e8eaf6', border: '#3f51b5', tc: '#283593', label: 'Bridge' },
  rootCanal:  { bg: '#fce4ec', border: '#e91e63', tc: '#c62828', label: 'Dévitalisée' },
  extraction: { bg: '#ffebee', border: '#f44336', tc: '#b71c1c', label: 'Extraite' },
  implant:    { bg: '#e0f7fa', border: '#00bcd4', tc: '#00838f', label: 'Implant' },
  missing:    { bg: '#f5f5f5', border: '#9e9e9e', tc: '#616161', label: 'Absente' },
  fractured:  { bg: '#fff8e1', border: '#ffc107', tc: '#f57f17', label: 'Fracturée' },
  abscess:    { bg: '#fbe9e7', border: '#ff5722', tc: '#bf360c', label: 'Abcès' },
  impacted:   { bg: '#efebe9', border: '#795548', tc: '#4e342e', label: 'Incluse' },
  prosthesis: { bg: '#e1f5fe', border: '#03a9f4', tc: '#01579b', label: 'Prothèse' }
};

// Blender Mesh Name -> FDI Number Mapping (front view: left to right)
const TOOTH_NAME_TO_FDI = {
  // Maxillaire (Upper jaw) - from patient right to patient left
  'upper_tooth_1': 17,
  'upper_tooth_2': 16,
  'upper_tooth_3': 15,
  'upper_tooth_4': 14,
  'upper_tooth_5': 13,
  'upper_tooth_6': 12,
  'upper_tooth_7': 11,
  'upper_tooth_8': 21,
  'upper_tooth_9': 22,
  'upper_tooth_10': 23,
  'upper_tooth_11': 24,
  'upper_tooth_12': 25,
  'upper_tooth_13': 26,
  'upper_tooth_14': 27,

  // Mandibule (Lower jaw) - from patient right to patient left
  'lower_tooth_1': 47,
  'lower_tooth_2': 46,
  'lower_tooth_3': 45,
  'lower_tooth_4': 44,
  'lower_tooth_5': 43,
  'lower_tooth_6': 42,
  'lower_tooth_7': 41,
  'lower_tooth_8': 31,
  'lower_tooth_9': 32,
  'lower_tooth_10': 33,
  'lower_tooth_11': 34,
  'lower_tooth_12': 35,
  'lower_tooth_13': 36,
  'lower_tooth_14': 37
};

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
  dock.style.cssText = 'position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 6px; padding: 6px 10px; background: rgba(255, 255, 255, 0.90); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border-radius: 30px; box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(15, 23, 42, 0.08); border: 1px solid rgba(255, 255, 255, 0.9); z-index: 10; user-select: none;';

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
    btn.className = 'dental-3d-dock-btn';
    btn.dataset.view = v.id;
    btn.textContent = v.label;
    btn.style.cssText = 'padding: 5px 12px; font-size: 12px; font-weight: 600; color: #334155; background: transparent; border: none; border-radius: 20px; cursor: pointer; transition: all 0.2s ease; outline: none;';
    btn.onclick = () => setDental3DView(v.id);
    dock.appendChild(btn);
  });
  container.appendChild(dock);

  // 2. Top-Right Floating Toolset (Zoom In, Zoom Out, Center)
  const toolset = document.createElement('div');
  toolset.id = 'dental-3d-floating-tools';
  toolset.style.cssText = 'position: absolute; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 6px; background: rgba(255, 255, 255, 0.90); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); padding: 5px; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10); border: 1px solid rgba(255, 255, 255, 0.8); z-index: 10;';

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

  toolset.appendChild(makeToolBtn('+', 'Zoom avant', () => zoomDental3D(-2.5)));
  toolset.appendChild(makeToolBtn('−', 'Zoom arrière', () => zoomDental3D(2.5)));
  toolset.appendChild(makeToolBtn('⟲', 'Recentrer la vue', () => resetDental3DCamera()));
  container.appendChild(toolset);

  // 3. Top-Left Active Tooth HUD Card
  const hud = document.createElement('div');
  hud.id = 'dental-3d-active-hud';
  hud.style.cssText = 'position: absolute; top: 16px; left: 16px; display: none; background: rgba(255, 255, 255, 0.94); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); padding: 8px 14px; border-radius: 12px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.10); border: 1px solid rgba(255, 255, 255, 0.9); z-index: 10;';
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
  const sc = STATUS_CARD_COLORS[status] || STATUS_CARD_COLORS.healthy;

  hud.innerHTML = `
    <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #0284c7;">Dent sélectionnée</div>
    <div style="font-size: 13.5px; font-weight: 700; color: #0f172a; margin: 1px 0 3px 0;">Dent ${toothNumber} : ${name}</div>
    <div style="display: flex; align-items: center; gap: 6px;">
      <span style="font-size: 11.5px; color: #64748b;">Statut :</span>
      <span style="display: inline-block; padding: 2px 9px; border-radius: 6px; font-size: 11px; font-weight: 700; background: ${sc.bg}; color: ${sc.tc}; border: 1px solid ${sc.border};">${sc.label}</span>
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
  targetRadius = Math.max(10.0, Math.min(50.0, targetRadius + delta));
  requestRender();
}

/**
 * Loads the user-separated mouth GLB and binds textures directly.
 * Every tooth is mapped 1:1 to its individual 3D mesh.
 */
function loadRealisticMouthModel() {
  const loader = new GLTFLoader();
  const modelUrl = 'assets/human_mouth_optimized.glb';

  const textureLoader = new THREE.TextureLoader();

  // 1. Mouth textures (gums, palate, tongue, lips)
  const mouthMap = textureLoader.load('assets/mouth_textures/mouth_diffuse.png', () => requestRender());
  mouthMap.colorSpace = THREE.SRGBColorSpace;
  mouthMap.flipY = false;

  const mouthNormal = textureLoader.load('assets/mouth_textures/mouth_normal.png', () => requestRender());
  mouthNormal.flipY = false;

  const mouthRoughness = textureLoader.load('assets/mouth_textures/mouth_roughness.png', () => requestRender());
  mouthRoughness.flipY = false;

  const mouthMaterial = new THREE.MeshStandardMaterial({
    map: mouthMap,
    normalMap: mouthNormal,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughnessMap: mouthRoughness,
    roughness: 0.42,
    metalness: 0.01,
    side: THREE.DoubleSide
  });

  // 2. Teeth textures (enamel, grooves, realistic shading)
  const teethMap = textureLoader.load('assets/mouth_textures/teeth_diffuse.png', () => requestRender());
  teethMap.colorSpace = THREE.SRGBColorSpace;
  teethMap.flipY = false;

  const teethNormal = textureLoader.load('assets/mouth_textures/teeth_normal.png', () => requestRender());
  teethNormal.flipY = false;

  const teethRoughness = textureLoader.load('assets/mouth_textures/teeth_roughness.png', () => requestRender());
  teethRoughness.flipY = false;

  const baseTeethMaterial = new THREE.MeshStandardMaterial({
    map: teethMap,
    normalMap: teethNormal,
    normalScale: new THREE.Vector2(0.35, 0.35),
    roughnessMap: teethRoughness,
    roughness: 0.22,
    metalness: 0.02,
    side: THREE.DoubleSide
  });

  loader.load(
    modelUrl,
    (gltf) => {
      mouthModel = gltf.scene;
      mouthModel.name = 'realistic_mouth_glb';

      mouthModel.scale.set(78, 78, 78);
      mouthModel.position.set(0, 1.8, 0.8);

      toothMeshMap.clear();
      toothMeshList.length = 0;

      mouthModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false;
          child.receiveShadow = false;

          // Mouth gums/tongue mesh
          if (child.name === 'Object_4' || child.name.includes('mouth')) {
            child.material = mouthMaterial;
            return;
          }

          // Individual tooth mesh
          const fdi = TOOTH_NAME_TO_FDI[child.name];
          if (fdi) {
            const toothMat = baseTeethMaterial.clone();
            child.material = toothMat;
            child.userData = {
              toothNumber: fdi,
              toothName: child.name,
              baseMaterial: toothMat
            };
            toothMeshMap.set(fdi, child);
            toothMeshList.push(child);
          }
        }
      });

      console.log(`Loaded ${toothMeshMap.size} separated 3D teeth successfully!`);

      if (scene) {
        scene.add(mouthModel);
        requestRender();
      }
    },
    undefined,
    (err) => {
      console.warn('Could not load human_mouth_optimized.glb:', err);
    }
  );
}

// Initialize Three.js scene
export function initDental3D(container, options = {}) {
  if (scene) {
    destroyDental3D();
  }

  containerEl = container;
  onToothSelectCallback = options.onSelect || null;

  containerEl.style.position = 'relative';
  containerEl.style.overflow = 'hidden';
  containerEl.style.boxShadow = 'inset 0 2px 10px rgba(0, 0, 0, 0.05)';
  containerEl.style.border = '1px solid #cbd5e1';

  scene = new THREE.Scene();

  const width = containerEl.clientWidth || 700;
  const height = containerEl.clientHeight || 500;
  camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
  cameraRadius = 30.0;
  targetRadius = 30.0;
  cameraTheta = 0.0;
  targetTheta = 0.0;
  cameraPhi = Math.PI / 2;
  targetPhi = Math.PI / 2;
  updateCameraPosition();

  // Resolution Clamping: Clamp to 1.5 to prevent GPU lag on 4K/Retina displays
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'default',
    stencil: false,
    depth: true
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  containerEl.appendChild(renderer.domElement);

  // Natural Dental Operatory Lighting with Camera Headlamp & Omnidirectional Cavity Fill
  // 1. Examination Headlamp mounted directly on the camera (illuminates view axis without blind shadows)
  const headlight = new THREE.DirectionalLight(0xffffff, 1.45);
  headlight.position.set(0, 0, 1);
  camera.add(headlight);
  scene.add(camera);

  // 2. Soft Omnidirectional Hemisphere Light (illuminates both arches evenly with warm oral tissue bounce)
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xfce7f3, 1.05);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  // 3. Gentle Ambient Base Fill
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
  scene.add(ambientLight);

  // 4. Subtle Lateral Key Fill
  const operatoryKeyLight = new THREE.DirectionalLight(0xffffff, 0.45);
  operatoryKeyLight.position.set(2, 6, 5);
  scene.add(operatoryKeyLight);

  // Load realistic 3D mouth GLB model with separated teeth
  loadRealisticMouthModel();

  // Floating Interactive Tooltip
  const tooltip = document.createElement('div');
  tooltip.id = 'dental-3d-tooltip';
  tooltip.style.cssText = 'position: absolute; display: none; background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: #ffffff; padding: 6px 12px; border-radius: 8px; font-size: 12px; font-weight: 500; pointer-events: none; z-index: 20; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22); border: 1px solid rgba(255, 255, 255, 0.12); transition: opacity 0.12s ease;';
  containerEl.appendChild(tooltip);

  // Modern UI Dock, Floating Tools, and HUD
  build3DUIOverlay(containerEl);

  setupInteraction(containerEl);
  setupResizeObserver(containerEl);

  setDental3DView('face');
  requestRender();
}

function setupResizeObserver(container) {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0 && renderer && camera) {
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
          requestRender();
        }
      }
    });
    resizeObserver.observe(container);
  }
}

function setupInteraction(container) {
  const canvas = renderer.domElement;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const tooltip = document.getElementById('dental-3d-tooltip');

  let dragDistance = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      isDragging = true;
      dragDistance = 0;
      previousMousePosition = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      canvas.style.cursor = hoveredToothNumber ? 'pointer' : 'grab';
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    if (isDragging) {
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      targetTheta -= deltaX * 0.008;
      targetPhi = Math.max(0.15, Math.min(Math.PI - 0.15, targetPhi - deltaY * 0.008));
      currentViewPreset = 'custom';
      updateDockActiveState();

      previousMousePosition = { x: e.clientX, y: e.clientY };
      if (tooltip) tooltip.style.display = 'none';
      requestRender();
      return;
    }

    raycaster.setFromCamera(mouse, camera);
    const visibleTeeth = toothMeshList.filter(m => m.visible);
    const intersects = raycaster.intersectObjects(visibleTeeth, false);
    let hitTooth = null;

    if (intersects.length > 0) {
      hitTooth = intersects[0].object.userData.toothNumber;
    }

    if (hitTooth) {
      canvas.style.cursor = 'pointer';
      if (hoveredToothNumber !== hitTooth) {
        const prevTooth = hoveredToothNumber;
        hoveredToothNumber = hitTooth;
        if (prevTooth !== null && toothMeshMap.has(prevTooth)) {
          applyToothVisualState(toothMeshMap.get(prevTooth), prevTooth);
        }
        if (toothMeshMap.has(hitTooth)) {
          applyToothVisualState(toothMeshMap.get(hitTooth), hitTooth);
        }
        requestRender();
      }
      const name = ADULT_TEETH_NAMES[hitTooth] || ('Dent ' + hitTooth);
      const data = currentTeethData[hitTooth];
      const status = data?.status || 'healthy';
      const sc = STATUS_CARD_COLORS[status] || STATUS_CARD_COLORS.healthy;
      if (tooltip) {
        tooltip.innerHTML = `<strong>Dent ${hitTooth}</strong> : ${name} <span style="display:inline-block;margin-left:6px;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.tc};border:1px solid ${sc.border};">${sc.label}</span>`;
        tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
        tooltip.style.top = (e.clientY - rect.top + 14) + 'px';
        tooltip.style.display = 'block';
      }
    } else {
      canvas.style.cursor = 'grab';
      if (hoveredToothNumber !== null) {
        const prevTooth = hoveredToothNumber;
        hoveredToothNumber = null;
        if (toothMeshMap.has(prevTooth)) {
          applyToothVisualState(toothMeshMap.get(prevTooth), prevTooth);
        }
        requestRender();
      }
      if (tooltip) tooltip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => {
    if (hoveredToothNumber !== null) {
      const prevTooth = hoveredToothNumber;
      hoveredToothNumber = null;
      if (toothMeshMap.has(prevTooth)) {
        applyToothVisualState(toothMeshMap.get(prevTooth), prevTooth);
      }
      requestRender();
    }
    if (tooltip) tooltip.style.display = 'none';
    canvas.style.cursor = 'grab';
  });

  canvas.addEventListener('click', (e) => {
    if (dragDistance > 6) {
      dragDistance = 0;
      return;
    }
    dragDistance = 0;

    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const visibleTeeth = toothMeshList.filter(m => m.visible);
    const intersects = raycaster.intersectObjects(visibleTeeth, false);

    if (intersects.length > 0) {
      const clickedNumber = intersects[0].object.userData.toothNumber;
      selectToothIn3D(clickedNumber);
      if (typeof onToothSelectCallback === 'function') {
        onToothSelectCallback(clickedNumber);
      }
    } else {
      // Clicked outside any tooth: un-select current tooth
      selectToothIn3D(null);
      if (typeof onToothSelectCallback === 'function') {
        onToothSelectCallback(null);
      }
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    targetRadius = Math.max(10.0, Math.min(50.0, targetRadius + e.deltaY * 0.018));
    requestRender();
  }, { passive: false });
}

// Professional Clinical Visual Mapping - Exact 1:1 match with clinical drawer cards
const CLINICAL_STATUS_STYLES = {
  // Saine: Green Card (#e8f5e9, border #4caf50) -> Natural white enamel
  healthy: {
    color: 0xffffff,
    emissive: 0x000000,
    emissiveIntensity: 0.0,
    roughness: 0.22,
    metalness: 0.02
  },
  // Carie: Orange Card (#fff3e0, border #ff9800)
  cavity: {
    color: 0xffedd5, // Soft warm orange diffuse tint
    emissive: 0xff9800, // Exact card border orange
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.02
  },
  // Obturée / Soignée: Blue Card (#e3f2fd, border #2196f3)
  filled: {
    color: 0xdbeafe, // Soft blue diffuse tint
    emissive: 0x2196f3, // Exact card border blue
    emissiveIntensity: 0.52,
    roughness: 0.18,
    metalness: 0.04
  },
  // Couronne prothétique: Purple Card (#f3e5f5, border #9c27b0)
  crown: {
    color: 0xf3e8ff, // Soft purple diffuse tint
    emissive: 0x9c27b0, // Exact card border purple
    emissiveIntensity: 0.55,
    roughness: 0.12,
    metalness: 0.25
  },
  // Bridge: Indigo Card (#e8eaf6, border #3f51b5)
  bridge: {
    color: 0xe0e7ff, // Soft indigo diffuse tint
    emissive: 0x3f51b5, // Exact card border indigo
    emissiveIntensity: 0.52,
    roughness: 0.14,
    metalness: 0.15
  },
  // Dévitalisée: Pink Card (#fce4ec, border #e91e63)
  rootCanal: {
    color: 0xfce7f3, // Soft pink diffuse tint
    emissive: 0xe91e63, // Exact card border pink
    emissiveIntensity: 0.55,
    roughness: 0.22,
    metalness: 0.04
  },
  // Implant: Cyan Card (#e0f7fa, border #00bcd4)
  implant: {
    color: 0xcffafe, // Soft cyan diffuse tint
    emissive: 0x00bcd4, // Exact card border cyan
    emissiveIntensity: 0.52,
    roughness: 0.16,
    metalness: 0.35
  },
  // Fracturée: Yellow Card (#fff8e1, border #ffc107)
  fractured: {
    color: 0xfef9c3, // Soft yellow diffuse tint
    emissive: 0xffc107, // Exact card border yellow
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.02
  },
  // Abcès: Coral Card (#fbe9e7, border #ff5722)
  abscess: {
    color: 0xffedd5, // Soft coral diffuse tint
    emissive: 0xff5722, // Exact card border coral
    emissiveIntensity: 0.55,
    roughness: 0.35,
    metalness: 0.02
  },
  // Incluse: Brown Card (#efebe9, border #795548)
  impacted: {
    color: 0xf5f5f4, // Soft brown-grey diffuse tint
    emissive: 0x795548, // Exact card border brown
    emissiveIntensity: 0.45,
    roughness: 0.30,
    metalness: 0.05
  },
  // Prothèse: Light Blue Card (#e1f5fe, border #03a9f4)
  prosthesis: {
    color: 0xe0f2fe, // Soft sky blue diffuse tint
    emissive: 0x03a9f4, // Exact card border light blue
    emissiveIntensity: 0.52,
    roughness: 0.18,
    metalness: 0.05
  }
};

function applyToothVisualState(mesh, toothNumber) {
  if (!mesh || !mesh.material) return;
  const data = currentTeethData[toothNumber];
  const status = data ? data.status : 'healthy';

  // 1. Missing or Extracted: Tooth physically vanishes from the dental arch!
  if (status === 'missing' || status === 'extraction') {
    mesh.visible = false;
    return;
  }
  mesh.visible = true;

  const style = CLINICAL_STATUS_STYLES[status] || CLINICAL_STATUS_STYLES.healthy;
  mesh.material.color.setHex(style.color);
  mesh.material.roughness = style.roughness;
  mesh.material.metalness = style.metalness;

  if (toothNumber === currentSelectedTooth) {
    // Active selection: Brilliant Emerald Green glow (never clashes with statuses)
    mesh.material.emissive.setHex(0x10b981);
    mesh.material.emissiveIntensity = 0.72;
  } else if (toothNumber === hoveredToothNumber) {
    // Hover: Electric Sky Blue glow
    mesh.material.emissive.setHex(0x00b4d8);
    mesh.material.emissiveIntensity = 0.65;
  } else {
    mesh.material.emissive.setHex(style.emissive);
    mesh.material.emissiveIntensity = style.emissiveIntensity;
  }
}

function highlightHoveredTooth(num) {
  const mesh = toothMeshMap.get(num);
  if (mesh) applyToothVisualState(mesh, num);
}

function unhighlightHoveredTooth(num) {
  const mesh = toothMeshMap.get(num);
  if (mesh) applyToothVisualState(mesh, num);
}

export function selectToothIn3D(toothNumber) {
  const prevSelected = currentSelectedTooth;
  currentSelectedTooth = toothNumber;

  if (prevSelected && toothMeshMap.has(prevSelected)) {
    applyToothVisualState(toothMeshMap.get(prevSelected), prevSelected);
  }

  if (toothNumber && toothMeshMap.has(toothNumber)) {
    applyToothVisualState(toothMeshMap.get(toothNumber), toothNumber);
  }

  updateActiveToothHUD(toothNumber);
  requestRender();
}

export function updateDental3DData(teethData = {}, treatmentsCache = {}, selectedTooth = null) {
  currentTeethData = teethData || {};
  currentTreatmentsCache = treatmentsCache || {};
  currentSelectedTooth = selectedTooth;

  toothMeshMap.forEach((mesh, num) => {
    applyToothVisualState(mesh, num);
  });

  updateActiveToothHUD(selectedTooth);
  requestRender();
}

// Preset Camera Views with Smooth Gliding
export function setDental3DView(preset) {
  currentViewPreset = preset;
  switch (preset) {
    case 'face':
      targetTheta = 0;
      targetPhi = Math.PI / 2;
      targetRadius = 30.0;
      break;
    case 'upper':
      targetTheta = 0;
      targetPhi = Math.PI - 0.35;
      targetRadius = 27.0;
      break;
    case 'lower':
      targetTheta = 0;
      targetPhi = 0.35;
      targetRadius = 27.0;
      break;
    case 'right':
      targetTheta = Math.PI / 2.1;
      targetPhi = Math.PI / 2.1;
      targetRadius = 28.5;
      break;
    case 'left':
      targetTheta = -Math.PI / 2.1;
      targetPhi = Math.PI / 2.1;
      targetRadius = 28.5;
      break;
    default:
      targetTheta = 0.0;
      targetPhi = Math.PI / 2;
      targetRadius = 30.0;
      break;
  }
  updateDockActiveState();
  requestRender();
}

export function resetDental3DCamera() {
  setDental3DView('face');
}

/**
 * Intelligent Demand-Based Render Loop.
 * Automatically halts when the camera reaches target and scene is still.
 * Guarantees 0% CPU & GPU usage during idle consultation viewing.
 */
function renderStep() {
  if (!renderer || !scene || !camera) {
    isRenderLoopActive = false;
    animationFrameId = null;
    return;
  }

  const dTheta = Math.abs(targetTheta - cameraTheta);
  const dPhi = Math.abs(targetPhi - cameraPhi);
  const dRadius = Math.abs(targetRadius - cameraRadius);

  const isCameraMoving = dTheta > 0.0005 || dPhi > 0.0005 || dRadius > 0.005;

  if (isCameraMoving) {
    cameraTheta += (targetTheta - cameraTheta) * 0.14;
    cameraPhi += (targetPhi - cameraPhi) * 0.14;
    cameraRadius += (targetRadius - cameraRadius) * 0.14;
    updateCameraPosition();
    needsRender = true;
  }

  if (needsRender) {
    renderer.render(scene, camera);
    needsRender = false;
  }

  if (isCameraMoving) {
    animationFrameId = requestAnimationFrame(renderStep);
  } else {
    isRenderLoopActive = false;
    animationFrameId = null;
  }
}

export function requestRender() {
  needsRender = true;
  if (!isRenderLoopActive) {
    isRenderLoopActive = true;
    animationFrameId = requestAnimationFrame(renderStep);
  }
}

export function isDental3DInitialized() {
  return scene !== null && renderer !== null;
}

export function destroyDental3D() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  isRenderLoopActive = false;

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (renderer && renderer.domElement && renderer.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement);
  }

  if (containerEl) {
    const dock = containerEl.querySelector('#dental-3d-floating-dock');
    const tools = containerEl.querySelector('#dental-3d-floating-tools');
    const hud = containerEl.querySelector('#dental-3d-active-hud');
    const tooltip = containerEl.querySelector('#dental-3d-tooltip');
    if (dock) dock.remove();
    if (tools) tools.remove();
    if (hud) hud.remove();
    if (tooltip) tooltip.remove();
  }

  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  scene = null;
  camera = null;
  containerEl = null;
  mouthModel = null;
  toothMeshMap.clear();
  toothMeshList.length = 0;
  hoveredToothNumber = null;
  currentSelectedTooth = null;
}
