// Exporters: GLB, Godot 4 package, texture maps, project files.

import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { zipSync, strToU8 } from 'fflate';
import { engine, generationDoc, bakeAll, impostorSettings } from '../state/engine.js';
import { rgbaToCanvas, canvasToBlob } from '../materials/textures.js';
import { GODOT_FOLIAGE_SHADER, GODOT_BARK_SHADER, GODOT_IMPOSTOR_SHADER } from './godotShaders.js';
import { lodDocument, lodRanges, LOD_COUNT, IMPOSTOR_LEVEL } from './lod.js';
import { bakeImpostor } from '../impostor/impostor.js';
import { encodePNG } from './png.js';

// ---------------------------------------------------------------------------
// helpers

export function slug(s) {
  return (s || 'tree').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'tree';
}

function pascal(s) {
  return (s || 'Tree').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Tree';
}

function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function pngBytes(data, size, opts) {
  const blob = await canvasToBlob(rgbaToCanvas(data, size, opts));
  return new Uint8Array(await blob.arrayBuffer());
}

function ensureTextures(doc) {
  bakeAll(doc.materials);
  return engine.textures;
}

function uniqueSlugs(materials) {
  const used = new Set();
  const out = new Map();
  for (const m of materials) {
    let s = slug(m.name);
    let k = 2;
    while (used.has(s)) s = `${slug(m.name)}_${k++}`;
    used.add(s);
    out.set(m.id, s);
  }
  return out;
}

const MAPS = {
  bark: ['albedo', 'normal', 'orm'],
  leaf: ['albedo', 'normal', 'orm', 'translucency'],
};

function makeGeometry(group) {
  const A = group.attributes;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(A.position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(A.normal, 3));
  geo.setAttribute('tangent', new THREE.BufferAttribute(A.tangent, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(A.uv, 2));
  geo.setAttribute('uv1', new THREE.BufferAttribute(A.uv1, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(A.color, 4));
  geo.setIndex(new THREE.BufferAttribute(group.index, 1));
  return geo;
}

/** Standard PBR material for glTF. Textures are named so they can be remapped to files. */
function exportMaterial(material, tex, names) {
  const named = (t, map) => {
    if (!t) return null;
    const c = t.clone();
    c.name = names ? `${names}_${map}` : `${slug(material.name)}_${map}`;
    c.flipY = false;
    return c;
  };
  const maps = tex?.maps;
  const orm = named(maps?.orm, 'orm');
  const params = {
    name: slug(material.name),
    map: named(maps?.albedo, 'albedo'),
    normalMap: named(maps?.normal, 'normal'),
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  };
  if (material.kind === 'bark') {
    params.aoMap = orm;
  } else {
    params.side = THREE.DoubleSide;
    params.alphaTest = material.params.alphaCutoff;
  }
  return new THREE.MeshStandardMaterial(params);
}

function buildScene(results, doc, { names = null, collision = true } = {}) {
  const scene = new THREE.Scene();
  const mats = new Map();
  const matFor = (id) => {
    if (!mats.has(id)) {
      const m = doc.materials.find((x) => x.id === id);
      mats.set(id, m ? exportMaterial(m, engine.textures.get(id), names?.get(id)) : new THREE.MeshStandardMaterial({ name: 'missing' }));
    }
    return mats.get(id);
  };
  const meshNames = [];
  results.forEach((result, lod) => {
    const prefix = results.length > 1 ? `LOD${lod}_` : '';
    let leafIndex = 0;
    for (const g of result.groups) {
      const leafCount = result.groups.filter((x) => x.kind === 'leaf').length;
      const name = g.kind === 'bark' ? `${prefix}Bark` : `${prefix}Leaves${leafCount > 1 ? `_${leafIndex++}` : ''}`;
      const mesh = new THREE.Mesh(makeGeometry(g), matFor(g.materialId));
      mesh.name = name;
      scene.add(mesh);
      meshNames.push({ name, lod, kind: g.kind, materialId: g.materialId });
    }
  });
  if (collision && results[0].collision?.index.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(results[0].collision.position, 3));
    geo.setIndex(new THREE.BufferAttribute(results[0].collision.index, 1));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ name: 'collision' }));
    mesh.name = 'Trunk-colonly';
    scene.add(mesh);
  }
  return { scene, meshNames };
}

