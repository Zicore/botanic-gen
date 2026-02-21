import React, { useState, useEffect, useRef } from 'react';
import { Settings, RefreshCw, Sliders, Box, Layers, Zap, Download, Palette, Eye } from 'lucide-react';
import { HexColorPicker } from 'react-colorful';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// --- Helper: Seeded Random Number Generator ---
function mulberry32(a) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// --- Color Picker Popover Component ---
function ColorPickerControl({ label, color, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return (
    <div className="flex flex-col gap-1.5 group" ref={ref}>
      <label className="text-sm text-gray-300 font-medium group-hover:text-white transition-colors">{label}</label>
      <div className="flex gap-2 items-center">
        <button
          onClick={() => setOpen(!open)}
          className="w-9 h-9 rounded-lg border border-white/20 hover:border-white/40 cursor-pointer shadow-inner transition-all"
          style={{ backgroundColor: color }}
        />
        <input
          type="text"
          value={color}
          onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs font-mono text-gray-300 w-24 focus:outline-none focus:border-purple-400/50"
        />
      </div>
      {open && (
        <div className="relative z-50">
          <div className="absolute top-1 left-0 bg-gray-800 border border-white/15 rounded-xl p-3 shadow-2xl">
            <HexColorPicker color={color} onChange={onChange} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const mountRef = useRef(null);
  const scriptsLoaded = true;
  const sceneRef = useRef(null);
  const materialsRef = useRef({});
  const [appMode, setAppMode] = useState('generator');
  const [texturePreviewUrl, setTexturePreviewUrl] = useState(null);
  const [textureType, setTextureType] = useState('broadleaf');
  const [textureResolution, setTextureResolution] = useState(256);

  // --- Material Colors (per type defaults) ---
  const DEFAULT_COLORS = {
    broadleaf: { leaf: '#4ade80', trunk: '#3d2817' },
    pine:      { leaf: '#2d6a4f', trunk: '#3d2817' },
    palm:      { leaf: '#52b788', trunk: '#3d2817' },
    bush:      { leaf: '#6ee7b7', trunk: '#4a3b2c' },
    grass:     { leaf: '#3a7032', trunk: '#3a7032' },
  };
  const [materialColors, setMaterialColors] = useState(() => JSON.parse(JSON.stringify(DEFAULT_COLORS)));
  const currentLeafColor = materialColors[textureType]?.leaf || '#4ade80';
  const currentTrunkColor = materialColors[textureType]?.trunk || '#3d2817';
  const setLeafColor = (c) => setMaterialColors(prev => ({ ...prev, [textureType]: { ...prev[textureType], leaf: c } }));
  const setTrunkColor = (c) => setMaterialColors(prev => ({ ...prev, [textureType]: { ...prev[textureType], trunk: c } }));
  const [texEditParams, setTexEditParams] = useState({
    flipVertical: false,
    textureSeed: 7,
    leafScale: 1.0,
    leafCount: 6,
    leafSpread: 1.0,
    leafWidth: 1.0,
    leafPointiness: 1.0,
    leafRandomize: 0.3,
    leafVerticalSpread: 1.0,
    leafHorizontalSpread: 0.3,
    leafRotationRange: 1.0,
    needleSpacing: 6,
    needleWidth: 1.0,
    needleDropAngle: 1.0,
    frondCount: 32,
    frondWidth: 1.0,
    frondThickness: 0.8,
    bladeCount: 12,
    bladeWidth: 1.0,
    bladeCurve: 1.0,
    stemThickness: 1.0,
  });
  const handleTexEditChange = (key, value) => {
    setTexEditParams(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  // --- Tree Parameters State ---
  const [params, setParams] = useState({
    seed: 12345,
    treeType: 'broadleaf', 
    height: 12,
    radius: 1.5,
    levels: 4,
    spread: 0.8,
    branchProbability: 0.8,
    trunkClearance: 0.4,
    leafDensity: 8,
    leafSize: 1.5,
    whorlCount: 7, 
    leafDroop: 0.8, 
    palmLeafWidth: 1.0, 
    palmFrondCount: 45, 
    palmFrondThickness: 0.8,
    palmTrunkSections: 6,
    palmNoise: 0.3,
    bendFactor: 1.0,
    stemCount: 1,
    groundSpread: 0.0, 
    grassStyle: 'quad', 
    quadSegments: 4,
    meshResolution: 8,
    leafMeshResolution: 10,
    isStylized: true
  });

  const handleParamChange = (key, value) => {
    setParams(prev => ({ ...prev, [key]: parseFloat(value) }));
  };

  const randomizeSeed = () => {
    setParams(prev => ({ ...prev, seed: Math.floor(Math.random() * 1000000) }));
  };

  const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

  // --- Tree Presets (Optimized for AAA Look) ---
  const PRESETS = {
    broadleaf: { treeType: 'broadleaf', height: 14, radius: 1.6, levels: 4, spread: 0.85, branchProbability: 0.7, trunkClearance: 0.35, leafDensity: 6, leafSize: 1.6, whorlCount: 5, leafDroop: 0.5, palmLeafWidth: 1.0, palmFrondCount: 30, palmFrondThickness: 0.8, palmTrunkSections: 6, palmNoise: 0.3, bendFactor: 1.0, stemCount: 1, groundSpread: 0.0, grassStyle: '3d', quadSegments: 1 },
    pine: { treeType: 'pine', height: 20, radius: 1.0, levels: 2, spread: 0.35, branchProbability: 0.85, trunkClearance: 0.1, leafDensity: 6, leafSize: 2.0, whorlCount: 12, leafDroop: 0.3, palmLeafWidth: 1.0, palmFrondCount: 30, palmFrondThickness: 0.8, palmTrunkSections: 6, palmNoise: 0.3, bendFactor: 0.8, stemCount: 1, groundSpread: 0.0, grassStyle: '3d', quadSegments: 1 },
    palm: { treeType: 'palm', height: 16, radius: 0.8, levels: 1, spread: 0.2, branchProbability: 1.0, trunkClearance: 0.95, leafDensity: 14, leafSize: 6.0, whorlCount: 1, leafDroop: 1.5, palmLeafWidth: 2.0, palmFrondCount: 38, palmFrondThickness: 0.8, palmTrunkSections: 6, palmNoise: 0.3, bendFactor: 1.0, stemCount: 1, groundSpread: 0.0, grassStyle: '3d', quadSegments: 1 },
    bush: { treeType: 'bush', height: 5, radius: 0.3, levels: 3, spread: 1.2, branchProbability: 0.85, trunkClearance: 0.05, leafDensity: 12, leafSize: 2.0, whorlCount: 5, leafDroop: 0.5, palmLeafWidth: 1.0, palmFrondCount: 30, palmFrondThickness: 0.8, palmTrunkSections: 6, palmNoise: 0.3, bendFactor: 1.6, stemCount: 8, groundSpread: 1.5, grassStyle: '3d', quadSegments: 1 },
    grass: { treeType: 'grass', height: 2.5, radius: 0.05, levels: 0, spread: 0.6, branchProbability: 0.0, trunkClearance: 0.0, leafDensity: 0, leafSize: 0.0, whorlCount: 1, leafDroop: 0.0, palmLeafWidth: 1.0, palmFrondCount: 30, palmFrondThickness: 0.8, palmTrunkSections: 6, palmNoise: 0.3, bendFactor: 1.5, stemCount: 50, groundSpread: 3.5, grassStyle: 'quad', quadSegments: 4 }
  };

  const applyPreset = (presetKey) => {
    setParams(prev => ({
      ...prev,
      ...PRESETS[presetKey],
      seed: Math.floor(Math.random() * 1000000)
    }));
    setTextureType(presetKey === 'grass' ? 'grass' : presetKey);
  };

  // --- GLTF Export Logic ---
  const exportToGLTF = () => {
    if (!sceneRef.current) {
      return;
    }
    
    const exporter = new GLTFExporter();
    exporter.parse(
      sceneRef.current.treeGroup,
      (result) => {
        const blob = new Blob([result], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = `BotanicGen_${capitalize(params.treeType)}_${params.seed}.glb`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      },
      { binary: true } 
    );
  };

  // --- 3D Scene Setup ---
  useEffect(() => {
    if (!mountRef.current) return;

    if (!sceneRef.current) {
      const scene = new THREE.Scene();
      
      const skyColor = new THREE.Color(0x7ec8f2);
      scene.background = skyColor;
      scene.fog = new THREE.Fog(skyColor, 120, 400);

      const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(-8, 15, 40);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      mountRef.current.appendChild(renderer.domElement);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.maxPolarAngle = Math.PI / 2 - 0.05; 
      controls.enableZoom = true; 
      controls.minDistance = 2; 
      controls.maxDistance = 150;
      controls.target.set(0, 8, 0); 

      const ambientLight = new THREE.AmbientLight(0xfff8ee, 0.4);
      scene.add(ambientLight);

      const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.5);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xfff4d6, 2.2);
      dirLight.position.set(25, 45, 20);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 2048;
      dirLight.shadow.mapSize.height = 2048;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 150;
      dirLight.shadow.camera.left = -30;
      dirLight.shadow.camera.right = 30;
      dirLight.shadow.camera.top = 30;
      dirLight.shadow.camera.bottom = -30;
      dirLight.shadow.bias = -0.0005;
      scene.add(dirLight);

      const groundGeo = new THREE.PlaneGeometry(200, 200);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x4a7a3a,
        roughness: 0.85,
        metalness: 0.02
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const treeGroup = new THREE.Group();
      scene.add(treeGroup);
      
      if (!materialsRef.current.textures) {
        materialsRef.current.textures = {};
        const createTexture = (drawFunction) => {
          const canvas = document.createElement('canvas');
          canvas.width = 256; canvas.height = 256;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#ffffff';
          drawFunction(ctx);
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          return tex;
        };

        // Broadleaf (Cluster)
        materialsRef.current.textures.broadleaf = createTexture((ctx) => {
          const drawLeaf = (cx, cy, scale, rot) => {
              ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale, scale);
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, -30, 0, -60); ctx.quadraticCurveTo(-20, -30, 0, 0); ctx.fill();
              ctx.restore();
          };
          drawLeaf(128, 240, 2.5, 0); drawLeaf(128, 240, 2.2, -0.6); drawLeaf(128, 240, 2.2, 0.6);
          drawLeaf(128, 180, 2.0, -1.2); drawLeaf(128, 180, 2.0, 1.2); drawLeaf(128, 100, 2.5, 0);
        });

        // Pine (Sweeping, drooping needles for the "eyelash" look)
        materialsRef.current.textures.pine = createTexture((ctx) => {
          ctx.fillRect(124, 0, 8, 256); 
          for(let y=10; y<250; y+=6) { 
             let w = Math.sin((y/256) * Math.PI) * 90 + 15; 
             ctx.beginPath(); ctx.moveTo(128, y - 2);
             ctx.lineTo(128 - w, y + 25); ctx.lineTo(128, y + 5); ctx.fill(); 
             ctx.beginPath(); ctx.moveTo(128, y - 2);
             ctx.lineTo(128 + w, y + 25); ctx.lineTo(128, y + 5); ctx.fill();
          }
        });

        // Bush
        materialsRef.current.textures.bush = createTexture((ctx) => {
          const drawLeaf = (cx, cy, scale, rot) => {
              ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale, scale);
              ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(15, -25, 0, -50); ctx.quadraticCurveTo(-15, -25, 0, 0); ctx.fill();
              ctx.restore();
          };
          for(let i=0; i<18; i++) {
              const r1 = (Math.sin(i*12.9898)*43758.5453)%1;
              const r2 = (Math.sin(i*78.233)*43758.5453)%1;
              const r3 = (Math.sin(i*31.233)*43758.5453)%1;
              drawLeaf(128 + (r1-0.5)*120, 128 + (r2-0.5)*120, 1.0 + r3*0.8, r1 * Math.PI * 2);
          }
        });

        // Quad Grass (Multiple blades per texture)
        materialsRef.current.textures.quadGrass = createTexture((ctx) => {
          for(let i=0; i<12; i++) {
              let startX = 30 + Math.random() * 196;
              let endX = startX + (Math.random() - 0.5) * 80;
              let height = 80 + Math.random() * 160;
              ctx.beginPath();
              ctx.moveTo(startX - 8, 256);
              ctx.quadraticCurveTo(startX, 256 - height * 0.5, endX, 256 - height);
              ctx.quadraticCurveTo(startX + 8, 256 - height * 0.5, startX + 8, 256);
              ctx.fill();
          }
        });
      }

      sceneRef.current = { scene, camera, renderer, controls, treeGroup, ground, dirLight };

      const onWindowResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener('resize', onWindowResize);

      let animationFrameId = null;
      let isDisposed = false;
      const animate = () => {
        if (isDisposed) return;
        animationFrameId = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      return () => {
        isDisposed = true;
        if (animationFrameId !== null) {
          cancelAnimationFrame(animationFrameId);
        }
        window.removeEventListener('resize', onWindowResize);
        controls.dispose();
        if (mountRef.current && renderer.domElement && renderer.domElement.parentNode === mountRef.current) {
          mountRef.current.removeChild(renderer.domElement);
        }
        renderer.dispose();
        sceneRef.current = null;
      };
    }
  }, []);

  // --- Tree Generation Logic ---
  useEffect(() => {
    if (!sceneRef.current) return;
    const { treeGroup } = sceneRef.current;

    const safeMergeGeometries = (geometries) => {
      if (!geometries || geometries.length === 0) return null;
      const merged = mergeGeometries(geometries);
      if (merged) return merged;
      const normalized = geometries.map((geo) => {
        const source = geo.index ? geo.toNonIndexed() : geo.clone();
        return source;
      });
      return mergeGeometries(normalized);
    };
    
    treeGroup.traverse((child) => {
      if (child.isMesh) {
        child.geometry.dispose();
        if (child.material.isMaterial) {
          child.material.dispose();
        } else {
          for (const material of child.material) material.dispose();
        }
      }
    });
    treeGroup.clear();

    const rand = mulberry32(params.seed);

    let leafTex = materialsRef.current.textures[params.treeType] || materialsRef.current.textures.broadleaf;
    if (params.treeType === 'grass' && params.grassStyle === 'quad') leafTex = materialsRef.current.textures.quadGrass;

    const typeColors = materialColors[params.treeType] || materialColors.broadleaf;
    let trunkColor = new THREE.Color(typeColors.trunk).getHex();
    let leafColor = new THREE.Color(typeColors.leaf).getHex();

    const trunkMat = params.isStylized 
      ? new THREE.MeshToonMaterial({ color: trunkColor, name: `Mat_Trunk_${capitalize(params.treeType)}` }) 
      : new THREE.MeshStandardMaterial({ color: trunkColor, roughness: 0.9, metalness: 0.0, bumpScale: 0.05, name: `Mat_Trunk_${capitalize(params.treeType)}` });

    const leafMat = params.isStylized
      ? new THREE.MeshToonMaterial({ color: leafColor, map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, name: `Mat_Leaves_${capitalize(params.treeType)}` })
      : new THREE.MeshStandardMaterial({ color: leafColor, map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, name: `Mat_Leaves_${capitalize(params.treeType)}` });

    const woodGeometries = [];
    const leafGeometries = [];

    const createBranchGeometry = (points, radii, radialSegments, seed, treeType) => {
      const pos = [];
      const indices = [];
      let currentRight = new THREE.Vector3();
      let currentForward = new THREE.Vector3();

      for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const r = radii[i];
          let dir = new THREE.Vector3();
          
          if (i === 0) {
              dir.subVectors(points[1], p);
          } else if (i === points.length - 1) {
              dir.subVectors(p, points[i - 1]);
          } else {
              dir.subVectors(points[i + 1], points[i - 1]);
          }
          
          if (dir.lengthSq() > 0.00001) {
              dir.normalize();
          } else {
              dir.set(0, 1, 0);
          }

          if (i === 0) {
              const up = Math.abs(dir.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
              currentRight.crossVectors(up, dir).normalize();
              currentForward.crossVectors(dir, currentRight).normalize();
          } else {
              currentRight.projectOnPlane(dir);
              if (currentRight.lengthSq() > 0.00001) currentRight.normalize(); 
              currentForward.crossVectors(dir, currentRight).normalize();
          }

          for (let j = 0; j <= radialSegments; j++) {
              const angle = (j / radialSegments) * Math.PI * 2;
              const cos = Math.cos(angle);
              const sin = Math.sin(angle);
              
              const noiseFactor = treeType === 'palm' ? 0.01 : 0.15;
              const noise = Math.sin(p.y * 5 + seed) * noiseFactor * r;
              // Palm trunk rings — alternating wider/narrower rings
              const ringBump = treeType === 'palm' ? Math.cos(i * Math.PI) * r * 0.06 : 0;
              const finalR = r + (i > 0 && i < points.length - 1 ? noise + ringBump : 0);

              pos.push(
                p.x + finalR * (currentRight.x * cos + currentForward.x * sin),
                p.y + finalR * (currentRight.y * cos + currentForward.y * sin),
                p.z + finalR * (currentRight.z * cos + currentForward.z * sin)
              );
          }
      }

      for (let i = 0; i < points.length - 1; i++) {
          for (let j = 0; j < radialSegments; j++) {
              const a = i * (radialSegments + 1) + j;
              const b = i * (radialSegments + 1) + j + 1;
              const c = (i + 1) * (radialSegments + 1) + j;
              const d = (i + 1) * (radialSegments + 1) + j + 1;
              indices.push(a, b, c);
              indices.push(b, d, c);
          }
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return geo;
    };

    const buildPath = (startMatrix, baseLength, baseRadius, maxLevel, isMainTrunk = false, passedTrunkRatio = 0) => {
      const points = [];
      const radii = [];

      let currentMatrix = startMatrix.clone();
      let currentRadius = baseRadius;
      let currentLength = baseLength;

      for (let level = maxLevel; level >= 0; level--) {
          let subSegments = level === maxLevel ? 5 : 3; 
          if (isMainTrunk && params.treeType === 'pine') {
              subSegments = Math.max(3, Math.floor(params.whorlCount)); 
          } else if (isMainTrunk && params.treeType === 'palm') {
              subSegments = Math.max(4, Math.floor(params.palmTrunkSections));
          } else if (params.treeType === 'bush') {
              subSegments = 4; 
          } else if (params.treeType === 'grass') {
              subSegments = 5; 
          }

          const stepLen = currentLength / subSegments;

          for (let s = 0; s < subSegments; s++) {
              const pt = new THREE.Vector3().setFromMatrixPosition(currentMatrix);
              points.push(pt);
              
              let tipR = currentRadius * 0.6;
              if (params.treeType === 'palm') {
                  // Direct radius from Y-position — no interpolation reset at level boundary
                  const trunkProgress = isMainTrunk ? Math.min(1, new THREE.Vector3().setFromMatrixPosition(currentMatrix).y / params.height) : 0.5;
                  const taperCurve = 1.0 - 0.2 * Math.pow(trunkProgress, 1.2);
                  radii.push(baseRadius * taperCurve);
              } else {
                  if (params.treeType === 'bush') tipR = currentRadius * 0.4;
                  if (params.treeType === 'grass') tipR = 0.0;
                  if (level === 0) tipR = 0;
                  radii.push(currentRadius - (currentRadius - tipR) * (s / subSegments));
              }

              currentMatrix.multiply(new THREE.Matrix4().makeTranslation(0, stepLen, 0));

              let currentTrunkRatio = passedTrunkRatio;
              if (isMainTrunk) {
                  const currentY = new THREE.Vector3().setFromMatrixPosition(currentMatrix).y;
                  currentTrunkRatio = Math.min(1.0, currentY / params.height);
              }

              // --- Bending & Gravity ---
              if (params.treeType === 'palm' && isMainTrunk) {
                  // Use currentTrunkRatio (continuous 0→1 based on actual Y) to avoid kink at level boundary
                  const t = currentTrunkRatio;
                  const bendCurve = 1.0 - t * 0.5; // stronger bend at base
                  const totalSections = params.palmTrunkSections * (maxLevel + 1);
                  const bendPerSeg = (0.3 * params.bendFactor * bendCurve) / totalSections;
                  // Organic wobble controlled by palmNoise
                  const noiseZ = Math.sin(t * Math.PI * 3 + params.seed) * 0.02 * params.palmNoise;
                  const noiseX = Math.cos(t * Math.PI * 2.3 + params.seed * 1.7) * 0.015 * params.palmNoise;
                  currentMatrix.multiply(new THREE.Matrix4().makeRotationZ(bendPerSeg + noiseZ));
                  currentMatrix.multiply(new THREE.Matrix4().makeRotationX(noiseX));
              } else if (params.treeType === 'pine' && !isMainTrunk) {
                  // Gentle downward droop along the branch
                  const segRatio = s / subSegments;
                  const droopBend = segRatio * 0.3 * params.bendFactor;
                  currentMatrix.multiply(new THREE.Matrix4().makeRotationZ(droopBend / subSegments));
              } else if (params.treeType !== 'pine' && params.treeType !== 'grass') {
                  const baseBend = params.treeType === 'bush' ? 0.4 : 0.25; 
                  const totalBend = (level === maxLevel ? baseBend : baseBend*1.5) * params.bendFactor;
                  currentMatrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
                      (rand() - 0.5) * (totalBend / subSegments), 0, (rand() - 0.5) * (totalBend / subSegments)
                  )));
              }

              if (level > 0 && s > 0 && params.treeType !== 'palm') {
                  let numLaterals = Math.floor(rand() * 2.5);
                  
                  if (params.treeType === 'pine') {
                      if (isMainTrunk) {
                          numLaterals = Math.floor(3 + rand() * 2);
                      } else {
                          numLaterals = Math.floor(rand() * 2);
                      }
                  } else if (params.treeType === 'bush') {
                      numLaterals = Math.floor(rand() * 3.5); 
                  }

                  const whorlOffset = rand() * Math.PI * 2; 

                  for (let i = 0; i < numLaterals; i++) {
                      if (rand() > params.branchProbability) continue;
                      if (isMainTrunk && currentTrunkRatio < params.trunkClearance) continue;

                      const spawnMatrix = currentMatrix.clone();
                      
                      let rotY, rotZ, rotX;
                      if (params.treeType === 'pine') {
                          if (isMainTrunk) {
                              rotY = (Math.PI * 2 / numLaterals) * i + whorlOffset;
                              const safeRatio = Math.max(0, currentTrunkRatio);
                              // Bottom branches droop down, top branches angle slightly upward
                              const angleBottom = 1.2 + (0.15 * params.bendFactor);
                              const angleTop = 0.5;
                              rotZ = angleBottom - (Math.pow(safeRatio, 0.6) * (angleBottom - angleTop));
                              rotZ += (rand() - 0.5) * 0.08;
                              rotX = (rand() - 0.5) * 0.08;
                          } else {
                              rotY = (i % 2 === 0 ? 1 : -1) * (Math.PI / 2 + (rand() - 0.5) * 0.15);
                              rotZ = 0.1 + rand() * 0.1;
                              rotX = 0;
                          }
                      } else {
                          rotY = rand() * Math.PI * 2;
                          const spreadMultiplier = params.treeType === 'bush' ? 1.5 : 1.0;
                          rotZ = params.spread * spreadMultiplier * (0.4 + rand() * 0.6);
                          rotX = (rand() - 0.5) * params.spread * spreadMultiplier;
                      }

                      spawnMatrix.multiply(new THREE.Matrix4().makeRotationY(rotY));
                      spawnMatrix.multiply(new THREE.Matrix4().makeRotationZ(rotZ));
                      spawnMatrix.multiply(new THREE.Matrix4().makeRotationX(rotX));

                      let latRadius = currentRadius * (params.treeType === 'pine' ? (isMainTrunk ? 0.3 : 0.5) : 0.6);
                      let latLength = currentLength * (0.6 + rand() * 0.4);

                      if (params.treeType === 'pine') {
                          if (isMainTrunk) {
                              const taperRatio = Math.max(0.05, 1.0 - currentTrunkRatio);
                              latLength = params.height * 0.25 * taperRatio * (0.8 + rand() * 0.3);
                          } else {
                              latLength = currentLength * 0.5;
                          }
                      }

                      buildPath(spawnMatrix, latLength, latRadius, level - 1, false, currentTrunkRatio);
                  }
              }
          }

          if (level > 0) {
              currentRadius = params.treeType === 'palm' ? currentRadius : currentRadius * 0.6;
              currentLength = currentLength * (0.7 + rand() * 0.2);
              if (params.treeType !== 'pine' && params.treeType !== 'grass' && params.treeType !== 'palm') {
                  currentMatrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
                      (rand() - 0.5) * 0.25, 0, (rand() - 0.5) * 0.25
                  )));
              }
          } else {
              const ptTip = new THREE.Vector3().setFromMatrixPosition(currentMatrix);
              points.push(ptTip);
              radii.push(params.treeType === 'palm' ? currentRadius * 0.6 : 0);

              if (params.treeType === 'palm') {
                  // Crown shaft — subtle bulge where fronds emerge
                  const crownGeo = new THREE.IcosahedronGeometry(currentRadius * 1.4, 2);
                  crownGeo.scale(1, 1.5, 1);
                  crownGeo.translate(0, currentRadius * 0.3, 0);
                  crownGeo.applyMatrix4(currentMatrix);
                  const crownCol = new THREE.Color(typeColors.leaf).multiplyScalar(0.7);
                  const crownMesh = new THREE.Mesh(crownGeo, new THREE.MeshStandardMaterial({
                      color: crownCol,
                      roughness: 0.9,
                  }));
                  crownMesh.name = `Mesh_Palm_Crown`;
                  crownMesh.castShadow = true;
                  crownMesh.receiveShadow = true;
                  treeGroup.add(crownMesh);
              }

              let densityFactor = params.treeType === 'pine' ? 2.5 : 1.0; 
              if (params.treeType === 'palm') densityFactor = 1.0;
              if (params.treeType === 'bush') densityFactor = 1.3; 
              
              const numLeaves = Math.floor(params.leafDensity * densityFactor * (0.8 + rand() * 0.4));
              
              for (let i = 0; i < numLeaves; i++) {
                  let lSize = params.leafSize * (0.8 + rand() * 0.6);
                  let planeGeo;
                  
                  if (params.treeType === 'palm') {
                      const length = lSize * 2.0;
                      const width = lSize * params.palmLeafWidth;
                      const leafSegs = Math.max(3, Math.floor(params.leafMeshResolution));
                      planeGeo = new THREE.PlaneGeometry(width, length, Math.max(2, Math.floor(leafSegs / 2)), leafSegs);
                      planeGeo.translate(0, length / 2, 0);
                      const pos = planeGeo.attributes.position;
                      const halfW = width / 2;
                      for(let j=0; j<pos.count; j++) {
                          const yNorm = Math.max(0, pos.getY(j) / length);
                          const x = pos.getX(j);
                          const xNorm = halfW > 0 ? Math.abs(x) / halfW : 0;
                          // Droop along length
                          const droop = Math.pow(yNorm, 2.5) * (length * params.leafDroop * 0.5);
                          // Lengthwise wobble — gentle wave
                          const wobble = Math.sin(yNorm * Math.PI * 3) * length * 0.03;
                          // V-curve across width — edges fold down slightly
                          const vCurve = xNorm * xNorm * length * 0.06;
                          pos.setZ(j, droop + wobble - vCurve);
                          // Taper width toward tip
                          const widthTaper = 1.0 - Math.pow(yNorm, 2.5) * 0.6;
                          pos.setX(j, x * widthTaper);
                      }
                      planeGeo.computeVertexNormals();
                  } else if (params.treeType === 'pine') {
                      const length = lSize * 2.8;
                      planeGeo = new THREE.PlaneGeometry(lSize * 1.2, length, 1, 5);
                      planeGeo.translate(0, length / 2, 0); 
                      const pos = planeGeo.attributes.position;
                      for(let j=0; j<pos.count; j++) {
                          const yNorm = Math.max(0, pos.getY(j) / length);
                          pos.setZ(j, Math.pow(yNorm, 1.5) * (length * 0.4)); 
                      }
                      planeGeo.computeVertexNormals();
                  } else {
                      planeGeo = new THREE.PlaneGeometry(lSize, lSize);
                      planeGeo.translate(0, lSize/2, 0);
                  }
                  
                  const leafMatrix = currentMatrix.clone();
                  
                  if (params.treeType === 'palm') {
                      // Two tiers: inner (newer, more upright) and outer (older, more spread)
                      const isInner = i < numLeaves * 0.35;
                      const tierOffset = isInner ? 0.4 : 0;
                      // Outward tilt: inner fronds ~45° from vertical, outer ~70°
                      const tiltAngle = isInner ? 0.7 : 1.1 + (rand() - 0.5) * 0.2;

                      leafMatrix.multiply(new THREE.Matrix4().makeTranslation(0, tierOffset, 0));
                      leafMatrix.multiply(new THREE.Matrix4().makeRotationY((Math.PI * 2 / numLeaves) * i + rand() * 0.15));
                      leafMatrix.multiply(new THREE.Matrix4().makeRotationX(tiltAngle));
                      const card1 = planeGeo.clone();
                      card1.applyMatrix4(leafMatrix);
                      leafGeometries.push(card1);
                  } else if (params.treeType === 'pine') {
                      const backOffset = rand() * (baseLength * 0.6);
                      const randomSpin = rand() * Math.PI;

                      const leafMatrix1 = currentMatrix.clone();
                      leafMatrix1.multiply(new THREE.Matrix4().makeTranslation(0, -backOffset, 0));
                      leafMatrix1.multiply(new THREE.Matrix4().makeRotationY(randomSpin)); 
                      const flareAngle = 0.1 + (params.leafDroop * 0.2);
                      leafMatrix1.multiply(new THREE.Matrix4().makeRotationX(flareAngle)); 
                      
                      const card1 = planeGeo.clone();
                      card1.applyMatrix4(leafMatrix1);
                      
                      const leafMatrix2 = currentMatrix.clone();
                      leafMatrix2.multiply(new THREE.Matrix4().makeTranslation(0, -backOffset, 0));
                      leafMatrix2.multiply(new THREE.Matrix4().makeRotationY(randomSpin + Math.PI / 3)); 
                      leafMatrix2.multiply(new THREE.Matrix4().makeRotationX(flareAngle)); 

                      const card2 = planeGeo.clone();
                      card2.applyMatrix4(leafMatrix2);
                      
                      leafGeometries.push(card1, card2);
                  } else {
                      leafMatrix.multiply(new THREE.Matrix4().makeTranslation(
                          (rand() - 0.5) * (lSize * 0.4), (rand() - 0.5) * (lSize * 0.4), (rand() - 0.5) * (lSize * 0.4)
                      ));
                      leafMatrix.multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(
                          (rand() - 0.5) * Math.PI, rand() * Math.PI, (rand() - 0.5) * Math.PI
                      )));
                      
                      const card1 = planeGeo.clone();
                      const card2 = planeGeo.clone();
                      card2.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
                      card1.applyMatrix4(leafMatrix);
                      card2.applyMatrix4(leafMatrix);
                      leafGeometries.push(card1, card2);
                  }
              }

              // Crown Tuft for Pine
              if (params.treeType === 'pine' && isMainTrunk) {
                  let lSize = params.leafSize * 0.9;
                  const length = lSize * 2.5;
                  const tipPlaneGeo = new THREE.PlaneGeometry(lSize * 1.2, length, 1, 5);
                  tipPlaneGeo.translate(0, length / 2, 0); 
                  const pos = tipPlaneGeo.attributes.position;
                  for(let j=0; j<pos.count; j++) {
                      const yNorm = Math.max(0, pos.getY(j) / length);
                      pos.setZ(j, Math.pow(yNorm, 1.5) * (length * 0.4)); 
                  }
                  tipPlaneGeo.computeVertexNormals();

                  for(let t=0; t<4; t++) {
                      const tipMatrix = currentMatrix.clone();
                      tipMatrix.multiply(new THREE.Matrix4().makeRotationY((Math.PI / 2) * t));
                      tipMatrix.multiply(new THREE.Matrix4().makeRotationX(0.05)); 
                      const tipCard = tipPlaneGeo.clone();
                      tipCard.applyMatrix4(tipMatrix);
                      leafGeometries.push(tipCard);
                  }
              }
          }
      }

      const segments = Math.max(3, Math.floor(params.meshResolution));
      if (points.length > 1) {
          const geo = createBranchGeometry(points, radii, segments, params.seed, params.treeType);
          woodGeometries.push(geo);
      }
    };

    // --- Multi-Stem & Grass Initialization ---
    if (params.treeType === 'grass' && params.grassStyle === 'quad') {
        const clumpCount = params.stemCount;
        
        const segments = Math.max(1, Math.floor(params.quadSegments));
        const basePlane = new THREE.PlaneGeometry(1, 1, 1, segments);
        basePlane.translate(0, 0.5, 0); 
        
        const plane2 = basePlane.clone();
        plane2.applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI / 2));
        const mergedBase = safeMergeGeometries([basePlane, plane2]);
        if (!mergedBase) return;

        for (let i = 0; i < clumpCount; i++) {
            const offsetX = (rand() - 0.5) * params.groundSpread * 2;
            const offsetZ = (rand() - 0.5) * params.groundSpread * 2;
            
            const clumpWidth = params.height * 0.6 + rand() * 0.2;
            const clumpHeight = params.height * (0.8 + rand() * 0.4);

            const clumpGeo = mergedBase.clone();
            clumpGeo.applyMatrix4(new THREE.Matrix4().makeScale(clumpWidth, clumpHeight, clumpWidth));
            
            const randomSpin = rand() * Math.PI;
            clumpGeo.applyMatrix4(new THREE.Matrix4().makeRotationY(randomSpin));

            const dist = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
            const outwardAngle = Math.atan2(offsetX, offsetZ);
            const bendAmount = params.bendFactor * 0.5 * (dist / (params.groundSpread || 1)) + (rand() * 0.1);

            if (segments > 1 && bendAmount > 0) {
                const pos = clumpGeo.attributes.position;
                for(let j=0; j<pos.count; j++) {
                    const yNorm = Math.max(0, pos.getY(j) / clumpHeight);
                    const zOffset = Math.pow(yNorm, 2) * bendAmount * clumpHeight;
                    pos.setZ(j, pos.getZ(j) + zOffset);
                }
                clumpGeo.computeVertexNormals();
            }

            const matrix = new THREE.Matrix4();
            matrix.multiply(new THREE.Matrix4().makeTranslation(offsetX, 0, offsetZ));
            matrix.multiply(new THREE.Matrix4().makeRotationY(outwardAngle)); 

            if (segments === 1) {
                matrix.multiply(new THREE.Matrix4().makeRotationX(bendAmount));
            }

            clumpGeo.applyMatrix4(matrix);
            leafGeometries.push(clumpGeo);
        }
    } else if (params.treeType === 'bush' || params.treeType === 'grass') {
        for (let i = 0; i < params.stemCount; i++) {
            const stemMatrix = new THREE.Matrix4();
            
            const offsetX = (rand() - 0.5) * params.groundSpread * 2;
            const offsetZ = (rand() - 0.5) * params.groundSpread * 2;
            stemMatrix.multiply(new THREE.Matrix4().makeTranslation(offsetX, 0, offsetZ));

            if (params.treeType === 'grass') {
                const dist = Math.sqrt(offsetX * offsetX + offsetZ * offsetZ);
                const outwardAngle = Math.atan2(offsetX, offsetZ);
                const bend = params.bendFactor * 0.4 * (dist / (params.groundSpread || 1)) + (rand() * 0.2);
                
                stemMatrix.multiply(new THREE.Matrix4().makeRotationY(outwardAngle));
                stemMatrix.multiply(new THREE.Matrix4().makeRotationX(bend));
            } else {
                const angleY = (Math.PI * 2 / params.stemCount) * i + (rand() * 0.5);
                const angleX = 0.1 + (rand() * params.spread * 0.5);
                stemMatrix.multiply(new THREE.Matrix4().makeRotationY(angleY));
                stemMatrix.multiply(new THREE.Matrix4().makeRotationX(angleX));
            }
            
            const stemHeight = params.height * (0.6 + rand() * 0.6);
            const stemRadius = params.radius * (0.7 + rand() * 0.5);
            
            buildPath(stemMatrix, stemHeight, stemRadius, params.levels, true, 0);
        }
    } else {
        const identityMatrix = new THREE.Matrix4();
        buildPath(identityMatrix, params.height, params.radius, params.levels, true, 0);
    }

    if (woodGeometries.length > 0) {
        const mergedWood = safeMergeGeometries(woodGeometries);
        if (mergedWood) {
            const woodMesh = new THREE.Mesh(mergedWood, trunkMat);
            woodMesh.name = `Mesh_Trunk_${capitalize(params.treeType)}`; 
            woodMesh.castShadow = true;
            woodMesh.receiveShadow = true;
            treeGroup.add(woodMesh);
        }
    }

    if (leafGeometries.length > 0) {
        const mergedLeaves = safeMergeGeometries(leafGeometries);
        if (mergedLeaves) {
            const leafMesh = new THREE.Mesh(mergedLeaves, leafMat);
            leafMesh.name = `Mesh_Leaves_${capitalize(params.treeType)}`; 
            leafMesh.castShadow = true;
            leafMesh.receiveShadow = true;
            treeGroup.add(leafMesh);
        }
    }

  }, [params, appMode, materialColors]);


  // --- Texture Studio: Generate 2D preview & update tree textures ---
  useEffect(() => {
    if (!materialsRef.current.textures) return;

    const res = textureResolution;
    const tp = texEditParams;

    const generateTexCanvas = (type) => {
      const canvas = document.createElement('canvas');
      canvas.width = res;
      canvas.height = res;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffffff';

      const drawFns = {
        broadleaf: () => {
          const leafRand = mulberry32(Math.floor(tp.textureSeed));
          const drawLeaf = (cx, cy, scale, rot) => {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale * tp.leafScale, scale * tp.leafScale);
            const hw = 20 * tp.leafWidth;
            const lh = 60 * tp.leafPointiness;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(hw, -lh * 0.5, 0, -lh); ctx.quadraticCurveTo(-hw, -lh * 0.5, 0, 0); ctx.fill();
            ctx.restore();
          };
          const s = res / 256;
          const count = Math.max(1, Math.round(tp.leafCount));
          const vSpread = tp.leafVerticalSpread;
          const hSpread = tp.leafHorizontalSpread;
          const randomize = tp.leafRandomize;
          const rotRange = tp.leafRotationRange;
          const margin = res * 0.08;
          const usableH = (res - margin * 2) * vSpread;
          const startY = res - margin;
          for (let i = 0; i < count; i++) {
            const t = count > 1 ? i / (count - 1) : 0.5;
            // Grid position with randomization
            const gridY = startY - t * usableH;
            const gridX = res / 2;
            const rndX = (leafRand() - 0.5) * res * 0.6 * hSpread;
            const rndY = (leafRand() - 0.5) * usableH * 0.15 * randomize;
            const cx = gridX + rndX;
            const cy = gridY + rndY;
            // Rotation: fan from spread + random jitter
            const fanAngle = (t - 0.5) * 1.4 * tp.leafSpread;
            const rndRot = (leafRand() - 0.5) * Math.PI * 0.5 * randomize * rotRange;
            const rot = fanAngle + rndRot;
            // Size variation
            const sizeVar = 0.8 + leafRand() * 0.5;
            drawLeaf(cx, cy, 2.3 * s * sizeVar, rot);
          }
        },
        pine: () => {
          const s = res / 256;
          const stemW = 4 * s * tp.stemThickness;
          ctx.fillRect(res / 2 - stemW, 0, stemW * 2, res);
          const spacing = Math.max(2, tp.needleSpacing) * s;
          for (let y = 10 * s; y < res - 6 * s; y += spacing) {
            let w = Math.sin((y / res) * Math.PI) * 90 * s * tp.needleWidth + 15 * s;
            const dropY = 25 * s * tp.needleDropAngle;
            ctx.beginPath(); ctx.moveTo(res / 2, y - 2 * s);
            ctx.lineTo(res / 2 - w, y + dropY); ctx.lineTo(res / 2, y + 5 * s); ctx.fill();
            ctx.beginPath(); ctx.moveTo(res / 2, y - 2 * s);
            ctx.lineTo(res / 2 + w, y + dropY); ctx.lineTo(res / 2, y + 5 * s); ctx.fill();
          }
        },
        bush: () => {
          const bushRand = mulberry32(Math.floor(tp.textureSeed));
          const drawLeaf = (cx, cy, scale, rot) => {
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(scale * tp.leafScale, scale * tp.leafScale);
            const hw = 15 * tp.leafWidth;
            const lh = 50 * tp.leafPointiness;
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(hw, -lh * 0.5, 0, -lh); ctx.quadraticCurveTo(-hw, -lh * 0.5, 0, 0); ctx.fill();
            ctx.restore();
          };
          const s = res / 256;
          const count = Math.max(1, Math.round(tp.leafCount));
          const hSpread = tp.leafHorizontalSpread;
          const vSpread = tp.leafVerticalSpread;
          const rotRange = tp.leafRotationRange;
          for (let i = 0; i < count; i++) {
            const cx = res / 2 + (bushRand() - 0.5) * res * 0.8 * hSpread;
            const cy = res / 2 + (bushRand() - 0.5) * res * 0.8 * vSpread;
            const rot = (bushRand() - 0.5) * Math.PI * 2 * rotRange;
            const sizeVar = 0.8 + bushRand() * 0.6;
            drawLeaf(cx, cy, sizeVar * s, rot);
          }
        },
        palm: () => {
          const s = res / 256;
          const stemW = 4 * s * tp.stemThickness;
          ctx.fillRect(res / 2 - stemW, 0, stemW * 2, res);
          const fCount = Math.max(4, Math.round(tp.frondCount));
          const stepY = (res * 0.94) / fCount;
          for (let y = res * 0.977; y > res * 0.039; y -= stepY) {
            let w = Math.sin(Math.pow(y / res, 0.7) * Math.PI) * 110 * s * tp.frondWidth;
            ctx.beginPath(); ctx.moveTo(res / 2, y);
            ctx.lineTo(res / 2 - w, y - stepY * 2.0); ctx.lineTo(res / 2, y - stepY * tp.frondThickness); ctx.fill();
            ctx.beginPath(); ctx.moveTo(res / 2, y);
            ctx.lineTo(res / 2 + w, y - stepY * 2.0); ctx.lineTo(res / 2, y - stepY * tp.frondThickness); ctx.fill();
          }
        },
        quadGrass: () => {
          const s = res / 256;
          const count = Math.max(1, Math.round(tp.bladeCount));
          const seeded = mulberry32(Math.floor(tp.textureSeed));
          for (let i = 0; i < count; i++) {
            let startX = 30 * s + seeded() * 196 * s;
            let curveAmount = (seeded() - 0.5) * 80 * s * tp.bladeCurve;
            let endX = startX + curveAmount;
            let height = 80 * s + seeded() * 160 * s;
            const bw = 8 * s * tp.bladeWidth;
            ctx.beginPath();
            ctx.moveTo(startX - bw, res);
            ctx.quadraticCurveTo(startX, res - height * 0.5, endX, res - height);
            ctx.quadraticCurveTo(startX + bw, res - height * 0.5, startX + bw, res);
            ctx.fill();
          }
        }
      };

      if (drawFns[type]) drawFns[type]();
      if (tp.flipVertical) {
        const flipped = document.createElement('canvas');
        flipped.width = res; flipped.height = res;
        const fCtx = flipped.getContext('2d');
        fCtx.translate(0, res);
        fCtx.scale(1, -1);
        fCtx.drawImage(canvas, 0, 0);
        return flipped;
      }
      return canvas;
    };

    // Regenerate all textures with current edit params
    const types = ['broadleaf', 'pine', 'bush', 'palm', 'quadGrass'];
    for (const type of types) {
      const canvas = generateTexCanvas(type);
      if (materialsRef.current.textures[type]) {
        materialsRef.current.textures[type].dispose();
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      materialsRef.current.textures[type] = tex;
    }

    // Generate 2D preview for the currently selected texture type in the studio
    const previewType = textureType === 'grass' ? 'quadGrass' : textureType;
    const previewCanvas = generateTexCanvas(previewType);
    setTexturePreviewUrl(previewCanvas.toDataURL('image/png'));

    // Trigger tree re-render by forcing params update
    setParams(prev => ({ ...prev }));

  }, [texEditParams, textureResolution, textureType]);

  // --- Texture Download ---
  const downloadTexture = () => {
    if (!texturePreviewUrl) return;
    const link = document.createElement('a');
    link.download = `BotanicGen_Texture_${capitalize(textureType)}_${textureResolution}.png`;
    link.href = texturePreviewUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full h-screen relative bg-gray-900 overflow-hidden font-sans text-white">
      <div ref={mountRef} className="absolute inset-0 cursor-move" />

      {!scriptsLoaded && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-gray-900 text-white">
          <RefreshCw className="w-10 h-10 animate-spin mb-4 text-emerald-400" />
          <h2 className="text-xl font-medium">Loading 3D Engine...</h2>
        </div>
      )}

      {/* MOUNTAIN GEN LINK */}
      <a
        href="https://zicore.github.io/mountain-gen/"
        target="_blank"
        rel="noopener noreferrer"
        className="absolute top-4 left-4 z-20 flex items-center gap-2.5 bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-xl px-3.5 py-2.5 shadow-lg hover:bg-slate-800/90 hover:border-sky-500/30 transition-all group"
      >
        <svg width="22" height="22" viewBox="0 0 32 32" className="shrink-0">
          <circle cx="16" cy="16" r="14" fill="none" stroke="#38bdf8" strokeWidth="1.5" opacity="0.3"/>
          <path d="M6 26 L16 8 L26 26 Z" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7"/>
          <path d="M11 26 L18 16 L25 26" fill="none" stroke="#7dd3fc" strokeWidth="1.2" strokeLinejoin="round" opacity="0.4"/>
          <path d="M14 12 L16 8 L18 12" fill="#38bdf8" opacity="0.5"/>
        </svg>
        <div className="flex flex-col">
          <span className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors">Mountain Gen</span>
          <span className="text-[10px] text-slate-500">Terrain Generator</span>
        </div>
      </a>

      {scriptsLoaded && (
        <div className="absolute top-6 right-6 w-80 max-h-[calc(100vh-5.5rem)] overflow-y-auto bg-gray-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl custom-scrollbar flex flex-col">
          
          <div className="sticky top-0 z-10 bg-gray-900 rounded-t-2xl">
            <div className="p-5 pb-3 border-b border-white/10 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Layers size={22} />
              </div>
              <div>
                <h1 className="text-lg font-bold tracking-wide">Botanic Generator</h1>
                <p className="text-xs text-gray-400">3D Foliage Asset Studio</p>
              </div>
            </div>

            {/* --- Mode Toggle --- */}
            <div className="px-5 py-3">
              <div className="bg-black/30 p-1.5 rounded-xl flex items-center relative">
                <div
                  className={`absolute inset-y-1.5 w-[calc(50%-0.375rem)] bg-emerald-500/20 rounded-lg shadow-sm transition-all duration-300 ease-out ${appMode === 'generator' ? 'left-1.5' : 'left-[calc(50%+0.125rem)]'}`}
                />
                <button
                  onClick={() => setAppMode('generator')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium z-10 transition-colors ${appMode === 'generator' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Layers size={16} className={appMode === 'generator' ? "text-emerald-400" : ""} />
                  3D Generator
                </button>
                <button
                  onClick={() => setAppMode('textures')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium z-10 transition-colors ${appMode === 'textures' ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                >
                  <Palette size={16} className={appMode === 'textures' ? "text-purple-400" : ""} />
                  Texture Studio
                </button>
              </div>
            </div>
          </div>

        <div className="p-5 flex flex-col gap-6">

          {/* === GENERATOR MODE === */}
          {appMode === 'generator' && (
            <>
              <div className="flex gap-2">
                <div className="flex-1 bg-black/30 rounded-xl px-3 py-2 flex items-center border border-white/10">
                  <span className="text-xs text-gray-400 mr-2">Seed:</span>
                  <input
                    type="number"
                    value={params.seed}
                    onChange={(e) => handleParamChange('seed', parseInt(e.target.value) || 0)}
                    className="bg-transparent w-full text-white font-mono text-sm focus:outline-none"
                  />
                </div>
                <button
                  onClick={randomizeSeed}
                  className="flex-none flex items-center justify-center p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors rounded-xl text-emerald-400"
                  title="New Seed"
                >
                  <RefreshCw size={18} />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                <button onClick={() => applyPreset('broadleaf')} className={`flex-1 min-w-[30%] py-2 border rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${params.treeType === 'broadleaf' ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}>
                  <span className="text-lg">🌳</span>
                  Broadleaf
                </button>
                <button onClick={() => applyPreset('pine')} className={`flex-1 min-w-[30%] py-2 border rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${params.treeType === 'pine' ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}>
                  <span className="text-lg">🌲</span>
                  Pine
                </button>
                <button onClick={() => applyPreset('palm')} className={`flex-1 min-w-[30%] py-2 border rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${params.treeType === 'palm' ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}>
                  <span className="text-lg">🌴</span>
                  Palm
                </button>
                <button onClick={() => applyPreset('bush')} className={`flex-1 min-w-[45%] py-2 border rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${params.treeType === 'bush' ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}>
                  <span className="text-lg">🌿</span>
                  Bush
                </button>
                <button onClick={() => applyPreset('grass')} className={`flex-1 min-w-[45%] py-2 border rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${params.treeType === 'grass' ? 'bg-emerald-500/20 border-emerald-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}>
                  <span className="text-lg">🌾</span>
                  Grass
                </button>
              </div>

              <button
                onClick={exportToGLTF}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-500 hover:bg-emerald-400 text-gray-900 font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]"
              >
                <Download size={18} />
                Export as 3D Model (.glb)
              </button>

              <div className="bg-black/30 p-1.5 rounded-xl flex items-center relative">
                  <div
                    className={`absolute inset-y-1.5 w-[calc(50%-0.375rem)] bg-white/10 rounded-lg shadow-sm transition-all duration-300 ease-out ${params.isStylized ? 'left-1.5' : 'left-[calc(50%+0.125rem)]'}`}
                  />
                  <button
                    onClick={() => setParams(prev => ({ ...prev, isStylized: true }))}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium z-10 transition-colors ${params.isStylized ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Zap size={16} className={params.isStylized ? "text-yellow-400" : ""} />
                    Stylized
                  </button>
                  <button
                    onClick={() => setParams(prev => ({ ...prev, isStylized: false }))}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium z-10 transition-colors ${!params.isStylized ? 'text-white' : 'text-gray-400 hover:text-white'}`}
                  >
                    <Box size={16} className={!params.isStylized ? "text-blue-400" : ""} />
                    PBR Realistic
                  </button>
              </div>

              <div className="h-px bg-white/10 w-full" />

              <div className="space-y-5">

                {params.treeType === 'grass' && (
                    <div className="bg-black/30 p-1.5 rounded-xl flex items-center relative mb-5">
                        <div className={`absolute inset-y-1.5 w-[calc(50%-0.375rem)] bg-emerald-500/20 rounded-lg shadow-sm transition-all duration-300 ease-out ${params.grassStyle === 'quad' ? 'left-1.5' : 'left-[calc(50%+0.125rem)]'}`} />
                        <button onClick={() => setParams(prev => ({ ...prev, grassStyle: 'quad' }))} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium z-10 transition-colors ${params.grassStyle === 'quad' ? 'text-emerald-400' : 'text-gray-400 hover:text-white'}`}>
                           2D Quads
                        </button>
                        <button onClick={() => setParams(prev => ({ ...prev, grassStyle: '3d' }))} className={`flex-1 flex items-center justify-center gap-2 py-1.5 text-sm font-medium z-10 transition-colors ${params.grassStyle === '3d' ? 'text-emerald-400' : 'text-gray-400 hover:text-white'}`}>
                           3D Meshes
                        </button>
                    </div>
                )}

                <SliderControl
                  label={params.treeType === 'bush' || params.treeType === 'grass' ? "Height" : "Trunk Height"}
                  value={params.height} min={2} max={30} step={0.5}
                  onChange={(v) => handleParamChange('height', v)}
                />

                {!(params.treeType === 'grass' && params.grassStyle === 'quad') && (
                  <>
                    <SliderControl
                      label={params.treeType === 'bush' || params.treeType === 'grass' ? "Stem Radius (Base)" : "Trunk Radius (Base)"}
                      value={params.radius} min={0.05} max={4} step={0.05}
                      onChange={(v) => handleParamChange('radius', v)}
                    />
                    <SliderControl
                      label="Trunk Mesh Resolution"
                      value={params.meshResolution} min={3} max={24} step={1}
                      onChange={(v) => handleParamChange('meshResolution', v)}
                    />
                    <SliderControl
                      label="Leaf Mesh Resolution"
                      value={params.leafMeshResolution} min={3} max={24} step={1}
                      onChange={(v) => handleParamChange('leafMeshResolution', v)}
                    />
                  </>
                )}

                {params.treeType === 'grass' && params.grassStyle === 'quad' && (
                  <SliderControl
                    label="Quad Height Segments"
                    value={params.quadSegments} min={1} max={8} step={1}
                    onChange={(v) => handleParamChange('quadSegments', v)}
                  />
                )}

                {(params.treeType === 'bush' || params.treeType === 'grass') && (
                  <>
                    <SliderControl
                      label={params.treeType === 'grass' && params.grassStyle === 'quad' ? "Quad Clump Count" : "Stem Count"}
                      value={params.stemCount} min={1} max={200} step={1}
                      onChange={(v) => handleParamChange('stemCount', v)}
                    />
                    <SliderControl
                      label="Ground Spread"
                      value={params.groundSpread} min={0.0} max={10.0} step={0.1}
                      onChange={(v) => handleParamChange('groundSpread', v)}
                    />
                  </>
                )}

                <SliderControl
                  label={params.treeType === 'grass' ? "Outward Bend" : "Stem/Branch Bend"}
                  value={params.bendFactor} min={0.0} max={3.0} step={0.1}
                  onChange={(v) => handleParamChange('bendFactor', v)}
                />

                {params.treeType !== 'grass' && (
                    <SliderControl
                      label="Trunk Clearance (%)"
                      value={params.trunkClearance} min={0.0} max={0.9} step={0.05}
                      onChange={(v) => handleParamChange('trunkClearance', v)}
                    />
                )}

                {(params.treeType !== 'palm' && params.treeType !== 'grass') && (
                  <SliderControl
                    label="Branching Levels"
                    value={params.levels} min={1} max={5} step={1}
                    onChange={(v) => handleParamChange('levels', v)}
                  />
                )}

                {params.treeType === 'pine' && (
                  <SliderControl
                    label="Whorl Count (Layers)"
                    value={params.whorlCount} min={3} max={20} step={1}
                    onChange={(v) => handleParamChange('whorlCount', v)}
                  />
                )}

                {params.treeType === 'palm' && (
                  <>
                    <SliderControl
                      label="Trunk Rings (Sections)"
                      value={params.palmTrunkSections} min={4} max={40} step={1}
                      onChange={(v) => handleParamChange('palmTrunkSections', v)}
                    />
                    <SliderControl
                      label="Trunk Noise"
                      value={params.palmNoise} min={0.0} max={2.0} step={0.05}
                      onChange={(v) => handleParamChange('palmNoise', v)}
                    />
                    <SliderControl
                      label="Frond Width (3D)"
                      value={params.palmLeafWidth} min={0.3} max={3.0} step={0.1}
                      onChange={(v) => handleParamChange('palmLeafWidth', v)}
                    />
                    <SliderControl
                      label="Leaf Droop (Gravity)"
                      value={params.leafDroop} min={0.0} max={2.5} step={0.1}
                      onChange={(v) => handleParamChange('leafDroop', v)}
                    />
                  </>
                )}

                {(params.treeType !== 'palm' && params.treeType !== 'grass') && (
                  <SliderControl
                    label="Branch Spread"
                    value={params.spread} min={0.1} max={2.0} step={0.05}
                    onChange={(v) => handleParamChange('spread', v)}
                  />
                )}

                {params.treeType !== 'grass' && (
                  <>
                    <SliderControl
                      label="Leaf Density"
                      value={params.leafDensity} min={0} max={20} step={1}
                      onChange={(v) => handleParamChange('leafDensity', v)}
                    />

                    <SliderControl
                      label="Leaf Size"
                      value={params.leafSize} min={2.0} max={8.0} step={0.1}
                      onChange={(v) => handleParamChange('leafSize', v)}
                    />
                  </>
                )}

              </div>
            </>
          )}

          {/* === TEXTURE STUDIO MODE === */}
          {appMode === 'textures' && (
            <>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'broadleaf', label: 'Broadleaf', icon: '🌳' },
                  { key: 'pine', label: 'Pine', icon: '🌲' },
                  { key: 'palm', label: 'Palm', icon: '🌴' },
                  { key: 'bush', label: 'Bush', icon: '🌿' },
                  { key: 'grass', label: 'Grass', icon: '🌾' },
                ].map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => { setTextureType(key); applyPreset(key); }}
                    className={`flex-1 min-w-[30%] py-2 border rounded-xl text-xs font-medium transition-colors flex flex-col items-center gap-1 ${textureType === key ? 'bg-purple-500/20 border-purple-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}
                  >
                    <span className="text-lg">{icon}</span>
                    {label}
                  </button>
                ))}
              </div>

              {texturePreviewUrl && (
                <div className="flex flex-col gap-2 sticky top-[7rem] z-[5] bg-gray-900 pb-2 -mx-5 px-5 pt-1">
                  <label className="text-sm text-gray-300 font-medium flex items-center gap-2">
                    <Eye size={14} />
                    Texture Preview
                  </label>
                  <div className="rounded-xl p-3 border border-white/10 flex items-center justify-center" style={{ background: '#1a1a1a' }}>
                    <div className="relative w-full" style={{ paddingBottom: '100%' }}>
                      <div className="absolute inset-0 bg-black rounded" />
                      <img
                        src={texturePreviewUrl}
                        alt="Texture Preview"
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-5">
                <ColorPickerControl
                  label="Leaf Color"
                  color={currentLeafColor}
                  onChange={setLeafColor}
                />
                <ColorPickerControl
                  label="Trunk Color"
                  color={currentTrunkColor}
                  onChange={setTrunkColor}
                />

                <div className="flex flex-col gap-2">
                  <label className="text-sm text-gray-300 font-medium">
                    Resolution
                  </label>
                  <div className="flex gap-2">
                    {[256, 512, 1024].map((res) => (
                      <button
                        key={res}
                        onClick={() => setTextureResolution(res)}
                        className={`flex-1 py-2 border rounded-xl text-xs font-medium transition-colors ${textureResolution === res ? 'bg-purple-500/20 border-purple-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10'}`}
                      >
                        {res}x{res}
                      </button>
                    ))}
                  </div>
                </div>

                <SliderControl
                  label="Texture Seed"
                  value={texEditParams.textureSeed} min={1} max={999} step={1}
                  onChange={(v) => handleTexEditChange('textureSeed', v)}
                />

                <button
                  onClick={() => setTexEditParams(prev => ({ ...prev, flipVertical: !prev.flipVertical }))}
                  className={`w-full py-2 border rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 ${texEditParams.flipVertical ? 'bg-purple-500/20 border-purple-500/50 text-white' : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-400'}`}
                >
                  <span style={{ display: 'inline-block', transform: 'scaleY(-1)' }}>↕</span>
                  Flip Vertical {texEditParams.flipVertical ? 'ON' : 'OFF'}
                </button>

                <div className="h-px bg-white/10 w-full" />

                {/* --- Broadleaf & Bush shape controls --- */}
                {(textureType === 'broadleaf' || textureType === 'bush') && (
                  <>
                    <SliderControl
                      label="Leaf Count"
                      value={texEditParams.leafCount} min={1} max={24} step={1}
                      onChange={(v) => handleTexEditChange('leafCount', v)}
                    />
                    <SliderControl
                      label="Leaf Scale"
                      value={texEditParams.leafScale} min={0.3} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('leafScale', v)}
                    />
                    <SliderControl
                      label="Leaf Width"
                      value={texEditParams.leafWidth} min={0.2} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('leafWidth', v)}
                    />
                    <SliderControl
                      label="Leaf Pointiness"
                      value={texEditParams.leafPointiness} min={0.3} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('leafPointiness', v)}
                    />
                    <SliderControl
                      label="Horizontal Spread"
                      value={texEditParams.leafHorizontalSpread} min={0.0} max={1.5} step={0.05}
                      onChange={(v) => handleTexEditChange('leafHorizontalSpread', v)}
                    />
                    <SliderControl
                      label="Vertical Spread"
                      value={texEditParams.leafVerticalSpread} min={0.2} max={1.5} step={0.05}
                      onChange={(v) => handleTexEditChange('leafVerticalSpread', v)}
                    />
                    <SliderControl
                      label="Fan Spread"
                      value={texEditParams.leafSpread} min={0.0} max={2.0} step={0.1}
                      onChange={(v) => handleTexEditChange('leafSpread', v)}
                    />
                    <SliderControl
                      label="Rotation Range"
                      value={texEditParams.leafRotationRange} min={0.0} max={2.0} step={0.1}
                      onChange={(v) => handleTexEditChange('leafRotationRange', v)}
                    />
                    <SliderControl
                      label="Randomize"
                      value={texEditParams.leafRandomize} min={0.0} max={1.0} step={0.05}
                      onChange={(v) => handleTexEditChange('leafRandomize', v)}
                    />
                  </>
                )}

                {/* --- Pine needle controls --- */}
                {textureType === 'pine' && (
                  <>
                    <SliderControl
                      label="Needle Spacing"
                      value={texEditParams.needleSpacing} min={2} max={20} step={1}
                      onChange={(v) => handleTexEditChange('needleSpacing', v)}
                    />
                    <SliderControl
                      label="Needle Width"
                      value={texEditParams.needleWidth} min={0.2} max={2.5} step={0.1}
                      onChange={(v) => handleTexEditChange('needleWidth', v)}
                    />
                    <SliderControl
                      label="Needle Drop Angle"
                      value={texEditParams.needleDropAngle} min={0.1} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('needleDropAngle', v)}
                    />
                    <SliderControl
                      label="Stem Thickness"
                      value={texEditParams.stemThickness} min={0.2} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('stemThickness', v)}
                    />
                  </>
                )}

                {/* --- Palm frond controls --- */}
                {textureType === 'palm' && (
                  <>
                    <SliderControl
                      label="Frond Count"
                      value={texEditParams.frondCount} min={4} max={80} step={1}
                      onChange={(v) => handleTexEditChange('frondCount', v)}
                    />
                    <SliderControl
                      label="Frond Width"
                      value={texEditParams.frondWidth} min={0.2} max={2.5} step={0.1}
                      onChange={(v) => handleTexEditChange('frondWidth', v)}
                    />
                    <SliderControl
                      label="Frond Thickness"
                      value={texEditParams.frondThickness} min={0.1} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('frondThickness', v)}
                    />
                    <SliderControl
                      label="Stem Thickness"
                      value={texEditParams.stemThickness} min={0.2} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('stemThickness', v)}
                    />
                  </>
                )}

                {/* --- Grass blade controls --- */}
                {textureType === 'grass' && (
                  <>
                    <SliderControl
                      label="Blade Count"
                      value={texEditParams.bladeCount} min={1} max={30} step={1}
                      onChange={(v) => handleTexEditChange('bladeCount', v)}
                    />
                    <SliderControl
                      label="Blade Width"
                      value={texEditParams.bladeWidth} min={0.2} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('bladeWidth', v)}
                    />
                    <SliderControl
                      label="Blade Curve"
                      value={texEditParams.bladeCurve} min={0.0} max={3.0} step={0.1}
                      onChange={(v) => handleTexEditChange('bladeCurve', v)}
                    />
                  </>
                )}
              </div>

              <button
                onClick={downloadTexture}
                className="w-full flex items-center justify-center gap-2 py-3 bg-purple-500 hover:bg-purple-400 text-white font-bold rounded-xl transition-all shadow-[0_0_15px_rgba(168,85,247,0.3)] hover:shadow-[0_0_25px_rgba(168,85,247,0.5)]"
              >
                <Download size={18} />
                Download Texture (.png)
              </button>
            </>
          )}

          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.1); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 8px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.3); }
        input[type=range] { -webkit-appearance: none; background: transparent; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; height: 16px; width: 16px; border-radius: 50%;
          background: #34d399; cursor: pointer; margin-top: -5px;
          box-shadow: 0 0 10px rgba(52, 211, 153, 0.5);
        }
        input[type=range]::-webkit-slider-runnable-track {
          width: 100%; height: 6px; cursor: pointer; background: rgba(255, 255, 255, 0.25); border-radius: 3px;
        }
        input[type=range]::-moz-range-track {
          width: 100%; height: 6px; cursor: pointer; background: rgba(255, 255, 255, 0.25); border-radius: 3px;
        }
        input[type=range]:focus { outline: none; }
      `}} />
      <Footer />
    </div>
  );
}

function SliderControl({ label, value, min, max, step, onChange }) {
  return (
    <div className="flex flex-col gap-2 group">
      <div className="flex justify-between items-center">
        <label className="text-sm text-gray-300 font-medium group-hover:text-white transition-colors">
          {label}
        </label>
        <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
          {value.toFixed(step < 1 ? 2 : 0)}
        </span>
      </div>
      <input 
        type="range" min={min} max={max} step={step} value={value} 
        onChange={(e) => onChange(e.target.value)} className="w-full"
      />
    </div>
  );
}

function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900/90 backdrop-blur border-t border-white/5">
      <div className="max-w-screen-xl mx-auto px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <span>Botanic Generator v1.0</span>
        <div className="flex items-center gap-3">
          <a href="https://github.com/Zicore/botanic-gen" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">GitHub</a>
          <span className="text-white/10">|</span>
          <a href="https://github.com/Zicore" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">@Zicore</a>
          <span className="text-white/10">|</span>
          <a href="https://zicore.github.io/portfolio/" target="_blank" rel="noopener noreferrer" className="hover:text-gray-300 transition-colors">Portfolio</a>
        </div>
      </div>
    </footer>
  );
}
