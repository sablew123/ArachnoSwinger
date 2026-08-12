// world/rng.js
// ---- PRNG determinista (mulberry32): misma seed = misma secuencia de numeros, siempre ----
// esto es lo que hace posible que toda la ciudad sea determinista: un chunk que ya visitaste y
// se descargo de memoria, al volver a acercarte se regenera EXACTAMENTE IGUAL (mismos edificios,
// mismas estructuras que se sumen a futuro), en vez de tirar cosas nuevas al azar cada vez.
function mulberry32(seed){
  return function(){
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// semilla global del mundo: se fija una sola vez al cargar la pagina (asi cada partida puede
// tener una ciudad distinta), pero a partir de ahi TODO lo que se genera es determinista
const WORLD_SEED = Math.floor(Math.random()*0xFFFFFFFF);

// RNG propio de un chunk para GENERACION DE ESTRUCTURAS (edificios y lo que se sume a futuro):
// combina la seed global con el indice del chunk para que cada franja tenga su propia secuencia
// (independiente de las demas) pero siempre la MISMA si volves a generarla. TODOS los
// generadores de un mismo chunk (ver world/registry.js) COMPARTEN esta misma secuencia de
// numeros, consumiendola en el orden en que estan listados en world/manifest.js -- asi que si
// agregas un generador nuevo antes de otro en esa lista, el que viene despues simplemente
// empieza a consumir numeros un poco mas tarde en la secuencia (sigue siendo determinista, solo
// cambia EN QUE PUNTO arranca cada uno).
function chunkRng(chunkIndex){
  const h = (Math.imul(chunkIndex + 0x9E3779B9, 2654435761) ^ WORLD_SEED) >>> 0;
  return mulberry32(h);
}

// mismo concepto que chunkRng, pero con una sal distinta: pensado para que quien spawnee
// entidades por chunk (civiles.js, etc.) tenga su PROPIA secuencia determinista, sin importar
// cuantos numeros haya consumido ya la generacion de estructuras de ese chunk (asi un cambio en
// cualquier generador de world/structures/ no le corre la semilla a las entidades, y viceversa)
function chunkEntityRng(chunkIndex){
  const h = (Math.imul(chunkIndex + 0x51ED270B, 2246822519) ^ (WORLD_SEED ^ 0x2f6e2b1)) >>> 0;
  return mulberry32(h);
}
