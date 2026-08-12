// physics/manifest.js declara QUE archivos de fisica (gravedad, movimiento en tierra/aire,
// telarañas, agarre de pared, colisiones, caidas) hay que cargar. Es el UNICO archivo que hace
// falta editar para agregar/quitar/reordenar un modulo de fisica -- nunca el HTML principal ni
// los demas archivos de esta carpeta.
//
// A diferencia de entities/manifest.js y habilities/manifest.js (que solo declaran una lista y
// dejan que el motor las cargue de forma asincronica, cuando le convenga -- ver
// loadAllEntityFiles/loadAllAbilityFiles en el HTML principal), la fisica hace falta desde ANTES
// de que el motor arranque a ejecutarse siquiera: el jugador, el mundo, todo se construye usando
// estas constantes/funciones ya en las primeras lineas del script principal. Por eso, en vez de
// pedir estos archivos con fetch/promesas, este manifest los inyecta con document.write() aca
// mismo en el <head> -- eso hace que el navegador los cargue y ejecute de forma SINCRONICA, en
// el orden de la lista, ANTES de seguir leyendo el resto del HTML. Cuando el motor principal
// arranca a correr, la fisica ya esta 100% cargada y disponible como variables/funciones
// globales -- exactamente como si nunca se hubiera separado del archivo original.
window.PHYSICS_MANIFEST = {
  scripts: [
    'constants.js',   // gravedad, velocidades, tuning de soga/pared/caidas -- sin logica
    'rope.js',         // pulseada de fuerzas: telaraña contra un carro o una entidad enganchada
    'movement.js',     // piso, aire libre, agarre de pared, colisiones, caidas, masa cargable
    'swing.js'         // balanceo con telaraña(s) enganchada(s) a algo rigido
  ]
};

for(const src of window.PHYSICS_MANIFEST.scripts){
  document.write('<script src="physics/' + src + '"></script>');
}
