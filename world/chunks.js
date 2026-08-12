// world/chunks.js
// Ciudad "infinita" generada por chunks: en vez de tirar Math.random() una sola vez para TODA
// la ciudad (lo que obliga a guardarla entera en memoria si queres que sea gigante), el mundo
// se parte en franjas (chunks) de ancho fijo (CHUNK_WIDTH, ver world/constants.js), cada una
// generada con un RNG propio y determinista (ver world/rng.js).
//
// este archivo NO sabe nada de edificios en particular, ni de ningun otro tipo de estructura en
// especial: por cada chunk arma un "ctx" compartido y le pide a CADA generador registrado (ver
// world/registry.js y window.WORLD_STRUCTURE_GENERATORS, poblado hoy solo por
// world/structures/buildings.js) que le agregue sus propias estructuras. Asi, sumar un tipo de
// estructura nuevo el dia de mañana es un archivo nuevo en world/structures/ + una linea en
// world/manifest.js, sin tocar nada de este archivo.
//
// cada estructura generada lleva un campo `type` (hoy solo existe 'building', el que pone
// world/structures/buildings.js) -- por eso `structures` (mas abajo) es la lista GENERICA de
// TODO lo que hay en el mundo, y `buildings` es simplemente el subconjunto con
// type==='building'. `buildings` se sigue manteniendo aparte porque el resto del motor
// (colisiones, escalar paredes, telaraña, render) ya asume que existe con esa forma; el dia que
// se sume una estructura nueva que tambien necesite su propio filtro rapido, el patron es el
// mismo: filtrar `structures` por su `type`, no inventar un array paralelo mas.

const structures = []; // TODAS las estructuras generadas (edificios hoy, lo que se sume a futuro), cada una con su `type`
const buildings  = []; // subconjunto de `structures` con type==='building' (ver rebuildWorldArrays)
const platforms  = []; // techos, balcones, o cualquier plataforma futura de un solo sentido: solo se puede aterrizar desde arriba (como los puentes de Mario)

const loadedChunks = new Map(); // indice de chunk -> {structures, buildings, platforms}

// ---- GANCHOS DE CHUNK (para que civiles.js/villanos.js puedan spawnear y despawnear solos) ----
// cualquier archivo de entidades puede empujar una funcion a estas listas SIN tocar este archivo.
// onLoad(chunkIndex, startX, endX, rng) se llama una vez, justo cuando ese chunk se termina de
// generar (rng es un chunkEntityRng propio de ese chunk: mismo chunk = misma secuencia siempre).
// onUnload(chunkIndex) se llama justo antes de que ese chunk se descargue de memoria (el momento
// correcto para, por ejemplo, marcar dead:true a las entidades que hayan spawneado ahi).
window.CHUNK_LOAD_LISTENERS   = [];
window.CHUNK_UNLOAD_LISTENERS = [];

// array de funciones fn() => x (o null/undefined si no aplica ahora mismo). Ademas de los
// CHUNKS_LOADED de siempre alrededor del jugador, updateChunks mantiene cargado el entorno de
// cada "anchor" registrado aca -- pensado para una entidad persistente que se aleja del jugador
// (ej. el boss volando con Jary Mane) y que NO deberia perder su chunk (y con el, el piso/
// estructuras debajo suyo) solo porque el jugador se quedo atras. Cualquier archivo de entidades
// puede empujar una funcion aca, igual que con los otros ganchos de arriba; sacarla (splice)
// cuando ya no haga falta forzar nada es responsabilidad de quien la agrego.
window.FORCED_CHUNK_ANCHORS = [];

// genera UN chunk completo, llamando en orden a cada generador de window.WORLD_STRUCTURE_GENERATORS
function generateChunk(index){
  const rng = chunkRng(index);
  const startX = index * CHUNK_WIDTH;
  const endX = startX + CHUNK_WIDTH;

  const ctx = { index, startX, endX, rng, structures: [], platforms: [] };
  for(const generate of window.WORLD_STRUCTURE_GENERATORS) generate(ctx);

  return {
    structures: ctx.structures,
    buildings: ctx.structures.filter(s => s.type === 'building'),
    platforms: ctx.platforms
  };
}

// reconstruye los arrays globales de estructuras/edificios/plataformas (los que usa el resto
// del juego: colisiones, render, etc.) a partir de los chunks actualmente cargados, en orden.
// Los carros NO se tocan aca: viven en su propio sistema de trafico continuo (ver mas abajo en
// el HTML principal, seccion TRAFICO)
function rebuildWorldArrays(){
  structures.length = 0; buildings.length = 0; platforms.length = 0;
  const indices = [...loadedChunks.keys()].sort((a,b)=>a-b);
  for(const i of indices){
    const c = loadedChunks.get(i);
    structures.push(...c.structures);
    buildings.push(...c.buildings);
    platforms.push(...c.platforms);
  }
}

// se llama cada frame: calcula que chunks deberian estar cargados segun donde esta el jugador,
// descarga los que ya no hacen falta (se liberan de memoria) y genera los nuevos que falten
// (siempre con la misma seed, asi que si ya los habias visitado salen identicos)
function updateChunks(playerX){
  // ciudad infinita en las dos direcciones: el chunk ya puede tener indice negativo (hacia la
  // izquierda del spawn) sin ningun problema, se genera igual que cualquier otro
  const start = Math.floor(playerX / CHUNK_WIDTH) - 1;
  const desired = new Set([start, start+1, start+2]);

  // sumamos el entorno (1 chunk de margen para cada lado, igual que el jugador) de cada anchor
  // forzado (ver window.FORCED_CHUNK_ANCHORS): asi una entidad lejos del jugador no se queda sin
  // mundo generado debajo, y su propio chunk no se descarga aunque el jugador este en otro lado
  for(const getAnchorX of window.FORCED_CHUNK_ANCHORS){
    const ax = getAnchorX();
    if(ax === null || ax === undefined) continue;
    const ac = Math.floor(ax / CHUNK_WIDTH);
    desired.add(ac-1); desired.add(ac); desired.add(ac+1);
  }

  let changed = false;
  for(const i of [...loadedChunks.keys()]){
    if(!desired.has(i)){
      loadedChunks.delete(i);
      changed = true;
      for(const fn of window.CHUNK_UNLOAD_LISTENERS) fn(i);
    }
  }
  for(const i of desired){
    if(!loadedChunks.has(i)){
      loadedChunks.set(i, generateChunk(i));
      changed = true;
      const chunkStartX = i * CHUNK_WIDTH, chunkEndX = chunkStartX + CHUNK_WIDTH;
      const rng = chunkEntityRng(i);
      for(const fn of window.CHUNK_LOAD_LISTENERS) fn(i, chunkStartX, chunkEndX, rng);
    }
  }
  if(changed) rebuildWorldArrays();
}
