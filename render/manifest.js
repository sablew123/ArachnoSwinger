// render/manifest.js declara QUE archivos de render (cielo, HUD) cargar -- son sincronicos
// (document.write), asi que ya estan listos ANTES de que arranque el resto de este HTML,
// igual que physics/manifest.js y world/manifest.js. Es el UNICO archivo que hay que editar
// para agregar/quitar un modulo de render, ver ese archivo.
var RENDER_FILES = [
  'sky.js', // fondo del mundo: gradiente de cielo, sol, montañas y nubes, todo atado a la
            // hora real de la maquina (ver getDaylightInfo)
  'player.js', // dibujo del monigote jugador: pose completa (caminando/colgado/escalando/
               // atacando/en el aire), avisos de caida, y el dibujo generico de una soga/telaraña
  'hud.js', // capa de HUD en espacio de pantalla: vignette de sentido aracnido, barra de vida,
            // contador de telaraña restante y pantalla de GAME OVER
];

for (const f of RENDER_FILES) {
  document.write('<script src="render/' + f + '"><\/script>');
}
