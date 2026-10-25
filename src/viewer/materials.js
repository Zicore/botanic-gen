// Viewport materials: MeshStandardMaterial + wind (vertex) + center-calculated foliage volume/puff + translucency.
// The wind and foliage math mirrors export/godot shaders so the preview matches the engine.

import * as THREE from 'three';

export const windUniforms = {
  uTime: { value: 0 },
  uWindStrength: { value: 0.5 },
  uWindDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  uTreeHeight: { value: 10 },
};

export const foliageUniforms = {
  uCenterNormals: { value: 1.0 },
  uCardPuff: { value: 1.0 },
};

export const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform float uWindStrength;
uniform vec2 uWindDir;
uniform float uTreeHeight;
attribute vec2 wind;

vec3 botanicaWind(vec3 p, vec3 n, vec2 w) {
  if (uWindStrength <= 0.0) return p;
  vec3 dir = normalize(vec3(uWindDir.x, 0.0, uWindDir.y));
  float t = uTime;
  float h = max(p.y, 0.0) / max(uTreeHeight, 0.01);
  float gust = 0.65 + 0.35 * sin(t * 0.31) * sin(t * 0.17 + 1.3);
  float phase = dot(p, vec3(0.071, 0.043, 0.067)) * 6.2831;
  // trunk: smooth bend proportional to height²
  float sway = (0.75 + 0.25 * sin(t * 0.9 + phase * 0.1)) * gust;
  vec3 off = dir * (h * h) * sway * uWindStrength * uTreeHeight * 0.025;
  // branches: secondary oscillation, scaled by flex weight
  float br = sin(t * 1.9 + phase) * 0.6 + sin(t * 3.1 + phase * 1.7) * 0.4;
  off += (dir * 0.5 + vec3(0.0, 0.35, 0.0) + vec3(dir.z, 0.0, -dir.x) * 0.4) * br * w.x * uWindStrength * uTreeHeight * 0.012 * gust;
  // leaves: fast flutter along the normal
  float fl = sin(t * 9.0 + phase * 4.0) * 0.6 + sin(t * 13.7 + phase * 7.0) * 0.4;
  off += n * fl * w.y * uWindStrength * 0.035 * (0.5 + gust);
  // keep branch length roughly constant: drop a little as it bends
  off.y -= length(off.xz) * 0.15 * h;
  return p + off;
}
`;

export const FOLIAGE_PUFF_GLSL = /* glsl */ `
uniform float uCenterNormals;
uniform float uCardPuff;
uniform float uMeshPuff;
attribute vec3 rawNormal;
attribute vec3 cardOffset;

// Shortest-arc rotation of a leaf card around its own center (p - dP) toward the camera,
// preserving the card's individual roll, curl, and size while opening up edge-on cards.
vec3 botanicaPuff(vec3 p, vec3 dP, vec3 cardN, float puff) {
  if (puff <= 0.001 || dot(dP, dP) < 1e-8) return p;
  bool ortho = projectionMatrix[3][3] == 1.0;
  vec3 camPos = (inverse(modelViewMatrix) * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 viewDir = ortho
    ? normalize(vec3(modelViewMatrix[0][2], modelViewMatrix[1][2], modelViewMatrix[2][2]))
    : normalize(camPos - (p - dP));
  vec3 n0 = dot(cardN, cardN) > 0.01 ? normalize(cardN) : vec3(0.0, 1.0, 0.0);
  float grazing = 1.0 - abs(dot(n0, viewDir));
  float k = clamp(puff * grazing * 0.65, 0.0, 0.75);
  vec3 dP_rot = (dP + n0 * dot(dP, viewDir) * k) * inversesqrt(1.0 + k * k * grazing);
  return p + (dP_rot - dP);
}
`;

function patchWind(shader) {
  Object.assign(shader.uniforms, windUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
    .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = botanicaWind(transformed, objectNormal, wind);`);
}

function patchLeafVertex(shader, extra) {
  Object.assign(shader.uniforms, windUniforms, foliageUniforms, extra);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${WIND_GLSL}\n${FOLIAGE_PUFF_GLSL}`)
    .replace(
      '#include <beginnormal_vertex>',
      `#include <beginnormal_vertex>
      vec3 botanicaRawN = dot(rawNormal, rawNormal) > 0.01 ? normalize(rawNormal) : objectNormal;
      objectNormal = normalize(mix(botanicaRawN, objectNormal, uCenterNormals));`,
    )
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      transformed = botanicaPuff(transformed, cardOffset, botanicaRawN, uCardPuff * uMeshPuff);
      transformed = botanicaWind(transformed, objectNormal, wind);`,
    );
}

