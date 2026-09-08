// world/manifest.js
// Declara QUE archivos de mundo (constantes, trafico continuo de carros, RNG determinista,
// registro de generadores de estructuras, cada generador de estructura en si -- edificios hoy,
// lo que se sume a futuro -- y poder entrar a esos edificios) hay que cargar, y EN QUE ORDEN. Es
// sincronico (document.write), igual que physics/manifest.js: asi todo esto ya esta definido y
// listo ANTES de que arranque el resto del HTML (el <script> inline mas abajo, que llama a
// updateChunks(150) apenas arranca).
//
// Es el UNICO archivo que hay que editar para agregar/quitar un generador de estructuras. Para
// sumar un tipo nuevo (una plaza, un puente, un cartel gigante en la calle, lo que sea):
//   1. crear el archivo en world/structures/nombre.js
//   2. ese archivo llama a registerWorldStructureGenerator(fn) (ver world/registry.js) con su
//      propia funcion generadora -- fn recibe el mismo "ctx" que ya usa buildings.js
//   3. agregar 'structures/nombre.js' a la lista de abajo (el orden en que aparecen aca es el
//      orden en que se ejecutan los generadores dentro de cada chunk, ver world/chunks.js)
// NO hace falta tocar world/chunks.js ni este HTML para nada de eso.
(function(){
  var WORLD_FILES = [
    'constants.js',            // WORLD_WIDTH, STREET_Y, CHUNK_WIDTH, CHUNKS_LOADED
    'traffic.js',               // cars + CAR_* + spawnCar/trySpawnCars/despawnFarCars/drawCars
                                 // (solo necesita CHUNK_WIDTH/STREET_Y de constants.js, nada del
                                 // resto de esta lista, por eso puede ir tan arriba)
    'rng.js',                  // mulberry32 + chunkRng/chunkEntityRng (todo el determinismo)
    'registry.js',             // registerWorldStructureGenerator / window.WORLD_STRUCTURE_GENERATORS
    'structures/buildings.js', // primer (y hoy unico) generador: edificios (apartamento/oficina/hospital)
    'chunks.js',                // generateChunk/updateChunks: orquesta todo lo de arriba
    'interiors.js'              // poder ENTRAR a los edificios (ver ese archivo para el detalle
                                 // de como se engancha, minimamente, con spiderswing.html)
  ];
  for (var i = 0; i < WORLD_FILES.length; i++){
    document.write('<script src="world/' + WORLD_FILES[i] + '"><\/script>');
  }
})();