// ---------------------------------------------------------------------------
// GLB

export async function exportGLB(doc) {
  if (!engine.result) throw new Error('Nothing generated yet.');
  ensureTextures(doc);
  const { scene } = buildScene([engine.result], doc, { collision: false });
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  download(glb, `${pascal(doc.name)}.glb`, 'model/gltf-binary');
}

// ---------------------------------------------------------------------------
// Textures

export async function exportTexturesZip(doc) {
  ensureTextures(doc);
  const names = uniqueSlugs(doc.materials);
  const files = {};
  for (const m of doc.materials) {
    const t = engine.textures.get(m.id);
    if (!t) continue;
    for (const map of MAPS[m.kind]) files[`${names.get(m.id)}_${map}.png`] = await pngBytes(t.raw[map], t.raw.size, { opaque: map !== 'albedo' });
  }
  download(zipSync(files, { level: 0 }), `${pascal(doc.name)}_textures.zip`, 'application/zip');
}

// ---------------------------------------------------------------------------
// Godot package

const TEXTURE_IMPORT = (normal, alpha) => `[remap]

importer="texture"
type="CompressedTexture2D"

[params]

compress/mode=2
compress/high_quality=false
compress/lossy_quality=0.7
compress/uastc_level=0
compress/rdo_quality_loss=0.0
compress/hdr_compression=1
compress/normal_map=${normal ? 1 : 2}
compress/channel_pack=0
mipmaps/generate=true
mipmaps/limit=-1
roughness/mode=0
roughness/src_normal=""
process/channel_remap/red=0
process/channel_remap/green=1
process/channel_remap/blue=2
process/channel_remap/alpha=3
process/fix_alpha_border=${alpha ? 'true' : 'false'}
process/premult_alpha=false
process/normal_map_invert_y=false
process/hdr_as_srgb=false
process/hdr_clamp_exposure=false
process/size_limit=0
detect_3d/compress_to=0
`;

function tres(type, extResources, props) {
  const lines = [`[gd_resource type="${type}" load_steps=${extResources.length + 1} format=3]`, ''];
  extResources.forEach((r) => lines.push(`[ext_resource type="${r.type}" path="${r.path}" id="${r.id}"]`));
  lines.push('', '[resource]');
  for (const [k, v] of Object.entries(props)) lines.push(`${k} = ${v}`);
  lines.push('');
  return lines.join('\n');
}

// THREE.Color stores linear values; Godot source_color uniforms are authored in sRGB
const gdColor = (hex) => {
  const s = new THREE.Color(hex).convertLinearToSRGB();
  return `Color(${s.r.toFixed(4)}, ${s.g.toFixed(4)}, ${s.b.toFixed(4)}, 1)`;
};

const gdVec3 = (v) => `Vector3(${v.map((x) => x.toFixed(4)).join(', ')})`;

