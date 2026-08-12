// ============================================================================
//  entities/manifest.js
// ----------------------------------------------------------------------------
//  Este es el UNICO archivo que hace falta editar para agregar civiles,
//  villanos, o cualquier otra entidad al juego. spiderswing.html lo carga
//  solo (via <script src="entities/manifest.js">, ANTES del script principal)
//  y ya sabe leer las dos listas de aca abajo — no hace falta tocar nada mas.
//
//  Por ahora las dos listas estan vacias a proposito: el juego arranca sin
//  ninguna entidad cargada. Agregar rutas aca alcanza para que se carguen
//  solas la proxima vez que abras el juego.
//
//  Rutas: SIEMPRE relativas a este archivo (o sea, relativas a la carpeta
//  entities/). Por ejemplo, un archivo en entities/villanos/duende.js se
//  declara como 'villanos/duende.js', no 'entities/villanos/duende.js'.
//
//  Dos listas, segun el tipo de archivo:
//
//  scripts -> archivos .js que llaman a registerEntityType(id, def) por su
//             cuenta. Usalos para cualquier tipo que necesite logica propia:
//             onUpdate (IA, patrullaje, disparo de proyectiles), draw custom,
//             onDamage/onDeath, etc. — cualquier cosa que sea una funcion no
//             puede ir en JSON, tiene que ser JS.
//             Ejemplo de contenido de un archivo asi (entities/civiles.js):
//               registerEntityType('civil', {
//                 hp: 25, hitRadius: 16, moveType: 'walker', speed: 60,
//                 color: '#4f8fd6', friendly: true,
//                 onUpdate(e, dt){ /* patrullar, etc */ }
//               });
//
//  json    -> archivos .json con uno o mas tipos, SOLO datos (sin funciones).
//             Sirven para tipos simples que no necesitan logica propia.
//             Ejemplo de contenido de un archivo asi (entities/dummies.json):
//               {
//                 "dummy": { "hp": 9999, "hitRadius": 18, "moveType": "static",
//                            "color": "#8a8f99", "invulnerable": true }
//               }
//
//  El orden dentro de cada lista es el orden en que se cargan (por si un
//  archivo depende de que otro ya se haya registrado antes).
// ============================================================================

window.ENTITY_MANIFEST = {
  scripts: [
    // sistemas genericos (no registran ningun tipo de entidad, son solo utilidades) que usa el
    // boss -- van primero para que ya esten listos cuando crazylimemonster.js los necesite:
    'bossengine.js',   // chunk forzado + bullet time automatico (envuelve hooks del motor)
    'radar.js',         // indicador en pantalla generico (replica del que ya usaba jaryman.js)
    'dragsystem.js',    // arrastre por el asfalto: perdida de vida + volcado de buses
    'reelredirect.js',  // mecanismo generico: jalar con click medio y pasar de largo hacia un objetivo (bombas, fases 6/8)
    'crazybomb.js',      // la bomba del boss, usa reelredirect.js -- por eso va justo despues
    'crazysled.js',       // aerodeslizador vacio de la fase 7 (misil teledirigido + huggable de siempre)
    'civiles.js',
    'asaltante.js',           // usa el tipo 'civil' de civiles.js como base, por eso va despues
    'asaltante-armado.js',    // usa el tipo 'asaltante' de asaltante.js como base, por eso va despues
    'jaryman.js',            // Jary Mane (JM): usa el tipo 'civil' de civiles.js como base, por eso va despues
    'crazylimemonster.js',   // boss: se invoca cuando jaryman.js dispara el evento del techo CosCorp
    // 'villanos/duende-verde.js',
  ],
  json: [
    // 'dummies.json',
    // 'villanos/basicos.json',
  ]
};
