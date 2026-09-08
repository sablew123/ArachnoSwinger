// ============================================================================
//  entities/bossengine.js
// ----------------------------------------------------------------------------
//  NO registra ningun tipo de entidad: es una cajita de utilidades genericas,
//  pensada para el Monstruo Loco Lima pero sin nada especifico de el adentro,
//  asi que cualquier archivo de entidades futuro las puede reusar igual.
//  Va PRIMERO en entities/manifest.js (antes de crazylimemonster.js) para que
//  esas funciones ya existan cuando el resto las necesite.
//
//  Envuelve dos hooks que se agregaron al motor (spiderswing.html) para esta
//  pelea:
//    - window.FORCED_CHUNK_ANCHORS  (carga de chunk forzada por entidad)
//    - window.AUTO_BULLET_TIME       (bullet time disparado por el motor)
// ============================================================================

// ---------- chunk forzado ----------
// registra una entidad como "ancla" de chunk: mientras este viva, el motor mantiene cargado
// el entorno de su posicion actual ADEMAS del entorno del jugador (ver FORCED_CHUNK_ANCHORS en
// spiderswing.html) -- pensado para que el boss pueda volar/arrastrar lejos del jugador sin que
// el mundo se le desarme debajo (ni que el se quede sin su propio chunk y lo maten los listeners
// de unload como pasaria con un civil comun).
//
// getEntity() debe devolver la entidad viva (o null/undefined si no aplica ahora mismo, ej. boss
// no invocado todavia, o ya muerto) -- se vuelve a preguntar cada frame, no hace falta desregistrar
// a mano cuando la entidad muere, simplemente esa funcion empieza a devolver null y el anchor
// deja de tener efecto solo.
function registerForcedChunkAnchor(getEntity){
  window.FORCED_CHUNK_ANCHORS.push(function(){
    const e = getEntity();
    return (e && !e.dead) ? e.x : null;
  });
}
window.registerForcedChunkAnchor = registerForcedChunkAnchor;

// ---------- bullet time automatico ----------
// arranca/corta el bullet time por decision del motor (no del jugador) -- por ejemplo, al
// activarse el rescate en el aire de Jary Mane. Es un conteo de "razones activas" (no un simple
// booleano) para que dos disparadores automaticos superpuestos no se pisen el uno al otro al
// terminar: cada quien prende/apaga SU PROPIA razon con un id, y solo cuando ya no queda ninguna
// razon activa se apaga AUTO_BULLET_TIME de verdad.
const autoBulletTimeReasons = new Set();
window.RESET_LISTENERS = window.RESET_LISTENERS || [];
window.RESET_LISTENERS.push(function(){
  autoBulletTimeReasons.clear();
  window.AUTO_BULLET_TIME = false;
});

function setAutoBulletTime(reasonId, active){
  if(active) autoBulletTimeReasons.add(reasonId);
  else autoBulletTimeReasons.delete(reasonId);
  window.AUTO_BULLET_TIME = autoBulletTimeReasons.size > 0;
}
window.setAutoBulletTime = setAutoBulletTime;