export async function buildGodotPackage(doc) {
  if (!engine.result) throw new Error('Nothing generated yet.');
  ensureTextures(doc);
  const base = pascal(doc.name);
  const root = `${base}/`;
  const names = uniqueSlugs(doc.materials);
  const files = {};

  // LODs (LOD0 = what is on screen)
  const gdoc = generationDoc(doc);
  const results = [engine.result];
  for (let l = 1; l < LOD_COUNT; l++) results.push(await engine.generator.once(lodDocument(gdoc, l)));
  const height = Math.max(0.5, engine.result.bounds?.max[1] ?? 10);

  // textures
  const usedMaterials = doc.materials.filter((m) => results.some((r) => r.groups.some((g) => g.materialId === m.id)));
  for (const m of usedMaterials) {
    const t = engine.textures.get(m.id);
    for (const map of MAPS[m.kind]) {
      const file = `textures/${names.get(m.id)}_${map}.png`;
      files[root + file] = await pngBytes(t.raw[map], t.raw.size, { opaque: map !== 'albedo' });
      files[`${root + file}.import`] = strToU8(TEXTURE_IMPORT(map === 'normal', map === 'albedo'));
    }
  }

  // glTF with external, shared textures
  const { scene, meshNames } = buildScene(results, doc, { names });
  const json = await new GLTFExporter().parseAsync(scene, { binary: false, embedImages: true });
  const gltf = typeof json === 'string' ? JSON.parse(json) : json;
  (gltf.textures || []).forEach((t) => {
    if (t.name && gltf.images?.[t.source]) gltf.images[t.source] = { uri: `textures/${t.name}.png`, mimeType: 'image/png' };
  });
  if (gltf.buffers?.[0]?.uri?.startsWith('data:')) {
    const b64 = gltf.buffers[0].uri.split(',')[1];
    const bin = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    files[`${root}${base}.bin`] = bin;
    gltf.buffers[0].uri = `${base}.bin`;
  }
  // embedded images that could not be mapped stay as data URIs (e.g. collision)
  files[`${root}${base}.gltf`] = strToU8(JSON.stringify(gltf, null, 1));

  // shaders
  files[`${root}shaders/botanica_foliage.gdshader`] = strToU8(GODOT_FOLIAGE_SHADER);
  files[`${root}shaders/botanica_bark.gdshader`] = strToU8(GODOT_BARK_SHADER);

  // billboard impostor (LOD3), baked from LOD0 with the viewport's renderer
  const imp = impostorSettings(doc);
  let impostor = null;
  if (imp.enabled && engine.viewer) {
    impostor = bakeImpostor(engine.viewer.renderer, engine.result, engine.textures, imp);
    const isl = slug(base);
    for (const [map, srgb] of [['albedo', true], ['normal', false]]) {
      const file = `textures/${isl}_impostor_${map}.png`;
      files[root + file] = encodePNG(impostor[map], impostor.size, impostor.size);
      files[`${root + file}.import`] = strToU8(TEXTURE_IMPORT(false, srgb));
    }
    files[`${root}shaders/botanica_impostor.gdshader`] = strToU8(GODOT_IMPOSTOR_SHADER);
    files[`${root}materials/${isl}_impostor.tres`] = strToU8(tres('ShaderMaterial', [
      { type: 'Shader', path: '../shaders/botanica_impostor.gdshader', id: '1_shader' },
      { type: 'Texture2D', path: `../textures/${isl}_impostor_albedo.png`, id: '2_albedo' },
      { type: 'Texture2D', path: `../textures/${isl}_impostor_normal.png`, id: '3_normal' },
    ], {
      resource_name: `"${isl}_impostor"`,
      shader: 'ExtResource("1_shader")',
      'shader_parameter/albedo_atlas': 'ExtResource("2_albedo")',
      'shader_parameter/normal_atlas': 'ExtResource("3_normal")',
      'shader_parameter/frames': impostor.frames.toFixed(1),
      'shader_parameter/center': gdVec3(impostor.center),
      'shader_parameter/radius': impostor.radius.toFixed(4),
      'shader_parameter/alpha_cutoff': imp.alphaCutoff.toFixed(3),
      'shader_parameter/subsurface_color': gdColor(imp.subsurface),
    }));
  }

  // materials
  const matPath = new Map();
  for (const m of usedMaterials) {
    const s = names.get(m.id);
    const tex = (map, id) => ({ type: 'Texture2D', path: `../textures/${s}_${map}.png`, id });
    const P = m.params;
    let content;
    if (m.kind === 'bark') {
      content = tres('ShaderMaterial', [
        { type: 'Shader', path: '../shaders/botanica_bark.gdshader', id: '1_shader' },
        tex('albedo', '2_albedo'), tex('normal', '3_normal'), tex('orm', '4_orm'),
      ], {
        resource_name: `"${s}"`,
        shader: 'ExtResource("1_shader")',
        'shader_parameter/albedo_texture': 'ExtResource("2_albedo")',
        'shader_parameter/normal_texture': 'ExtResource("3_normal")',
        'shader_parameter/orm_texture': 'ExtResource("4_orm")',
        'shader_parameter/tree_height': height.toFixed(3),
      });
    } else {
      content = tres('ShaderMaterial', [
        { type: 'Shader', path: '../shaders/botanica_foliage.gdshader', id: '1_shader' },
        tex('albedo', '2_albedo'), tex('normal', '3_normal'), tex('orm', '4_orm'), tex('translucency', '5_trans'),
      ], {
        resource_name: `"${s}"`,
        shader: 'ExtResource("1_shader")',
        'shader_parameter/albedo_texture': 'ExtResource("2_albedo")',
        'shader_parameter/normal_texture': 'ExtResource("3_normal")',
        'shader_parameter/orm_texture': 'ExtResource("4_orm")',
        'shader_parameter/translucency_texture': 'ExtResource("5_trans")',
        'shader_parameter/alpha_cutoff': P.alphaCutoff.toFixed(3),
        'shader_parameter/subsurface_color': gdColor(P.colorSubsurface),
        'shader_parameter/tree_height': height.toFixed(3),
      });
    }
    const path = `materials/${s}.tres`;
    files[root + path] = strToU8(content);
    matPath.set(m.id, path);
  }

  // inherited scene: material overrides + LOD visibility ranges
  const ranges = lodRanges(height);
  const ext = [{ type: 'PackedScene', path: `${base}.gltf`, id: '1_scene' }];
  const matIds = new Map();
  usedMaterials.forEach((m, i) => {
    const id = `${i + 2}_mat`;
    matIds.set(m.id, id);
    ext.push({ type: 'Material', path: matPath.get(m.id), id });
  });
  if (impostor) ext.push({ type: 'Material', path: `materials/${slug(base)}_impostor.tres`, id: 'imp_mat' });
  const tscn = [`[gd_scene load_steps=${ext.length + (impostor ? 2 : 1)} format=3]`, ''];
  ext.forEach((r) => tscn.push(`[ext_resource type="${r.type}" path="${r.path}" id="${r.id}"]`));
  if (impostor) tscn.push('', '[sub_resource type="QuadMesh" id="imp_quad"]', 'size = Vector2(2, 2)');
  tscn.push('', `[node name="${base}" instance=ExtResource("1_scene")]`, '');
  for (const mn of meshNames) {
    const r = ranges[mn.lod];
    tscn.push(`[node name="${mn.name}" parent="."]`);
    tscn.push(`surface_material_override/0 = ExtResource("${matIds.get(mn.materialId)}")`);
    // No hysteresis margins: Godot starts every instance hidden and shrinks the range of a
    // hidden one by its margins, so a tree spawned inside the margin band of a LOD boundary
    // would show neither LOD until the camera left the band.
    if (r.begin > 0) tscn.push(`visibility_range_begin = ${r.begin.toFixed(2)}`);
    if (mn.lod < LOD_COUNT - 1 || impostor) tscn.push(`visibility_range_end = ${r.end.toFixed(2)}`);
    tscn.push('');
  }
  if (impostor) {
    // vertices are placed by the shader, so culling needs the tree's bounding sphere
    const [cx, cy, cz] = impostor.center;
    const R = impostor.radius;
    tscn.push(
      `[node name="LOD${IMPOSTOR_LEVEL}_Impostor" type="MeshInstance3D" parent="."]`,
      `custom_aabb = AABB(${(cx - R).toFixed(3)}, ${(cy - R).toFixed(3)}, ${(cz - R).toFixed(3)}, ${(2 * R).toFixed(3)}, ${(2 * R).toFixed(3)}, ${(2 * R).toFixed(3)})`,
      `visibility_range_begin = ${ranges[IMPOSTOR_LEVEL].begin.toFixed(2)}`,
      'mesh = SubResource("imp_quad")',
      'surface_material_override/0 = ExtResource("imp_mat")',
      '',
    );
  }
  files[`${root}${base}.tscn`] = strToU8(tscn.join('\n'));

  const last = impostor ? IMPOSTOR_LEVEL : LOD_COUNT - 1;
  const range = (i) => `${ranges[i].begin.toFixed(0)}–${i < last ? ranges[i].end.toFixed(0) : '∞'} m`;
  const rows = results.map((r, i) => `| LOD${i} | ${r.stats.triangles.toLocaleString('en')} | ${r.stats.vertices.toLocaleString('en')} | ${range(i)} |`);
  if (impostor) rows.push(`| LOD${IMPOSTOR_LEVEL} (billboard, ${impostor.frames}×${impostor.frames} views) | 2 | 4 | ${range(IMPOSTOR_LEVEL)} |`);
  const stats = rows.join('\n');
  files[`${root}README.md`] = strToU8(readme(base, stats, height));
  files[`${root}${base}.botanica.json`] = strToU8(JSON.stringify(doc, null, 1));
  return { files, base };
}

