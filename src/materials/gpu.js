// Offscreen GPU baker: renders full-screen fragment shaders into render targets.
// Row 0 of read-back data is gl_FragCoord.y ≈ 0, which becomes v = 0 (image top) under the
// glTF / flipY=false convention used throughout.
//
// Heavy procedural work goes into a "data" pass rendered to a half-float target that stays on
// the GPU; cheap "shade" passes then sample it. Keeping each shader small matters: ANGLE/D3D
// compile time explodes when large noise functions get inlined several times.

import * as THREE from 'three';

let baker = null;

function getBaker() {
  if (baker) return baker;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: false });
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  scene.add(quad);
  baker = { renderer, scene, camera, quad, targets: new Map() };
  return baker;
}

function target(size, float) {
  const b = getBaker();
  const key = `${size}:${float ? 'f' : 'b'}`;
  if (!b.targets.has(key)) {
    b.targets.set(key, new THREE.WebGLRenderTarget(size, size, {
      type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      colorSpace: THREE.NoColorSpace,
    }));
  }
  return b.targets.get(key);
}

const VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Create a bake program. `fragment` must define `vec4 bake(vec2 uv)`.
 * Returns { pixels(values, size) -> Uint8Array, data(values, size) -> Texture (half float, GPU-resident) }.
 * A data() texture is only valid until the next data() call of the same size.
 */
export function createBakeProgram(fragment, uniforms = {}, defines = {}) {
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
precision highp float;
precision highp int;
${Object.entries(defines).map(([k, v]) => `#define ${k} ${v}`).join('\n')}
uniform vec2 uResolution;
out vec4 outColor;
${fragment}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  outColor = bake(uv);
}
`,
    uniforms: { uResolution: { value: new THREE.Vector2(1, 1) }, ...uniforms },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });

  const render = (values, size, float) => {
    const b = getBaker();
    for (const [k, v] of Object.entries(values)) {
      if (!material.uniforms[k]) material.uniforms[k] = { value: v };
      else material.uniforms[k].value = v;
    }
    material.uniforms.uResolution.value.set(size, size);
    b.quad.material = material;
    const rt = target(size, float);
    b.renderer.setRenderTarget(rt);
    b.renderer.render(b.scene, b.camera);
    b.renderer.setRenderTarget(null);
    return rt;
  };

  return {
    pixels(values, size) {
      const rt = render(values, size, false);
      const out = new Uint8Array(size * size * 4);
      getBaker().renderer.readRenderTargetPixels(rt, 0, 0, size, size, out);
      return out;
    },
    data(values, size) {
      return render(values, size, true).texture;
    },
  };
}

/** Upload RGBA bytes as a regular texture. */
export function dataTexture(data, size, { srgb = false, repeat = false, mipmaps = true } = {}) {
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.flipY = false;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.generateMipmaps = mipmaps;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function hexToLinear(hex) {
  const c = new THREE.Color(hex); // THREE.Color stores linear values
  return new THREE.Vector3(c.r, c.g, c.b);
}
