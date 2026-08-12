// world/registry.js
// ---- REGISTRO DE GENERADORES DE ESTRUCTURAS ----
// cualquier archivo de world/structures/ puede empujar aca su propia funcion generadora, SIN
// tocar world/chunks.js. generateChunk (ver world/chunks.js) las llama TODAS, una vez por
// chunk, en el orden en que estan listadas en world/manifest.js, pasandoles un "ctx" compartido
// -- cada generador le agrega sus propias estructuras (con un `type` que las identifica, ej.
// 'building') a ese mismo ctx.structures, y opcionalmente plataformas caminables (techos,
// balcones, el tablero de un puente, lo que sea) a ctx.platforms.
//
// firma esperada: fn(ctx) donde ctx = {
//   index       -- indice del chunk que se esta generando
//   startX,endX -- limites en X de este chunk (coordenadas de mundo)
//   rng         -- generador determinista propio de ESTE chunk (mulberry32 con seed fija, ver
//                  world/rng.js): mismo chunk siempre da la misma secuencia de numeros. Todos
//                  los generadores de un mismo chunk comparten esta misma secuencia (ver el
//                  comentario en world/rng.js sobre el orden de consumo)
//   structures  -- array MUTABLE compartido: cada generador le hace push a sus propias
//                  estructuras generadas (SIEMPRE con un campo `type`, ver
//                  world/structures/buildings.js para el ejemplo)
//   platforms   -- array MUTABLE compartido de plataformas caminables de un solo sentido (como
//                  los techos/balcones de un edificio hoy, o lo que genere una estructura futura)
// }
//
// el orden de ejecucion (el mismo en que se listan en world/manifest.js) importa si un
// generador nuevo necesita "ver" lo que ya se puso en el chunk (ctx.structures) para no pisarlo
// -- por ejemplo, un futuro streetlight.js que quiera evitar spawnear pegado a un edificio solo
// necesita listarse DESPUES de structures/buildings.js en el manifest.
window.WORLD_STRUCTURE_GENERATORS = [];
function registerWorldStructureGenerator(fn){
  window.WORLD_STRUCTURE_GENERATORS.push(fn);
}