export async function exportGodotPackage(doc) {
  const { files, base } = await buildGodotPackage(doc);
  download(zipSync(files, { level: 6 }), `${base}_godot.zip`, 'application/zip');
}

function readme(base, stats, height) {
  return `# ${base} — Botanica export for Godot 4

Drop this folder anywhere inside your Godot project and instance **${base}.tscn**.

| LOD | Triangles | Vertices | Visible |
|-----|-----------|----------|---------|
${stats}

## Contents

- \`${base}.gltf\` / \`.bin\` — meshes for all LODs plus \`Trunk-colonly\`
  (Godot turns it into a StaticBody3D trunk collider on import).
- \`${base}.tscn\` — inherited scene: assigns the Botanica shader materials and sets
  per-LOD visibility ranges (hard switch, no margins). Godot's \`Self\` fade mode
  blends through transparency, which causes sorting artefacts on foliage, so it is left off.
- \`LOD3_Impostor\` — billboard for the far range: a 2×2 QuadMesh with
  \`botanica_impostor.gdshader\`, which turns it toward the camera (or the light, for shadows)
  and blends the four nearest of the views baked into \`textures/*_impostor_albedo/normal.png\`
  (hemi-octahedral atlas, object-space normals so it is lit like the mesh). It casts shadows but
  does not receive them; \`custom_aabb\` covers the tree because the shader places the vertices.
- \`materials/*.tres\` — ShaderMaterials (bark, foliage, impostor).
- \`shaders/\` — \`botanica_foliage.gdshader\` (alpha-tested, double-sided, translucency via
  BACKLIGHT, mip-aware alpha, wind) and \`botanica_bark.gdshader\`.
- \`textures/\` — albedo (sRGB, alpha), normal (OpenGL/+Y), ORM (AO/Roughness/–),
  translucency. \`.import\` presets mark normal maps and enable mipmaps.
- \`${base}.botanica.json\` — source project; open it in Botanica to keep editing.

## Vertex data

| Channel | Meaning |
|---------|---------|
| \`COLOR.rgb\` | baked ambient occlusion × per-leaf tint (also used by StandardMaterial3D) |
| \`UV2.x\` | branch flexibility 0 (trunk) → 1 (outer twigs) |
| \`UV2.y\` | leaf flutter weight 0 (stem) → 1 (leaf tip) |

## Wind

Each material exposes \`wind_strength\`, \`wind_direction\`, \`wind_speed\` and \`tree_height\`
(preset to ${height.toFixed(2)} m). Trunk bend is derived from vertex height, branch sway
from \`UV2.x\`, leaf flutter from \`UV2.y\`; the instance position offsets the phase so a
forest does not move in sync. To drive all trees together, turn the wind uniforms into
\`global uniform\`s in the two shaders.
`;
}

// ---------------------------------------------------------------------------
// Project files

export function saveProject(doc) {
  download(JSON.stringify(doc, null, 1), `${pascal(doc.name)}.botanica.json`, 'application/json');
}

export async function loadProjectFile(file) {
  return JSON.parse(await file.text());
}