export function createBarkMaterial(maps, name = 'Bark') {
  const mat = new THREE.MeshStandardMaterial({
    name,
    map: maps?.albedo ?? null,
    normalMap: maps?.normal ?? null,
    roughnessMap: maps?.orm ?? null,
    aoMap: maps?.orm ?? null,
    aoMapIntensity: 0.9,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    color: maps ? 0xffffff : 0x6b5a48,
  });
  mat.onBeforeCompile = (shader) => patchWind(shader);
  mat.customProgramCacheKey = () => 'botanica-bark';
  return mat;
}

export function createLeafMaterial(maps, params, name = 'Leaves', { noFlip = 0.85, cardPuff = 0.45 } = {}) {
  const mat = new THREE.MeshPhysicalMaterial({
    specularIntensity: 0.28,
    name,
    map: maps?.albedo ?? null,
    normalMap: maps?.normal ?? null,
    roughnessMap: maps?.orm ?? null,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    side: THREE.DoubleSide,
    alphaTest: params?.alphaCutoff ?? 0.45,
    alphaToCoverage: true,
    envMapIntensity: 0.7,
    color: maps ? 0xffffff : 0x4a7a30,
  });
  const extra = {
    uTranslucencyMap: { value: maps?.translucency ?? null },
    uTranslucency: { value: 1.0 },
    uSubsurface: { value: new THREE.Color(params?.colorSubsurface ?? '#a8c43c') },
    uNoFlip: { value: noFlip },
    uMeshPuff: { value: cardPuff },
  };
  mat.userData.uniforms = extra;
  mat.onBeforeCompile = (shader) => {
    patchLeafVertex(shader, extra);
    const lights = THREE.ShaderChunk.lights_fragment_begin.replaceAll(
      'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
      `RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
      {
        float scatter = pow(saturate(dot(geometryViewDir, -directLight.direction)), 3.0) * 0.75
                      + saturate(dot(-geometryNormal, directLight.direction)) * 0.35;
        reflectedLight.directDiffuse += directLight.color * botanicaTrans * scatter;
      }`,
    );
    const normalBegin = THREE.ShaderChunk.normal_fragment_begin.replace(
      'normal *= faceDirection;',
      'normal *= (uNoFlip * uCenterNormals) > 0.5 ? 1.0 : faceDirection;',
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform sampler2D uTranslucencyMap;
        uniform float uTranslucency;
        uniform vec3 uSubsurface;
        uniform float uNoFlip;
        uniform float uCenterNormals;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        vec3 botanicaTrans = vec3(0.0);
        #ifdef USE_MAP
          botanicaTrans = uSubsurface * texture2D(uTranslucencyMap, vMapUv).r * uTranslucency * diffuseColor.rgb * 2.2;
        #endif
        #ifdef USE_COLOR
          botanicaTrans *= vColor.r * vColor.r;
        #endif`,
      )
      .replace(
        '#include <alphatest_fragment>',
        `#ifdef USE_MAP
          // mip-aware alpha (same as the Godot shader): keeps foliage from thinning out with distance
          vec2 botanicaTs = vec2(textureSize(map, 0));
          vec2 botanicaDx = dFdx(vMapUv * botanicaTs), botanicaDy = dFdy(vMapUv * botanicaTs);
          float botanicaLod = max(0.0, 0.5 * log2(max(dot(botanicaDx, botanicaDx), dot(botanicaDy, botanicaDy))));
          diffuseColor.a *= 1.0 + botanicaLod * 0.25;
        #endif
        #include <alphatest_fragment>`,
      )
      .replace('#include <normal_fragment_begin>', normalBegin)
      .replace('#include <lights_fragment_begin>', lights);
  };
  mat.customProgramCacheKey = () => 'botanica-leaf-v3';

  const depth = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: maps?.albedo ?? null,
    alphaTest: params?.alphaCutoff ?? 0.45,
    side: THREE.DoubleSide,
  });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms, foliageUniforms, extra);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}\n${FOLIAGE_PUFF_GLSL}`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        transformed = botanicaPuff(transformed, cardOffset, rawNormal, uCardPuff * uMeshPuff * 0.5);
        transformed = botanicaWind(transformed, normal, wind);`,
      );
  };
  depth.customProgramCacheKey = () => 'botanica-leaf-depth-v3';
  mat.userData.depthMaterial = depth;
  return mat;
}

export function barkDepthMaterial() {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${WIND_GLSL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed = botanicaWind(transformed, normal, wind);`);
  };
  return depth;
}
