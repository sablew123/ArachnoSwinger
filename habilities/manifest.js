// habilities/manifest.js -- declara QUE archivos de habilidades (las que se disparan con
// botones/teclas: telaraña, jalon, tejer, golpes, agarre de pared, sentido aracnido, chill)
// cargar, y que JSON de controles las gobierna. Mismo patron que entities/manifest.js: este es
// el UNICO archivo que hace falta editar para agregar/quitar una habilidad, spiderswing.html no
// se toca. Las rutas son relativas a la carpeta habilities/ (el loader le agrega ese prefijo).
window.ABILITY_MANIFEST = {
  scripts: [
    'webSling.js',   // fireWeb / releaseWeb (click izq/der)
    'webPull.js',    // performWebPull (boton medio, toque, con telaraña tensada)
    'weave.js',      // weaveNet (tejer red, soltar Shift con las dos manos enganchadas)
    'attack.js',     // startAttack (boton medio mantenido + click izq/der)
    'wallClimb.js',  // tryGrabWall / grabWall (doble W contra una fachada)
    'spiderSense.js',// toggleSpiderSense (Ctrl)
    'chill.js'       // toggleChillState (Q)
  ],
  json: ['controls.json']
};
