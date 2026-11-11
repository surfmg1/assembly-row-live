// Three.js ships without bundled type declarations and this workspace cannot fetch @types/three,
// so the engine is typed as `any`. The game logic in src/sim stays fully typed.
declare module 'three';
declare module 'three/addons/*';
