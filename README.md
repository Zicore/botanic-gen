# Botanic Generator

A browser-based 3D procedural foliage asset generator built with React and Three.js. Create trees, palms, bushes, and grass with real-time preview, customizable textures, and GLB export.

**[Live Demo](https://zicore.github.io/botanic-gen/)**

![React](https://img.shields.io/badge/React-19-blue) ![Three.js](https://img.shields.io/badge/Three.js-r183-green)

![Broadleaf Example](public/broadleaf_example.jpg)
![Bush Example](public/bush_example.jpg)
![Grass Example](public/grass_example.jpg)

## Features

- **5 Foliage Types** — Broadleaf, Pine, Palm, Bush, Grass
- **3D Generator** — Full control over trunk, branches, leaves, and mesh resolution
- **Texture Studio** — Edit leaf textures in real-time with per-type parameters (shape, distribution, color)
- **Material Colors** — Separate leaf and trunk colors per foliage type via color picker
- **GLB Export** — Download production-ready 3D models
- **PNG Export** — Download generated textures
- **Stylized / PBR** — Toggle between toon-shaded and physically-based rendering
- **Seeded Generation** — Reproducible textures via seed parameter

## Getting Started

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Related

- [Mountain Gen](https://zicore.github.io/mountain-gen/) — Procedural terrain generator

## License

ISC
