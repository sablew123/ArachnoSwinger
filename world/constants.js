// world/constants.js
// constantes basicas del mundo (geometria general), independientes de que estructuras se
// generen adentro de cada chunk. Si mañana un generador nuevo necesita su propia constante
// (ancho minimo, densidad, lo que sea), esa constante vive en SU PROPIO archivo (ver
// world/structures/buildings.js para el ejemplo de los edificios), no aca.

const WORLD_WIDTH = 13000; // ya no es el ancho total (la ciudad es infinita): solo define el ancho de cada chunk (ver CHUNK_WIDTH)
const STREET_Y    = 480;   // nivel de la calle (suelo)

// ---- CHUNKS ----
// un chunk mide la mitad de WORLD_WIDTH, y siempre hay CHUNKS_LOADED cargados alrededor del
// jugador (el suyo + el de cada lado), asi la ciudad puede seguir para siempre sin tener que
// guardar en memoria los chunks ya lejanos (ver world/chunks.js)
const CHUNK_WIDTH   = WORLD_WIDTH / 2;
const CHUNKS_LOADED = 3;
