// Imperative three.js viewport: physical sky + IBL, shadowed sun, ground, tree meshes,
// debug view modes, skeleton overlay and wind animation.

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { createBarkMaterial, createLeafMaterial, barkDepthMaterial, windUniforms } from './materials.js';
import { lodRanges, LOD_COUNT } from '../export/lod.js';

const DEG = Math.PI / 180;

const DEBUG_VERT = /* glsl */ `
attribute vec4 color;
attribute vec2 wind;
varying vec4 vColor;
varying vec2 vWind;
varying vec2 vUv;
void main() {
  vColor = color; vWind = wind; vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DEBUG_FRAG = /* glsl */ `
uniform int uMode;
uniform sampler2D uMap;
uniform float uAlphaTest;
uniform bool uHasMap;
varying vec4 vColor;
varying vec2 vWind;
varying vec2 vUv;
void main() {
  vec4 tex = uHasMap ? texture2D(uMap, vUv) : vec4(1.0);
  if (tex.a < uAlphaTest) discard;
  vec3 c;
  if (uMode == 0) c = tex.rgb * vColor.rgb;
  else if (uMode == 1) c = vColor.rgb;
  else c = vec3(vWind.x, vWind.y, 0.15);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`;

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
    this.camera.position.set(-14, 9, 24);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.target.set(0, 6, 0);

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.sky = new Sky();
    this.sky.scale.setScalar(1500);
    const su = this.sky.material.uniforms;
    su.turbidity.value = 4;
    su.rayleigh.value = 1.4;
    su.mieCoefficient.value = 0.004;
    su.mieDirectionalG.value = 0.82;
    this.scene.add(this.sky);
    // IBL sky: same atmosphere without the sun disc (the sun is already a directional light)
    this.envSky = new Sky();
    this.envSky.scale.setScalar(1500);
    this.envSky.material.fragmentShader = this.envSky.material.fragmentShader.replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;', '');
    for (const k of ['turbidity', 'rayleigh', 'mieDirectionalG']) this.envSky.material.uniforms[k].value = su[k].value;
    this.envSky.material.uniforms.mieCoefficient.value = 0.0015;
    this.skyScene = new THREE.Scene();
    this.skyScene.add(this.envSky);

    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xdfe8f0, 0x5a5a38, 0.2);
    this.scene.add(this.hemi);

    this.ground = this.makeGround();
    this.scene.add(this.ground);
    this.blob = this.makeBlobShadow();
    this.scene.add(this.blob);

    this.treeGroup = new THREE.Group();
    this.scene.add(this.treeGroup);
    // one group per LOD level; LOD1/2 are only filled while the LOD preview is in use
    this.lodGroups = Array.from({ length: LOD_COUNT }, () => new THREE.Group());
    this.treeGroup.add(...this.lodGroups);
    this.lodResults = [];
    this.activeLod = 0;
    this.lodDistance = null;
    this.onLod = null;
    this.skeleton = null;

    this.materials = new Map(); // key -> material
    this.textures = new Map(); // materialId -> { maps, version, params }
    this.view = { mode: 'lit', wind: 0.35, windDir: 20, skeleton: false, ground: true };
    this.debugMaterials = new Map();
    this.framed = false;
    this.timer = new THREE.Timer();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setSun(35, 42);
    this.renderer.setAnimationLoop(() => this.tick());
  }

  makeGround() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < size * size; i++) {
      const n = rnd();
      const g = 0.75 + n * 0.35;
      img.data[i * 4] = 86 * g;
      img.data[i * 4 + 1] = 92 * g;
      img.data[i * 4 + 2] = 50 * g;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.08;
    for (let i = 0; i < 2500; i++) {
      ctx.fillStyle = rnd() > 0.5 ? '#2c3a1c' : '#7d8a52';
      ctx.beginPath();
      ctx.arc(rnd() * size, rnd() * size, 2 + rnd() * 10, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(60, 60);
    tex.anisotropy = 8;
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(400, 96), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    return mesh;
  }

  makeBlobShadow() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.01;
    mesh.renderOrder = 1;
    return mesh;
  }

  setSun(azimuthDeg, elevationDeg) {
    const phi = (90 - elevationDeg) * DEG;
    const theta = azimuthDeg * DEG;
    const dir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
    this.sunDir = dir;
    this.sky.material.uniforms.sunPosition.value.copy(dir);
    this.updateSunPosition();
    // rebuild IBL from the disc-less sky
    this.envSky.material.uniforms.sunPosition.value.copy(dir);
    const rt = this.pmrem.fromScene(this.skyScene, 0, 0.1, 2000);
    if (this.envRT) this.envRT.dispose();
    this.envRT = rt;
    this.scene.environment = rt.texture;
    // the physical sky is HDR and very bright: keep its irradiance in proportion to the sun
    this.scene.environmentIntensity = 0.16;
    const warm = THREE.MathUtils.clamp(elevationDeg / 40, 0, 1);
    this.sun.color.setRGB(1, 0.78 + 0.18 * warm, 0.6 + 0.3 * warm);
    this.sun.intensity = 1.0 + 1.8 * THREE.MathUtils.clamp(elevationDeg / 25, 0, 1);
  }

  updateSunPosition() {
    const b = this.bounds;
    const center = b ? new THREE.Vector3().fromArray(b.center) : new THREE.Vector3(0, 5, 0);
    const radius = b ? b.radius : 12;
    this.sun.position.copy(center).addScaledVector(this.sunDir, radius * 3);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    const r = radius * 1.15;
    cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r;
    cam.near = radius * 0.5;
    cam.far = radius * 6;
    cam.updateProjectionMatrix();
  }

  resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setView(view) {
    const prev = this.view;
    this.view = { ...this.view, ...view };
    windUniforms.uWindStrength.value = this.view.wind;
    const a = this.view.windDir * DEG;
    windUniforms.uWindDir.value.set(Math.cos(a), Math.sin(a));
    if (prev.sunAzimuth !== this.view.sunAzimuth || prev.sunElevation !== this.view.sunElevation) {
      if (this.view.sunAzimuth != null) this.setSun(this.view.sunAzimuth, this.view.sunElevation);
    }
    this.ground.visible = this.view.ground;
    this.blob.visible = this.view.ground;
    this.controls.autoRotate = !!this.view.autoRotate;
    this.controls.autoRotateSpeed = 0.6;
    if (this.skeleton) this.skeleton.visible = this.view.skeleton;
    if (prev.mode !== this.view.mode) this.applyMode();
  }

  /** textures: Map materialId -> { maps, version, params, kind } */
  setTextures(textures) {
    this.textures = textures;
    for (const [key, mat] of this.materials) {
      const materialId = key.split('|')[1];
      const t = textures.get(materialId);
      if (!t) continue;
      if (mat.userData.version === t.version) continue;
      this.assignMaps(mat, t);
    }
    this.applyMode();
  }

  assignMaps(mat, t) {
    const hadMap = !!mat.map;
    mat.map = t.maps.albedo;
    mat.normalMap = t.maps.normal;
    mat.roughnessMap = t.maps.orm;
    if (t.kind === 'bark') mat.aoMap = t.maps.orm;
    mat.color.set(0xffffff);
    if (t.kind === 'leaf') {
      mat.alphaTest = t.params.alphaCutoff;
      mat.userData.uniforms.uTranslucencyMap.value = t.maps.translucency;
      mat.userData.uniforms.uSubsurface.value.set(t.params.colorSubsurface);
      const depth = mat.userData.depthMaterial;
      depth.map = t.maps.albedo;
      depth.alphaTest = t.params.alphaCutoff;
      depth.needsUpdate = true;
    }
    mat.userData.version = t.version;
    if (!hadMap) mat.needsUpdate = true;
  }

  getMaterial(kind, materialId, noFlip) {
    const key = `${kind}|${materialId}`;
    let mat = this.materials.get(key);
    if (!mat) {
      const t = this.textures.get(materialId);
      mat = kind === 'bark' ? createBarkMaterial(null, 'Bark') : createLeafMaterial(null, t?.params, 'Leaves');
      if (t) this.assignMaps(mat, t);
      this.materials.set(key, mat);
    }
    if (kind === 'leaf') mat.userData.uniforms.uNoFlip.value = noFlip;
    return mat;
  }

  *meshes() {
    for (const g of this.lodGroups) yield* g.children;
  }

  fillGroup(group, result) {
    for (const child of [...group.children]) {
      child.geometry.dispose();
      group.remove(child);
    }
    for (const g of result?.groups || []) {
      const geo = new THREE.BufferGeometry();
      const A = g.attributes;
      geo.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3));
      geo.setAttribute('tangent', new THREE.BufferAttribute(A.tangent, 4));
      geo.setAttribute('uv', new THREE.BufferAttribute(A.uv, 2));
      const windAttr = new THREE.BufferAttribute(A.uv1, 2);
      geo.setAttribute('uv1', windAttr);
      geo.setAttribute('wind', windAttr);
      geo.setAttribute('color', new THREE.BufferAttribute(A.color, 4));
      geo.setIndex(new THREE.BufferAttribute(g.index, 1));
      geo.computeBoundingSphere();
      const mat = this.getMaterial(g.kind, g.materialId, g.kind === 'leaf' ? 0.85 : 0);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.name = g.kind === 'bark' ? 'Bark' : 'Leaves';
      mesh.userData.group = g;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.customDepthMaterial = g.kind === 'leaf' ? mat.userData.depthMaterial : (this.barkDepth ??= barkDepthMaterial());
      group.add(mesh);
    }
  }

  /** Lower LOD result for the preview (level >= 1); null clears it. */
  setLodResult(level, result) {
    this.lodResults[level] = result;
    this.fillGroup(this.lodGroups[level], result);
    this.applyMode();
  }

  clearLods() {
    for (let l = 1; l < LOD_COUNT; l++) this.setLodResult(l, null);
  }

  /** Picks the visible LOD: fixed, or by camera distance with the exported Godot ranges. */
  updateLod() {
    const want = this.view.lod ?? 0;
    let level = want;
    let dist = null;
    if (want === 'auto' && this.bounds) {
      dist = this.camera.position.distanceTo(new THREE.Vector3().fromArray(this.bounds.center));
      const r = lodRanges(Math.max(0.5, this.bounds.max.y));
      level = dist < r[0].end ? 0 : dist < r[1].end ? 1 : 2;
    }
    if (level > 0 && !this.lodResults[level]) level = 0; // still generating
    this.lodGroups.forEach((g, l) => (g.visible = l === level));
    const moved = dist != null && (this.lodDistance == null || Math.abs(dist - this.lodDistance) > 0.5);
    if (level !== this.activeLod || moved || (dist == null) !== (this.lodDistance == null)) {
      this.activeLod = level;
      this.lodDistance = dist;
      this.onLod?.(level, dist);
    }
  }

  setResult(result, { reframe = false } = {}) {
    if (this.skeleton) {
      this.skeleton.geometry.dispose();
      this.scene.remove(this.skeleton);
      this.skeleton = null;
    }
    this.result = result;
    this.fillGroup(this.lodGroups[0], result);
    if (!result) return;

    if (result.skeleton?.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(result.skeleton, 3));
      this.skeleton = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xff5ab4, depthTest: false, transparent: true, opacity: 0.85 }));
      this.skeleton.renderOrder = 10;
      this.skeleton.visible = this.view.skeleton;
      this.scene.add(this.skeleton);
    }

    if (result.bounds) {
      const min = new THREE.Vector3().fromArray(result.bounds.min);
      const max = new THREE.Vector3().fromArray(result.bounds.max);
      const center = new THREE.Vector3().addVectors(min, max).multiplyScalar(0.5);
      const radius = Math.max(0.5, min.distanceTo(max) / 2);
      this.bounds = { center: center.toArray(), radius, min, max };
      windUniforms.uTreeHeight.value = Math.max(0.5, max.y);
      this.updateSunPosition();
      const canopy = result.canopy;
      const blobR = canopy ? Math.max(canopy.radii[0], canopy.radii[2]) * 2.4 : radius;
      this.blob.scale.set(blobR, blobR, 1);
      this.blob.position.x = canopy ? canopy.center[0] : 0;
      this.blob.position.z = canopy ? canopy.center[2] : 0;
      if (reframe || !this.framed) this.frame();
    }
    this.applyMode();
  }

  frame() {
    if (!this.bounds) return;
    const { center, radius } = this.bounds;
    const c = new THREE.Vector3().fromArray(center);
    const dist = radius / Math.sin((this.camera.fov * DEG) / 2) * 1.05;
    const dir = new THREE.Vector3(-0.55, 0.22, 1).normalize();
    this.camera.position.copy(c).addScaledVector(dir, dist);
    this.camera.near = Math.max(0.01, dist / 500);
    this.camera.far = Math.max(2000, dist * 20);
    this.camera.updateProjectionMatrix();
    this.controls.target.copy(c);
    this.controls.minDistance = radius * 0.05;
    this.controls.maxDistance = dist * 6;
    this.controls.update();
    this.framed = true;
  }

  applyMode() {
    const mode = this.view.mode;
    for (const mesh of this.meshes()) {
      const g = mesh.userData.group;
      const lit = this.getMaterial(g.kind, g.materialId, g.kind === 'leaf' ? 0.85 : 0);
      lit.wireframe = mode === 'wireframe';
      if (mode === 'lit' || mode === 'wireframe') {
        mesh.material = lit;
        continue;
      }
      const key = `${mode}|${g.kind}|${g.materialId}`;
      let dm = this.debugMaterials.get(key);
      if (!dm) {
        dm = new THREE.ShaderMaterial({
          vertexShader: DEBUG_VERT,
          fragmentShader: DEBUG_FRAG,
          uniforms: {
            uMode: { value: { albedo: 0, ao: 1, wind: 2 }[mode] ?? 0 },
            uMap: { value: null },
            uHasMap: { value: false },
            uAlphaTest: { value: g.kind === 'leaf' ? 0.45 : 0 },
          },
          side: g.kind === 'leaf' ? THREE.DoubleSide : THREE.FrontSide,
        });
        this.debugMaterials.set(key, dm);
      }
      dm.uniforms.uMap.value = lit.map;
      dm.uniforms.uHasMap.value = !!lit.map;
      dm.uniforms.uAlphaTest.value = g.kind === 'leaf' ? lit.alphaTest : 0;
      mesh.material = dm;
    }
  }

  tick() {
    this.timer.update();
    const dt = Math.min(0.1, this.timer.getDelta());
    windUniforms.uTime.value += dt;
    this.controls.update();
    this.updateLod();
    this.renderer.render(this.scene, this.camera);
  }

  /** Render a square screenshot (for thumbnails / docs). */
  snapshot(size = 1024) {
    const prev = new THREE.Vector2();
    this.renderer.getSize(prev);
    const aspect = this.camera.aspect;
    this.renderer.setSize(size, size, false);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.renderer.setSize(prev.x, prev.y, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    return url;
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
