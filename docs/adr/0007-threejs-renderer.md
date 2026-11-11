# ADR 0007: Render with Three.js; keep the world as instances

Date: 2026-11-11. Status: accepted. Supersedes ADR 0002 for rendering.

## Decision
The renderer is Three.js r187 (MIT), bundled into the single page. The scene builders still emit instances (matrix, colour, material id, geometry id); the renderer buckets them into one `InstancedMesh` per geometry and material, about 60 to 220 draw calls in all.

- **Surfaces** are `MeshStandardMaterial` / `MeshPhysicalMaterial` with world-space detail injected by `onBeforeCompile`: windows with recessed glass and lit rooms at dusk, brick with mortar, concrete paving, asphalt, grass, snow cover on anything facing up, wet streets with puddles and ripples, river ice. Detail textures are generated at startup (`textures.ts`), so the page needs no image files.
- **Light**: a sun with a 4096 shadow map that follows the player, a hemisphere fill, and image-based lighting from the procedural sky (PMREM), so glass and wet roads reflect the season's sky.
- **Water**: Three's planar-reflection `Water` on High, a shader water elsewhere; ice in winter.
- **Post**: GTAO ambient occlusion (High), bloom (High and Medium), ACES filmic tone mapping.
- **Quality**: High, Medium, Low. Phones start on Medium; any device steps down after about three seconds of slow frames. The player can choose and it is remembered.

## Why not a bigger hand-written renderer, or Unity
Three.js gives physically based shading, shadows, reflections and post-processing that would take weeks to write by hand, and it runs everywhere the old renderer did. Unity would mean rewriting the game and the tests, and its web builds are much heavier.

## Cost
The page grew from 134 kB to about 740 kB. Three is typed as `any` here because `@types/three` could not be installed in this workspace.
