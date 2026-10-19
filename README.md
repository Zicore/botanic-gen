# Botanica — Procedural Foliage Studio

A browser-based, node-driven generator for **game-ready trees and foliage**: procedural PBR bark and
leaf textures, twig-cluster atlases, LODs, baked AO, wind data and a one-click **Godot 4** package.
Built with React, React Flow and Three.js.

**[Live Demo](https://zicore.github.io/botanic-gen/)**

![Editor](public/screenshots/editor.jpg)

| Oak | Spruce | Palm |
|---|---|---|
| ![Oak](public/screenshots/oak.jpg) | ![Spruce](public/screenshots/spruce.jpg) | ![Palm](public/screenshots/palm.jpg) |
| **Birch** | **Shrub** | **Grass** |
| ![Birch](public/screenshots/birch.jpg) | ![Shrub](public/screenshots/shrub.jpg) | ![Grass](public/screenshots/grass.jpg) |

## Features

### Generator graph
- **Node editor** (SpeedTree-style generator hierarchy): Tree → Trunk → Branches (any depth) → Leaves / Fronds,
  plus Grass Clumps. Typed ports with validation, drag from a port into empty space to spawn a child,
  context menus, duplicate subtrees, enable/disable, tidy layout, minimap.
- **Curve-driven parameters**: length, angle, radius, gravity and size can be shaped along the parent or
  the node's own length with an inline monotone-cubic curve editor.
- Phyllotaxy (spiral 137.5°, alternate, opposite, whorled, random), gravity, phototropism, flattening,
  gnarl noise, branch collars, root flare with buttress lobes, multi-stem trunks.
- **Undo/redo** for every edit, autosave, project files (`.botanica.json`), deterministic seeds per node.

### Geometry
- Continuous tubes with rotation-minimizing frames, UVs with consistent texel density and tangents.
- Branch collars and crotch occlusion hide junction seams; trunks sink into the ground.
- Leaf cards with fold, curl and twist variants; frond ribbons with rachis; 3D grass blades.
- Canopy-normal blending for soft, volumetric foliage shading.
- Generation runs in a Web Worker (typically 30–60 ms for a full tree).

### Procedural textures (GPU-baked, seamless)
- **Bark**: furrowed (oak), plated (pine/spruce), smooth (beech), papery (birch), fibrous (palm) —
  albedo, normal and ORM maps.
- **Foliage**: single leaves (ovate, elliptic, lanceolate, obovate, cordate, deltoid; lobes, serration,
  veins), **twig clusters** (many overlapping leaves with inter-leaf shadowing — the card type real-time
  trees are built from), **foliage clumps** for low-poly crowns, needle sprays, palm fronds and grass blades — albedo+alpha, normal, ORM and
  translucency maps, up to 4 atlas variants.

![Materials](public/screenshots/materials.jpg)

### City builder templates (low-poly)
Ten species tuned for scenes with thousands of trees (Species → *City builder · low-poly*): two or
three wood levels with 3–8 sides, no twig level, and big single-quad **foliage clump** cards (a dense
mass of small leaves on a twig fan — one card stands in for a whole leafy sub-branch). Bark textures
are 512 px. At the far LOD, thin terminal branches are dropped entirely; the foliage stays put.

![City builder templates](public/screenshots/city.jpg)

| Template | LOD0 | LOD1 | LOD2 |
|---|---|---|---|
| Street Linden | 1,276 | 722 | 220 |
| Plane Tree | 1,256 | 692 | 194 |
| Park Oak | 1,228 | 674 | 184 |
| Columnar Poplar | 716 | 402 | 96 |
| Birch | 720 | 362 | 98 |
| Cherry Blossom | 1,048 | 620 | 180 |
| Conifer | 1,282 | 954 | 152 |
| Boulevard Palm | 1,470 | 536 | 316 |
| Young Tree | 214 | 132 | 34 |
| Round Shrub | 212 | 100 | 88 |

### Viewport
- Physical sky with image-based lighting, shadowed sun, translucency that respects shadows,
  mip-aware alpha so foliage does not thin out with distance.
- Wind preview (same math as the exported Godot shader) and debug views: albedo, AO, wind weights, wireframe,
  skeleton overlay.
- **LOD preview**: show LOD0/1/2/3, or *Auto* to switch by camera distance with the exact visibility ranges of
  the Godot export.

### Export
- **Godot 4 package (.zip)** — drop into a project and instance the `.tscn`:
  - glTF + shared external textures (with `.import` presets for normal maps / VRAM compression)
  - 3 LODs with per-LOD visibility ranges, a `Trunk-colonly` collider (becomes a StaticBody3D).
    All LODs share the LOD0 skeleton and leaf layout — lower levels only use coarser tubes and an evenly
    spread subset of the leaf cards, enlarged around their middle — so switching never moves branches.
  - **LOD3 billboard impostor** (Tree node → *Billboard LOD*): the tree is baked from 8×8 directions over the
    upper hemisphere into an albedo + object-space-normal atlas (hemi-octahedral, 128 px per view by default).
    A camera-facing quad blends the four nearest views, so it holds up from any angle including straight
    down, is lit dynamically through the baked normals and casts shadows. 2 triangles per tree.
  - `botanica_foliage.gdshader` / `botanica_bark.gdshader`: wind, BACKLIGHT translucency, baked AO, mip-aware alpha
  - ShaderMaterials and an inherited scene that wires everything up
- **glTF binary (.glb)** with embedded PBR materials, AO in vertex color.
- **Texture maps (.zip)**.

#### Vertex data contract

| Channel | Meaning |
|---|---|
| `COLOR.rgb` | baked ambient occlusion × per-leaf/bark tint (multiplied into albedo by Godot's StandardMaterial3D) |
| `UV2.x` | branch flexibility, 0 (trunk) → 1 (outer twigs) |
| `UV2.y` | leaf flutter weight, 0 (stem) → 1 (leaf tip) |

## Getting started

```bash
npm install
npm run dev
```

## Build

```bash
npm run typecheck
npm run build
```

The typecheck checks JavaScript and JSX with TypeScript (`checkJs`, no emitted files).
It uses JSDoc and library types; strict mode is disabled for the existing JavaScript codebase.

## Project layout

```
src/
  core/       rng, noise, curves
  tree/       schema (node + material parameters), document model, presets, generator, worker
  materials/  GPU bake pipeline, bark + leaf texture generators, atlas layout
  viewer/     three.js viewport and materials (wind, translucency)
  export/     glTF / Godot exporters, LODs, Godot shaders
  state/      zustand store (undo/redo), engine bridge
  ui/         app shell, node editor, inspector, controls
```

## Related

- [Mountain Gen](https://zicore.github.io/mountain-gen/) — Procedural terrain generator

## License

ISC
