// world/interiors.js
// Poder ENTRAR a los edificios. Te parás frente a la puerta de un edificio (dibujada a nivel de
// calle, en el centro de su base -- ver drawBuildingDoors mas abajo), apretás DOOR_KEY y la
// pantalla entera pasa a mostrar el interior: un edificio caminable de VARIOS PISOS, con muebles
// propios en planta baja segun el `kind` del edificio (apartment/office/hospital).
//
// A DIFERENCIA de la version vieja de este archivo, adentro NO hay una caminata simulada aparte
// (ni "walkX" propio, ni animacion prestada): el jugador es LITERALMENTE el mismo `player` de
// siempre, corriendo por el MISMO update() de fisica (gravedad, salto, correr, colisiones -- ver
// physics/movement.js) que usa afuera. Lo unico que cambia estando adentro es CONTRA QUE
// colisiona: en vez de la calle/carros/techos de la ciudad, colisiona con las paredes/techo/
// entrepisos del edificio (ver collideRoom mas abajo, y el enganche en collideWorld de
// physics/movement.js). Eso significa que adentro tambien podes saltar de verdad, correr con
// doble toque, etc. -- literalmente todo lo que el personaje sabe hacer afuera.
//
// PODERES ADENTRO -- que SI y que NO tiene sentido: saltar/correr/rodar funcionan tal cual
// (misma fisica de siempre, sin ningun chequeo especial). El lanzatelarañas y el agarre de pared
// (W+W) TAMBIEN funcionan adentro: la habitacion tiene su propia geometria "agarrable" --
// ib.facade (un rectangulo que cubre TODO el cuarto, ver enterBuilding) hace de fachada generica
// para que findBuildingAt (spiderswing.html) enganche la mira/telaraña en cualquier punto de la
// habitacion, igual que una fachada de verdad afuera; y las paredes LATERALES del cuarto (el
// mismo limite ROOM_WALL_PAD que usa collideRoom para no dejarte caminar mas alla) son trepables
// con W+W via tryGrabIndoorWall, en habilities/wallClimb.js -- un caso aparte del tryGrabWall de
// afuera (que sigue iterando `buildings`, la ciudad real) porque adentro no hay ninguna esquina
// de la que saltar a OTRO edificio ni techo del que hacer la voltereta: al llegar arriba del
// todo (el techo del cuarto) o a cualquier punto intermedio, SPACE simplemente te suelta -- ver
// el chequeo `!c.indoor` en el keydown de SPACE, spiderswing.html.
//
// COMO SE HACE ESTO SIN QUE EL "AFUERA" (chunks, camara, colision real de la ciudad) se
// confunda: al entrar, el jugador se teletransporta a un "bolsillo" de coordenadas de mundo bien
// lejos de cualquier chunk real (ver ROOM_POCKET_X) -- ahi adentro, su x/y de mundo SIGUEN SIENDO
// reales y absolutos (no locales al edificio, no prestados para dibujar): drawRoomWorld
// solo les resta ROOM_POCKET_X (en x) para saber donde caen dentro del recuadro que se dibuja en
// pantalla. Como ese bolsillo esta a millones de px de cualquier chunk generado de verdad:
//   - findBuildingAt/tryGrabWall (agarre de pared) y el enganche de telarañas jamas encuentran
//     nada ahi -- se desactivan solos, sin ningun chequeo especial de "estoy adentro" en esos
//     archivos.
//   - los carros/plataformas/edificios reales de la ciudad jamas colisionan por accidente contra
//     el jugador metido en el bolsillo.
// Lo UNICO que hay que tener cuidado de no dejar "colgado" de la posicion real del jugador es
// updateChunks (¿que chunks cargar alrededor de donde estoy?): mientras estas adentro, se sigue
// pidiendo con la puerta de AFUERA por la que entraste (ib.doorX), no con player.x -- ver el
// update() de spiderswing.html, la unica linea que cambia ahi para esto.
//
// PISOS: el edificio de adentro tiene VARIOS niveles (ib.floors = la cantidad de filas de
// ventanas -- o paneles, en una oficina -- que tiene el edificio de AFUERA en Y, mas uno: ver
// b.windowRows en world/structures/buildings.js y floorsForBuilding aca abajo), apilados uno
// arriba del otro. A diferencia de una version vieja de este sistema, cada entrepiso ahora es
// COMPLETAMENTE solido (tambien "desde abajo": saltar contra el fondo de un piso te frena, no te
// deja colarte) -- la UNICA forma de subir es el ASCENSOR (ib.elevator, ver updateElevator/
// drawElevatorCabin/collideRoom), parandote en la cabina, cerrando la puerta con E, y eligiendo
// piso en el panel de botones que aparece al costado de la pantalla (ver
// ensureElevatorPanel/requestElevatorFloor), o trepando una de las paredes laterales del cuarto
// con W+W (ver habilities/wallClimb.js, tryGrabIndoorWall) -- igual que trepar la fachada de un
// edificio de afuera. Por ahora los pisos de arriba son solo eso -- estructura para subir -- sin
// muebles propios (los muebles de siempre solo estan en planta baja); sumarles su propio set de
// decor el dia de mañana es cuestion de generarlo en
// genInteriorDecor con un floorY distinto por piso, no un cambio de arquitectura.
//
// TAMAÑO: el ancho Y la altura del edificio de adentro salen del edificio de AFUERA (b.w, b.h)
// -- mismo edificio, mismo interior siempre (buildingRng) -- pero mas grande que su fachada real
// (ver ROOM_W_SCALE/floors mas abajo): la idea es que SE SIENTA a la escala de un edificio de
// verdad, no una cajita.
//
// SALIR funciona apretando E parado justo al lado de la puerta de ADENTRO (ib.doorLocalX), en
// el MEDIO de planta baja (ver enterBuilding: doorLocalX = roomW/2, distinto para cada edificio
// segun su ancho) -- te devuelve afuera, exactamente al punto por el que habias entrado --
// simetrico a como funciona la puerta de afuera (ahi tambien hace falta estar cerca, no vale
// desde cualquier lado de la calle). El ascensor (ib.elevator) va pegado a UN COSTADO del
// cuarto en cambio, justamente para no pisarse con la puerta -- ver elevatorLocalX ahi mismo.
//
// El mundo de AFUERA (chunks, autos, entidades) NO se pausa mientras estas adentro: sigue
// actualizandose con total normalidad en update() (ver ahi), independiente de lo que hagas
// dentro del edificio.
//
// COMO SE ENGANCHA CON EL RESTO DEL JUEGO (a proposito, lo minimo posible, casi todo vive aca):
//   1. en update(dt), la linea `updateChunks(player.x);` de siempre pasa a ser
//      `updateChunks(window.insideBuilding ? window.insideBuilding.doorX : player.x);` -- el
//      UNICO lugar donde el resto del motor necesita distinguir "adentro" de "afuera" para no
//      romper la carga de chunks (el resto del pipeline de fisica de ese mismo update() corre
//      SIN ningun otro cambio, adentro o afuera: es la misma colision generica la que decide
//      solita contra que chocar, ver el punto 6). Al final de ese mismo update(), justo antes de
//      la seccion de camara-anclaje-fija vieja (ya no aplica, la camara sigue igual que afuera; drawRoomWorld arma
//      su propio encuadre fijo), un solo `if(window.insideBuilding) return;` corta ahi.
//   2. en render(), DENTRO del mismo ctx.translate(-camera.x,-camera.y) que usa el mundo de
//      afuera: `if(window.insideBuilding) drawRoomWorld(ctx); else { /* edificios/calle/etc */ }`
//      -- YA NO arma su propio encuadre/escala fijo (bx,by,fit): dibuja en coordenadas de MUNDO
//      reales, asi la camara normal (misma que afuera, sigue al jugador igual) lo encuadra solo,
//      y la mira/telaraña (que comparan contra camera.x/y) funcionan sin ningun caso especial.
//   3. en el loop de edificios de render() (mundo de AFUERA): `drawBuildingDoors(ctx);` -- dibuja
//      la puerta de cada edificio, en el MISMO punto exacto que ya usa findNearbyDoor (mas abajo)
//      para decidir si estas lo bastante cerca como para entrar.
//   4. en la seccion de HUD (junto a drawPlayerHpBar()/drawWebAmmoHUD()):
//      `if(window.insideBuilding) drawIndoorHUD(ctx); else drawDoorPrompt(ctx);` -- el rotulo de
//      piso + "E para salir" adentro, o "E para entrar" afuera, cada uno en espacio de pantalla.
//   5. en findBuildingAt (spiderswing.html): si window.insideBuilding esta puesto, chequea contra
//      ib.facade (el rectangulo entero del cuarto) en vez de contra `buildings` -- asi la mira y
//      el enganche de telaraña tienen contra que agarrarse tambien adentro, igual que una fachada
//      de verdad afuera.
//   5. en resetWorld(): `window.insideBuilding = null;` (no te podes quedar "adentro" de un
//      edificio que quizas ni se regenere igual tras un reinicio; resetPlayer ya te manda de
//      vuelta al spawn de siempre despues).
//   6. en physics/movement.js, collideWorld(prevBottom) arranca con
//      `if(window.insideBuilding){ collideRoom(prevBottom); return; }` -- OJO: collideRoom AHORA
//      recibe prevBottom (necesita saber si venias cayendo desde arriba de un entrepiso, para
//      las plataformas de un solo sentido) -- si tu physics/movement.js todavia llama a
//      `collideRoom();` sin el argumento, hay que agregarselo ahi (es el UNICO cambio que ese
//      archivo necesita para todo este sistema).
// El resto (el propio keydown de entrar/salir, toda la logica del edificio, el dibujo) vive TODO
// aca.
//
// DISEÑO A FUTURO (todavia NO implementado): que el edificio no sea siempre UNO solo por
// fachada -- tantas puertas/apartamentos como pisos tenga, cada uno con su propio interior
// aparte. Por eso ya usamos buildingRng() (el rng propio de un edificio puntual, reusado para la
// puerta, la geometria del interior y sus muebles): el dia que haya mas de un interior por
// edificio, el enganche puerta<->edificio no va a necesitar tocarse, solo la cantidad de puertas
// que dibuja drawBuildingDoors (y darle a cada interior su propio offset dentro del bolsillo, en
// vez de compartir siempre ROOM_POCKET_X -- hoy alcanza con uno solo porque nunca hay mas de UN
// interior activo a la vez, es un juego de un jugador).

const DOOR_KEY = 'KeyE';       // tecla para entrar/salir
const DOOR_REACH_X = 46;       // que tan cerca (en X) del centro de la fachada hay que estar para poder entrar
const DOOR_REACH_Y = 12;       // margen vertical: solo cuenta si estas mas o menos parado a nivel de calle
const DOOR_W = 40, DOOR_H = 56; // tamaño visual de la puerta dibujada en la fachada (ver drawBuildingDoors)

// rng propio de UN edificio en particular (determinista a partir de su X, que a su vez ya sale
// de rng(chunkIndex) al generarse, y de la seed global) -- se usa para el estilo de la puerta
// (drawBuildingDoors), la geometria del interior entero (ancho, cantidad de pisos, huecos de
// escalera -- ver enterBuilding) y los muebles de planta baja: mismo edificio, mismo interior,
// siempre.
function buildingRng(b){
  const h = (Math.imul(Math.floor(b.x) + 0x27D4EB2F, 2654435761) ^ WORLD_SEED) >>> 0;
  return mulberry32(h);
}

// paletas de puerta por kind -- nomas para que de lejos ya se note que tipo de edificio es antes
// de llegar (apartamento: madera de algun tono calido; oficina: vidrio oscuro a tono con su
// propio glassColor si lo tiene; hospital: blanco con el mismo acento rojo que su cruz)
const DOOR_WOOD_COLORS = ['#6b4a30', '#7a4632', '#5c3b25', '#8a5a35'];

function doorStyleFor(b){
  const rng = buildingRng(b);
  if(b.kind === 'hospital'){
    return {frame: '#c9c3b2', panel: '#eef6fb', accent: '#E23B3B', glass: true};
  }
  if(b.kind === 'office'){
    return {frame: '#20242c', panel: b.glassColor || '#6FB8DE', accent: '#20242c', glass: true};
  }
  return {frame: '#2b1c10', panel: DOOR_WOOD_COLORS[Math.floor(rng()*DOOR_WOOD_COLORS.length)], accent: '#e8c468', glass: false};
}

// dibuja la puerta de CADA edificio cargado, siempre en el mismo punto que findNearbyDoor usa
// para el chequeo de cercania (centro de la base, a nivel de calle) -- se llama desde el loop de
// edificios de render() en spiderswing.html, en coordenadas de MUNDO (ya adentro del
// ctx.translate(-camera.x,-camera.y) de esa seccion)
function drawBuildingDoors(ctx){
  for(const b of buildings){
    const style = doorStyleFor(b);
    const dx = b.x + b.w/2 - DOOR_W/2, dy = STREET_Y - DOOR_H;
    ctx.save();
    // marco
    ctx.fillStyle = style.frame;
    ctx.fillRect(dx-4, dy-4, DOOR_W+8, DOOR_H+4);
    // hoja de la puerta
    ctx.fillStyle = style.panel;
    ctx.fillRect(dx, dy, DOOR_W, DOOR_H);
    if(style.glass){
      // puerta vidriada (oficina/hospital): dos paneles separados por un parante fino
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx+DOOR_W/2, dy+4); ctx.lineTo(dx+DOOR_W/2, dy+DOOR_H-4); ctx.stroke();
    } else {
      // puerta de madera: un par de tablones sutiles + picaporte dorado
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dx+DOOR_W*0.33, dy+3); ctx.lineTo(dx+DOOR_W*0.33, dy+DOOR_H-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx+DOOR_W*0.66, dy+3); ctx.lineTo(dx+DOOR_W*0.66, dy+DOOR_H-3); ctx.stroke();
    }
    // picaporte
    ctx.fillStyle = style.accent;
    ctx.beginPath(); ctx.arc(dx+DOOR_W-9, dy+DOOR_H*0.55, 2.6, 0, Math.PI*2); ctx.fill();
    // umbral (un escaloncito angosto pegado al piso, para que no parezca flotando)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(dx-6, STREET_Y, DOOR_W+12, 4);
    ctx.restore();
  }
}

// estado actual: null si estamos afuera, o el objeto entero devuelto por enterBuilding (edificio,
// puerta de AFUERA para volver, geometria y decor del interior generados una sola vez al entrar).
window.insideBuilding = null;

// ---- geometria logica del interior (en las mismas unidades que el resto del mundo -- por eso
// el personaje real se ve del mismo tamaño de siempre al entrar, nada reescalado aparte) ----
const ROOM_WALL_PAD = 40;         // margen caminable desde cada pared (deja lugar para el ancho del propio personaje) -- ESTE es tambien el limite exacto que ahora se puede trepar con W+W (ver habilities/wallClimb.js, tryGrabIndoorWall) y el que se marca visualmente (ver drawRoomWorld) para que no se sienta como una pared invisible
const ROOM_FLOOR_STRIP = 16;      // alto del zocalo/piso dibujado en planta baja
const ROOM_TOP_PAD = 26;          // aire libre arriba del ultimo piso, antes del techo
const FLOOR_H = 190;              // alto de CADA piso (salto vertical entre uno y el siguiente): calibrado para que se pueda subir de un salto normal, sin ayuda de telaraña
const ELEVATOR_W = 70;            // ancho de la cabina/hueco del ascensor -- unico hueco real que
                                   // tienen los entrepisos (ver collideRoom): todo el resto de cada
                                   // piso es 100% solido, tambien desde abajo (no se puede saltar
                                   // a traves como antes con el hueco de escalera)
const ELEVATOR_TRAVEL_TIME_PER_FLOOR = 0.85; // segundos por CADA piso de distancia -- un viaje de varios pisos de una (ver requestElevatorFloor) tarda proporcionalmente mas, no siempre lo mismo
const ELEVATOR_CABIN_H = 90;       // alto visual (y de colision: ver el techo propio de la cabina en collideRoom) de la cabina
const ELEVATOR_DOOR_REACH_X = 34;  // que tan cerca (en X) de la puertita del ascensor hay que estar para poder abrirla/cerrarla con E

// ancho minimo/maximo del interior, y cuanto mas grande es que la fachada real del edificio de
// afuera (b.w) -- la idea es que el interior SE SIENTA a la escala del edificio, pero holgado,
// nunca una cajita apretada como antes.
const ROOM_W_SCALE = 2.4;
const ROOM_W_MIN = 760, ROOM_W_MAX = 1400;

// cuantos pisos le tocan a un edificio: EXACTAMENTE la cantidad de filas de ventanas (o paneles,
// en una oficina) que tiene en Y, mas uno -- b.windowRows lo calcula y lo guarda
// world/structures/buildings.js al generar el edificio (mismo numero que ves afuera, contando
// las filas de ventanas de la fachada). Ya no hay ningun tiro de dado de por medio: mismo
// edificio, siempre la misma cantidad de pisos, deducible con solo mirar la fachada desde
// afuera. `rng` se deja como parametro (no se usa) para no tener que tocar el unico lugar que
// llama a esta funcion en enterBuilding.
function floorsForBuilding(b, rng){
  void rng;
  const rows = b.windowRows || 1;
  return Math.max(1, rows + 1);
}

// "bolsillo" de coordenadas de mundo, bien lejos de cualquier chunk real (los chunks reales
// viven siempre cerca de x=0..unos pocos cientos de miles como mucho, segun cuanto camines): al
// teletransportar al jugador aca adentro, su x/y de mundo siguen siendo reales, pero tan lejos de
// la ciudad de verdad que ningun chunk/edificio/carro real puede llegar a colisionar por
// accidente, y tryGrabWall/el enganche de telarañas jamas encuentran nada para agarrar -- se
// desactivan solos, sin que este archivo (ni ningun otro) tenga que acordarse de apagarlos a
// mano. Como en este juego nunca hay mas de UN interior activo a la vez (un solo jugador), alcanza
// con un unico bolsillo fijo, reusado cada vez que se entra a un edificio.
const ROOM_POCKET_X = -8_000_000;

// muebles de PLANTA BAJA -- cada uno es {type, x, floorY} con x en coordenadas locales del
// interior. Se arma UNA vez por edificio (al entrar, ver enterBuilding) con buildingRng(b), asi
// el mismo edificio siempre tiene los mismos muebles en el mismo lugar. floorY ya viene resuelto
// (el piso en el que va cada mueble) para que drawDecorItem no tenga que adivinar nada -- hoy
// todo vive en planta baja (groundY), pero el campo ya deja la puerta abierta a decorar pisos de
// arriba el dia de mañana sin cambiar la firma de nada.
function genInteriorDecor(kind, rng, roomW, groundY, doorLocalX, elevatorLocalX, elevatorW){
  // reparte los muebles evitando DOS zonas prohibidas: la puerta (en el medio del cuarto, ver
  // doorLocalX en enterBuilding) y el hueco del ascensor (a un costado, ver elevatorLocalX) --
  // antes solo se evitaba la puerta, asi que un mueble podia terminar superpuesto con el
  // ascensor (bug reportado). Se arma la lista de tramos LIBRES del piso (todo el ancho
  // caminable, menos esas dos bandas) y se reparten 5 posiciones entre esos tramos, en
  // proporcion a lo ancho que sea cada uno.
  const innerPad = ROOM_WALL_PAD + 16;
  const doorClear = 90;   // aire libre a cada lado de la puerta, sin muebles
  const elevClear = 26;   // aire libre a cada lado del ascensor, sin muebles

  const forbidden = [
    {x0: doorLocalX - doorClear, x1: doorLocalX + doorClear},
    {x0: elevatorLocalX - elevClear, x1: elevatorLocalX + elevatorW + elevClear}
  ].sort((a,b) => a.x0 - b.x0);

  let segments = [{x0: innerPad, x1: roomW - innerPad}];
  for(const band of forbidden){
    const next = [];
    for(const seg of segments){
      if(band.x1 <= seg.x0 || band.x0 >= seg.x1){ next.push(seg); continue; } // no se solapan, tal cual
      if(band.x0 > seg.x0) next.push({x0: seg.x0, x1: Math.min(seg.x1, band.x0)}); // lo que queda antes de la banda
      if(band.x1 < seg.x1) next.push({x0: Math.max(seg.x0, band.x1), x1: seg.x1}); // lo que queda despues
    }
    segments = next.filter(s => s.x1 - s.x0 > 36); // tramos demasiado angostos no sirven para nada, se descartan
  }
  if(!segments.length) segments = [{x0: innerPad, x1: roomW - innerPad}]; // resguardo (no deberia pasar con los tamaños de cuarto actuales)

  // 5 posiciones repartidas entre los tramos libres, cada una en un lugar distinto DENTRO de su
  // tramo (no todas apiladas en el centro) -- el tramo que le toca a cada una se elige al azar,
  // pesado por lo ancho que sea (un tramo el doble de ancho tiene el doble de chances)
  const totalW = segments.reduce((s,seg) => s + (seg.x1-seg.x0), 0);
  const fracsWithinSeg = [0.5, 0.25, 0.75, 0.35, 0.65];
  const slots = [];
  for(let i=0; i<5; i++){
    let r = rng()*totalW, seg = segments[segments.length-1], acc = 0;
    for(const s of segments){ acc += (s.x1-s.x0); if(r <= acc){ seg = s; break; } }
    const f = fracsWithinSeg[i % fracsWithinSeg.length];
    slots.push(seg.x0 + f*(seg.x1-seg.x0) + (rng()-0.5)*10);
  }

  const decor = [];
  if(kind === 'hospital'){
    decor.push({type:'hospitalBed', x: slots[0], floorY: groundY});
    decor.push({type:'ivStand',     x: slots[1], floorY: groundY});
    decor.push({type:'monitor',     x: slots[2], floorY: groundY});
    decor.push({type:'curtain',     x: slots[3], floorY: groundY});
    if(rng() < 0.6) decor.push({type:'cabinet', x: slots[4], floorY: groundY});
  } else if(kind === 'office'){
    decor.push({type:'desk',    x: slots[1], floorY: groundY});
    decor.push({type:'chair',   x: slots[1]+22, floorY: groundY});
    decor.push({type:'cabinet', x: slots[3], floorY: groundY});
    decor.push({type:'plant',   x: slots[4], floorY: groundY});
    if(rng() < 0.7) decor.push({type:'window', x: slots[0], floorY: groundY});
  } else {
    decor.push({type:'bed',   x: slots[0], floorY: groundY});
    decor.push({type:'rug',   x: slots[2], floorY: groundY});
    decor.push({type:'lamp',  x: slots[1], floorY: groundY});
    decor.push({type:'shelf', x: slots[3], floorY: groundY});
    if(rng() < 0.7) decor.push({type:'window', x: slots[4], floorY: groundY});
  }
  return decor;
}

// busca, entre TODOS los edificios cargados, uno cuya puerta (el centro de su base) este lo
// bastante cerca del jugador como para entrar. Cualquier kind sirve por igual (apartamento,
// oficina, hospital) -- alcanza con estar cerca y mas o menos parado en el piso
function findNearbyDoor(px, py){
  for(const b of buildings){
    const doorX = b.x + b.w/2, doorY = STREET_Y;
    if(Math.abs(px - doorX) <= DOOR_REACH_X && Math.abs(py + PLAYER_SIZE/2 - doorY) <= DOOR_REACH_Y){
      return b;
    }
  }
  return null;
}

// la puerta de ADENTRO ya NO tiene una posicion local fija (antes pegada a la pared izquierda,
// DOOR_LOCAL_X = ROOM_WALL_PAD): ahora va en el MEDIO de cada cuarto (roomW/2), calculado por
// enterBuilding para cada edificio segun su propio ancho (ib.doorLocalX) -- el ascensor, en
// cambio, se corrio a un COSTADO (ver elevatorLocalX en enterBuilding), asi entrada/salida y
// ascensor no se pisan entre si.
const DOOR_REACH_X_INDOOR = 42; // que tan ancho el margen para poder salir con E: no hace falta ser quirurgico

// true si el jugador esta parado (en planta baja) lo bastante cerca de la puerta de adentro como
// para poder salir con E -- tiene que estar EN planta baja, no en cualquier piso de arriba
function isNearIndoorDoor(){
  const ib = window.insideBuilding;
  if(!ib) return false;
  return player.grounded && player.y >= ib.groundY - PLAYER_SIZE
    && Math.abs(player.x - (ib.roomX0 + ib.doorLocalX)) <= DOOR_REACH_X_INDOOR;
}

// entra: el jugador de VERDAD se teletransporta al bolsillo del interior (ver ROOM_POCKET_X
// arriba) -- a partir de aca, su x/y son coordenadas de mundo reales y absolutas, simplemente
// aisladas de la ciudad. Toda la geometria del edificio (ancho, cantidad de pisos, ascensor) se
// calcula ACA, una sola vez, y se guarda en window.insideBuilding -- asi collideRoom/drawRoomWorld
// no tienen que recalcular nada frame a frame, solo leerlo.
function enterBuilding(b){
  const rng = buildingRng(b);

  const roomW = Math.max(ROOM_W_MIN, Math.min(ROOM_W_MAX, b.w * ROOM_W_SCALE + (rng()-0.5)*60));
  const floors = floorsForBuilding(b, rng);
  const groundY = floors * FLOOR_H; // "STREET_Y" local: sobra lugar arriba para todos los pisos + ROOM_TOP_PAD
  const roomH = groundY + ROOM_FLOOR_STRIP;

  // la puerta va en el MEDIO de planta baja -- ya no es una constante fija, se recalcula para
  // cada edificio segun su propio roomW (ver DOOR_REACH_X_INDOOR/isNearIndoorDoor mas arriba)
  const doorLocalX = Math.round(roomW/2);

  // el ascensor: UN unico hueco fijo (mismo lugar en todos los pisos) por el que se puede subir/
  // bajar -- pegado a un COSTADO del cuarto (no en el medio, para no pisarse con la puerta de
  // entrada/salida que ahora va centrada, ver doorLocalX arriba). Alterna de que lado le toca
  // segun el propio edificio (buildingRng, siempre el mismo lado para el mismo edificio) para que
  // no todos los interiores se vean identicos. A diferencia del viejo sistema de huecos de
  // escalera (uno por piso, alternando de lado, por los que se pasaba de largo saltando), ahora
  // los entrepisos son completamente solidos salvo esta franja: ya no se puede "colarse" de un
  // piso a otro saltando, hace falta pararse en la cabina y usarla (ver updateElevator) o trepar
  // una de las paredes laterales (ver habilities/wallClimb.js, tryGrabIndoorWall)
  const elevatorMargin = ROOM_WALL_PAD + 46; // separacion respecto a la pared (deja lugar para caminar entre la pared y el hueco)
  const elevatorOnRight = rng() < 0.5;
  const elevatorLocalX = elevatorOnRight
    ? roomW - elevatorMargin - ELEVATOR_W
    : elevatorMargin;
  // la puertita del ascensor va del lado que mira HACIA el centro del cuarto (donde esta la
  // puerta principal) -- asi el camino natural desde la entrada hasta el ascensor tiene sentido.
  // El otro lado (contra el margen de la pared) es SIEMPRE solido, sin puerta.
  const elevatorDoorSide = elevatorOnRight ? 'left' : 'right';

  window.insideBuilding = {
    building: b,
    doorX: b.x + b.w/2,   // puerta de AFUERA (para volver, y para que updateChunks siga anclado ahi mientras estas adentro)
    doorY: STREET_Y,
    kind: b.kind || 'apartment',
    roomX0: ROOM_POCKET_X,
    doorLocalX,
    roomW, roomH, floors, groundY,
    decor: genInteriorDecor(b.kind || 'apartment', rng, roomW, groundY, doorLocalX, elevatorLocalX, ELEVATOR_W),
    // "fachada" interior: todo el fondo/paredes del cuarto cuenta como pared enganchable, igual
    // que la fachada de un edificio de afuera -- ver findBuildingAt en spiderswing.html, que
    // cuando window.insideBuilding esta puesto chequea contra ESTO en vez de contra `buildings`.
    // Sin esto la mira nunca prendia adentro (nada en `buildings` esta cerca del bolsillo de
    // coordenadas) y la telaraña no tenia de donde agarrarse.
    facade: { x: ROOM_POCKET_X, y: 0, w: roomW, h: roomH },
    // cabina del ascensor -- ver updateElevator/drawElevatorCabin/collideRoom mas abajo. Ahora
    // es un cubiculo CERRADO de punta a punta del edificio (piso a techo), no un simple hueco
    // abierto: floorIndex/y/moving/fromY/toY/t/travelDuration es el viaje entre pisos; doorSide
    // dice de que lado esta la puertita; onRight si el ascensor en si esta pegado al lado
    // derecho del cuarto (lo usa el panel de botones, ver ensureElevatorPanel, para saber de que
    // lado de la PANTALLA mostrarse); doorOpen si esta abierta ahora mismo (arranca abierta,
    // parado en planta baja) -- solo con doorOpen===false se puede pedir un piso en el panel (ver
    // requestElevatorFloor), y solo con doorOpen===true se puede cruzar caminando (ver collideRoom)
    elevator: {
      localX: elevatorLocalX, w: ELEVATOR_W,
      floorIndex: 0, y: groundY,
      moving: false, fromY: groundY, toY: groundY, t: 0, travelDuration: ELEVATOR_TRAVEL_TIME_PER_FLOOR,
      doorSide: elevatorDoorSide, onRight: elevatorOnRight, doorOpen: true
    }
  };

  player.x = ROOM_POCKET_X + doorLocalX; // arranca parado justo en la puerta de adentro, en el medio del cuarto
  player.y = groundY - PLAYER_SIZE/2;
  player.insideElevatorShaft = false; // arranca afuera del hueco del ascensor, ver collideRoom
  player.vx = 0; player.vy = 0;
  player.grounded = true;
  player.standingOnCar = null;
  player.standingOnElevator = null;
  player.clinging = null;
  player.vaulting = null;
  player.rolling = false; player.rollTimer = 0;
  player.running = false;

  // ninguna telaraña tiene sentido en un edificio cerrado sin nada rigido de donde engancharla
  webs.left = null; webs.right = null;
}

// salir: te devuelve justo a la puerta de AFUERA por la que habias entrado, parado en el piso,
// quieto -- mismos resets de estado que al entrar, por la misma razon (nada de eso tiene sentido
// arrastrarlo de un lado al otro de la teletransportacion)
function exitBuilding(){
  if(!window.insideBuilding) return;
  const {doorX, doorY} = window.insideBuilding;
  window.insideBuilding = null;
  hideElevatorPanel(); // funcion declarada mas abajo en este archivo, pero hoisted -- se puede llamar desde aca sin problema

  player.x = doorX;
  player.y = doorY - PLAYER_SIZE/2;
  player.vx = 0; player.vy = 0;
  player.grounded = true;
  player.standingOnCar = null;
  player.standingOnElevator = null;
  player.insideElevatorShaft = false;
  player.clinging = null;
  player.vaulting = null;
  player.rolling = false; player.rollTimer = 0;
}

// colision del jugador contra el interior (paredes, techo, planta baja, entrepisos) -- se llama
// desde collideWorld en physics/movement.js cuando window.insideBuilding esta puesto, EN VEZ de
// la colision normal contra calle/carros/techos/balcones/redes de la ciudad. IMPORTANTE:
// necesita prevBottom (el mismo que ya recibe collideWorld) para saber si el jugador venia
// cayendo desde arriba de un entrepiso -- sin eso no se puede distinguir "cayendo, aterriza" de
// "saltando desde abajo, atraviesa", que es como funcionan tambien los techos/balcones de afuera.
// colision del jugador contra el interior (paredes, techo, planta baja, entrepisos, ascensor) --
// se llama desde collideWorld en physics/movement.js cuando window.insideBuilding esta puesto,
// EN VEZ de la colision normal contra calle/carros/techos/balcones/redes de la ciudad.
// IMPORTANTE: necesita prevBottom (el mismo que ya recibe collideWorld) para saber si el jugador
// venia cayendo desde arriba de un entrepiso -- sin eso no se puede distinguir "cayendo, aterriza"
// de "saltando desde abajo, atraviesa".
//
// A diferencia de la version vieja (con un hueco de escalera por piso, por el que se pasaba de
// largo saltando), los entrepisos ahora son COMPLETAMENTE solidos -- tambien "desde abajo": si
// saltas contra el fondo de un piso te frena en seco, en vez de dejarte pasar. El UNICO hueco es
// el CUBICULO del ascensor (ib.elevator): un corredor CERRADO de punta a punta del edificio
// (piso a techo, paredes solidas en las dos direcciones), separado del resto del cuarto -- la
// unica forma de cruzar es por la puertita del lado que mira al cuarto (el.doorSide), y SOLO
// mientras este abierta y a la altura exacta donde este parada la cabina en este instante (ver
// isNearElevatorDoor/toggleElevatorDoor). Con la puerta cerrada, o en cualquier otro punto de la
// pared del hueco, es una pared solida mas -- ni entra ni sale nada, ni siquiera un mueble (ver
// genInteriorDecor, que ya evita esta franja al generar la decoracion). Subir sin el ascensor
// solo es posible trepando una de las paredes laterales del CUARTO con W+W (ver
// habilities/wallClimb.js, tryGrabIndoorWall) -- esas son un sistema aparte, no tienen nada que
// ver con las paredes del cubiculo del ascensor.
function collideRoom(prevBottom){
  const ib = window.insideBuilding;
  const half = PLAYER_SIZE/2;
  const el = ib.elevator;
  if(player.insideElevatorShaft === undefined) player.insideElevatorShaft = false;

  // paredes laterales del CUARTO -- todo el alto del edificio, no solo planta baja. Este es el
  // MISMO limite que se puede trepar (ver tryGrabIndoorWall) y que se marca visualmente en
  // drawRoomWorld, para que no se sienta como una pared invisible.
  const minX = ib.roomX0 + ROOM_WALL_PAD + half;
  const maxX = ib.roomX0 + ib.roomW - ROOM_WALL_PAD - half;
  if(player.x < minX){ player.x = minX; if(player.vx < 0) player.vx = 0; }
  if(player.x > maxX){ player.x = maxX; if(player.vx > 0) player.vx = 0; }

  // paredes del CUBICULO del ascensor -- usamos player.insideElevatorShaft (estado que PERSISTE
  // entre frames, a diferencia de standingOnElevator/standingOnCar que se recalculan cada uno)
  // para saber de que lado veniamos, y asi decidir si las paredes tienen que CONTENERLO (ya esta
  // adentro, que no se escape salvo por la puerta abierta) o EXCLUIRLO (esta afuera, en el
  // cuarto, que no entre salvo por la puerta abierta). Lo que decide en los dos casos es si en
  // este instante esta cruzando por la puerta, abierta, a la altura de la cabina.
  const shaftLeftX  = ib.roomX0 + el.localX;
  const shaftRightX = ib.roomX0 + el.localX + el.w;
  const doorWallX = el.doorSide === 'left' ? shaftLeftX : shaftRightX;
  const doorPassableNow = el.doorOpen && !el.moving
    && player.y >= el.y - ELEVATOR_CABIN_H - half && player.y <= el.y + half;

  if(player.insideElevatorShaft){
    const inMinX = shaftLeftX + half, inMaxX = shaftRightX - half;
    if(player.x < inMinX){
      if(doorPassableNow && doorWallX === shaftLeftX) player.insideElevatorShaft = false; // salio por la puerta
      else { player.x = inMinX; if(player.vx < 0) player.vx = 0; }
    } else if(player.x > inMaxX){
      if(doorPassableNow && doorWallX === shaftRightX) player.insideElevatorShaft = false; // salio por la puerta
      else { player.x = inMaxX; if(player.vx > 0) player.vx = 0; }
    }
  } else {
    const outMinX = shaftLeftX - half, outMaxX = shaftRightX + half;
    if(player.x > outMinX && player.x < outMaxX){
      if(doorPassableNow){
        player.insideElevatorShaft = true; // cruzo por la puerta: ahora esta "adentro"
      } else {
        // se metio en la banda sin poder cruzar (no deberia pasar con las paredes solidas de
        // arriba resolviendo esto cuadro a cuadro, pero por las dudas -- empuja al borde mas cercano)
        const distLeft = player.x - outMinX, distRight = outMaxX - player.x;
        if(distLeft <= distRight){ player.x = outMinX; if(player.vx > 0) player.vx = 0; }
        else { player.x = outMaxX; if(player.vx < 0) player.vx = 0; }
      }
    }
  }

  // techo -- arriba del ultimo piso, con un poco de aire (ROOM_TOP_PAD). Solido desde abajo (te
  // frena si saltas contra el) igual que cualquier entrepiso de mas abajo ahora.
  const ceilingY = (ib.groundY - ib.floors*FLOOR_H) + ROOM_TOP_PAD + half;
  if(player.y < ceilingY){ player.y = ceilingY; if(player.vy < 0) player.vy = 0; }

  // techo de la PROPIA cabina -- un ascensor de verdad tiene techo: sin esto, adentro del
  // cubiculo (que solo tiene paredes laterales, nada por arriba salvo el techo del edificio
  // entero, mucho mas lejos) un salto te mandaba volando piso tras piso hasta el techo real.
  if(player.insideElevatorShaft){
    const cabRoofY = el.y - ELEVATOR_CABIN_H + half;
    if(player.y < cabRoofY){ player.y = cabRoofY; if(player.vy < 0) player.vy = 0; }
  }

  player.grounded = false;
  player.standingOnCar = null;
  player.standingOnElevator = null;

  // adentro del cubiculo: el UNICO "piso" es la superficie de la cabina (el.y), y es solida en
  // los DOS sentidos -- aterrizas cayendo desde arriba, Y te frena si saltas contra el fondo
  // desde abajo (pedido: "que el ascensor sea solido por debajo tambien")
  if(player.insideElevatorShaft){
    if(player.vy >= 0 && prevBottom <= el.y + 2 && player.y + half >= el.y){
      player.y = el.y - half;
      player.vy = 0;
      player.grounded = true;
      player.standingOnElevator = el;
      return;
    }
    const prevTopIn = prevBottom - PLAYER_SIZE;
    if(player.vy < 0 && prevTopIn >= el.y - 2 && player.y - half <= el.y){
      player.y = el.y + half;
      player.vy = 0;
      return;
    }
    // ni aterrizando ni pegandose contra el fondo de la cabina: nada mas contra que chocar aca
    // adentro -- sigue en el aire (la planta baja de mas abajo, incondicional, es el piso de
    // emergencia si por lo que sea sigue cayendo)
  }

  // planta baja: siempre solida, como la calle de afuera (tambien adentro del cubiculo: si la
  // cabina no esta ahi para atajarte, la planta baja del edificio sigue estando debajo de todo)
  if(player.y + half >= ib.groundY){
    player.y = ib.groundY - half;
    player.vy = 0;
    player.grounded = true;
    return;
  }

  if(player.insideElevatorShaft) return; // adentro del cubiculo no hay entrepisos: solo la cabina (ya chequeada arriba) y la planta baja

  // entrepisos: completamente solidos (aterrizas cayendo desde arriba, Y te frenan si saltas
  // contra el fondo desde abajo) -- la franja del ascensor nunca llega hasta aca (quien esta
  // adentro del cubiculo ya cortó unas lineas arriba)
  for(let f=1; f<ib.floors; f++){
    const floorTop = ib.groundY - f*FLOOR_H;      // superficie de arriba del entrepiso (donde se para el jugador)
    const floorBottom = floorTop + ROOM_FLOOR_STRIP; // grosor solido del entrepiso (mismo alto que se dibuja, ver drawFloorSlabWorld)

    // aterrizar desde arriba, cayendo (como antes)
    if(player.vy >= 0 && prevBottom <= floorTop + 2 && player.y + half >= floorTop){
      player.y = floorTop - half;
      player.vy = 0;
      player.grounded = true;
      return;
    }

    // pegarse contra el FONDO del piso, saltando desde abajo: solido tambien en este sentido
    const prevTop = prevBottom - PLAYER_SIZE;
    if(player.vy < 0 && prevTop >= floorBottom - 2 && player.y - half <= floorBottom){
      player.y = floorBottom + half;
      player.vy = 0;
      return;
    }
  }
}

// true si el jugador esta lo bastante cerca de la puertita del ascensor (adentro o afuera de la
// cabina, da igual de que lado) como para poder abrirla/cerrarla con E -- la posicion de la
// puerta se recalcula cada vez que se llama (sigue a la cabina, ver el.doorSide/el.y), asi que
// siempre esta pegada a donde este parada la cabina EN ESTE INSTANTE. No cuenta mientras esta en
// pleno viaje: hay que esperar a que llegue a un piso para poder tocarla.
function isNearElevatorDoor(){
  const ib = window.insideBuilding;
  if(!ib) return false;
  const el = ib.elevator;
  if(el.moving) return false;
  const doorX = ib.roomX0 + (el.doorSide === 'left' ? el.localX : el.localX + el.w);
  const withinX = Math.abs(player.x - doorX) <= ELEVATOR_DOOR_REACH_X;
  const withinY = player.y >= el.y - ELEVATOR_CABIN_H - 10 && player.y <= el.y + 10;
  return withinX && withinY;
}

// abre/cierra la puertita -- llamada desde el keydown de DOOR_KEY (la misma tecla E que entra/
// sale del edificio), mas abajo en este archivo. No hace nada si esta en pleno viaje (no tiene
// sentido tocar la puerta mientras el ascensor se mueve entre pisos)
function toggleElevatorDoor(){
  const el = window.insideBuilding.elevator;
  if(el.moving) return;
  el.doorOpen = !el.doorOpen;
}

// avanza el ascensor: si esta en pleno viaje, interpola su Y hacia el piso destino (y arrastra
// al jugador con el, si sigue parado en la cabina). El PEDIDO de piso (con la puerta cerrada) ya
// no es con W/S: es con el panel de botones clasico que aparece al costado de la pantalla (ver
// requestElevatorFloor/ensureElevatorPanel mas abajo) -- por eso aca no hay que escuchar ningun
// input, solo animar el viaje si ya esta en curso, y mantener sincronizado ese panel (mostrarlo/
// ocultarlo, resaltar el piso actual, deshabilitarlo en pleno viaje). Se llama una vez por frame,
// TEMPRANO en update() (antes de la fisica del jugador de este frame, mismo lugar donde se
// mueven los carros) para que collideRoom ya vea la posicion actualizada de la cabina en este
// mismo frame -- ver spiderswing.html.
function updateElevator(dt){
  const ib = window.insideBuilding;
  if(!ib) return;
  const el = ib.elevator;

  if(el.moving){
    el.t += dt / (el.travelDuration || ELEVATOR_TRAVEL_TIME_PER_FLOOR);
    const tt = Math.min(1, el.t);
    const ease = tt*tt*(3 - 2*tt); // smoothstep: arranca y frena suave, no de golpe
    el.y = el.fromY + (el.toY - el.fromY)*ease;
    if(player.standingOnElevator === el){
      player.y = el.y - PLAYER_SIZE/2;
      player.vy = 0;
      player.grounded = true;
    }
    if(tt >= 1){ el.moving = false; el.y = el.toY; el.t = 0; }
  }

  syncElevatorPanel();
}

// pide que el ascensor viaje a un piso puntual -- llamada por los clicks del panel de botones
// (ver ensureElevatorPanel). Solo tiene efecto con la puerta cerrada, quieta, y el jugador
// parado adentro (mismas condiciones que antes exigia el control por W/S): pedir un piso desde
// afuera de la cabina, o con la puerta abierta, o en pleno viaje, no hace nada -- el panel mismo
// ya deshabilita los botones en esos casos (ver syncElevatorPanel), esto es el resguardo real.
// A diferencia del viejo control piso-a-piso, ahora se puede pedir CUALQUIER piso de una: la
// duracion del viaje escala con la distancia (ELEVATOR_TRAVEL_TIME_PER_FLOOR por cada piso que
// tenga que recorrer), asi un viaje largo se siente mas largo, no instantaneo.
function requestElevatorFloor(targetFloorIndex){
  const ib = window.insideBuilding;
  if(!ib) return;
  const el = ib.elevator;
  if(el.moving || el.doorOpen) return;
  if(player.standingOnElevator !== el || controlState !== 'normal') return;
  if(targetFloorIndex < 0 || targetFloorIndex >= ib.floors || targetFloorIndex === el.floorIndex) return;

  const floorsTraveled = Math.abs(targetFloorIndex - el.floorIndex);
  el.floorIndex = targetFloorIndex;
  el.moving = true;
  el.t = 0;
  el.fromY = el.y;
  el.toY = ib.groundY - targetFloorIndex*FLOOR_H;
  el.travelDuration = ELEVATOR_TRAVEL_TIME_PER_FLOOR * floorsTraveled;
}

// ---- panel de botones del ascensor (HTML, no canvas) ----
// una tabla de botones clasica de ascensor, clavada al costado de la pantalla -- del MISMO lado
// en el que esta el ascensor respecto al medio del edificio (ib.elevator.onRight), para que caiga
// en la zona de la camara que normalmente queda mas vacia (el margen entre la cabina y la pared
// exterior, no el centro del cuarto donde pasa la accion). Solo se muestra mientras estas
// ADENTRO del cubiculo con la puerta CERRADA (el mismo momento en el que un ascensor de verdad
// te deja elegir piso) -- afuera, con la puerta abierta, o fuera de un edificio, esta oculto.
//
// Se construye UNA sola vez por "forma" de panel (misma cantidad de pisos + mismo lado) y se
// reusa/reposiciona despues -- entrar y salir del mismo edificio no lo reconstruye de nuevo. Es
// un <div> real con <button> reales (mismo patron que ya usa civiles.js para su cartelito de
// muertes): asi el click nativo del navegador se encarga solo del hover/foco/accesibilidad, sin
// tener que inventar deteccion de click a mano sobre el canvas ni pelearse con el sistema de
// mira/telaraña del juego (que ya usa mousedown para otra cosa).
let elevatorPanelEl = null;
let elevatorPanelButtons = [];
let elevatorPanelSignature = null; // "pisos:lado" -- si cambia, se reconstruye el panel entero
let elevatorPanelSafetyNetRegistered = false;

function ensureElevatorPanel(floors, onRight){
  const signature = floors + ':' + (onRight ? 'r' : 'l');
  if(elevatorPanelEl && elevatorPanelSignature === signature) return elevatorPanelEl;

  if(elevatorPanelEl && elevatorPanelEl.parentNode) elevatorPanelEl.parentNode.removeChild(elevatorPanelEl);

  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'top:50%', 'transform:translateY(-50%)',
    onRight ? 'right:18px' : 'left:18px',
    'display:flex', 'flex-direction:column-reverse', `flex-wrap:${onRight ? 'wrap-reverse' : 'wrap'}`, 'gap:4px',
    // column-reverse: planta baja abajo, los pisos de arriba mas arriba -- como un panel real.
    // max-height + flex-wrap: si los botones no entran en una sola columna (edificios con
    // muchos pisos), en vez de seguir de largo fuera de la pantalla arranca una columna nueva
    // al lado. flex-wrap segun el lado (wrap-reverse a la derecha, wrap normal a la izquierda)
    // para que la PRIMERA columna se quede siempre pegada al borde de pantalla donde esta
    // anclado el panel (right/left, mas abajo) y las columnas extra crezcan hacia el centro,
    // nunca hacia afuera de la pantalla
    'max-height:70vh',
    'background:rgba(20,20,25,0.82)', 'padding:8px 6px', 'border-radius:8px',
    'border:1px solid rgba(255,255,255,0.15)', 'box-shadow:0 4px 14px rgba(0,0,0,0.45)',
    'z-index:20', 'font-family:monospace', 'pointer-events:auto'
  ].join(';');

  elevatorPanelButtons = [];
  for(let f = 0; f < floors; f++){
    const btn = document.createElement('button');
    btn.textContent = f === 0 ? 'PB' : String(f + 1);
    btn.style.cssText = [
      'width:34px', 'height:28px', 'border-radius:5px', 'border:1px solid rgba(255,255,255,0.25)',
      'background:#2c2f38', 'color:#e8e8ec', 'font-family:monospace', 'font-size:12px',
      'font-weight:bold', 'cursor:pointer'
    ].join(';');
    btn.addEventListener('click', () => requestElevatorFloor(f));
    panel.appendChild(btn);
    elevatorPanelButtons.push(btn);
  }

  document.body.appendChild(panel);
  elevatorPanelEl = panel;
  elevatorPanelSignature = signature;

  // resguardo, registrado una sola vez (la primera vez que se arma un panel de verdad, bien
  // entrado el juego -- nunca al cargarse este archivo): oculta el panel si por lo que sea
  // window.insideBuilding se quedo en null sin pasar por exitBuilding (ej. un reinicio completo
  // del mundo, que lo anula directo) -- exitBuilding ya lo oculta al toque, esto es solo la red
  // de seguridad para cualquier otro camino de salida
  if(!elevatorPanelSafetyNetRegistered){
    elevatorPanelSafetyNetRegistered = true;
    window.WORLD_UPDATE_LISTENERS.push(function(){
      if(!window.insideBuilding && elevatorPanelEl) elevatorPanelEl.style.display = 'none';
    });
  }

  return panel;
}

function hideElevatorPanel(){
  if(elevatorPanelEl) elevatorPanelEl.style.display = 'none';
}

// se llama una vez por frame desde updateElevator: decide si el panel tiene que estar visible
// ahora mismo, y si es asi, deja cada boton resaltando el piso actual / deshabilitado mientras
// el ascensor esta en pleno viaje
function syncElevatorPanel(){
  const ib = window.insideBuilding;
  if(!ib){ hideElevatorPanel(); return; }
  const el = ib.elevator;

  const shouldShow = player.standingOnElevator === el && !el.doorOpen;
  if(!shouldShow){ hideElevatorPanel(); return; }

  const panel = ensureElevatorPanel(ib.floors, el.onRight);
  panel.style.display = 'flex';
  for(let f = 0; f < ib.floors; f++){
    const btn = elevatorPanelButtons[f];
    const isCurrent = f === el.floorIndex;
    btn.disabled = el.moving;
    btn.style.cursor = el.moving ? 'default' : 'pointer';
    btn.style.background = isCurrent ? '#4fc3f7' : '#2c2f38';
    btn.style.color = isCurrent ? '#111' : '#e8e8ec';
    btn.style.opacity = (el.moving && !isCurrent) ? '0.5' : '1';
  }
}

// dibuja un mueble/detalle del interior, en coordenadas LOCALES (0..roomW en x, floorY = el piso
// local sobre el que se apoya en y) -- se llama ya adentro del ctx.translate+ctx.scale que arma
// drawRoomWorld, asi las mismas coordenadas que usa genInteriorDecor sirven tal cual, sin
// reescalar nada a mano aca.
function drawDecorItem(ctx, item, floorY){
  const x = item.x;
  ctx.save();
  switch(item.type){
    case 'bed': {
      const w=70, h=34;
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#e7dfce'; ctx.fillRect(x-w/2+4, floorY-h+6, w-8, h*0.55);
      ctx.fillStyle = '#c94f4f'; ctx.fillRect(x-w/2+4, floorY-h+6, w*0.28, h*0.55);
      break;
    }
    case 'hospitalBed': {
      const w=76, h=30;
      ctx.fillStyle = '#d7dbe0'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x-w/2+4, floorY-h+5, w-8, h*0.6);
      ctx.strokeStyle = '#a9b0ba'; ctx.lineWidth = 2; ctx.strokeRect(x-w/2, floorY-h, w, h);
      break;
    }
    case 'ivStand': {
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, floorY-58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-12, floorY); ctx.lineTo(x+12, floorY); ctx.stroke();
      ctx.fillStyle = 'rgba(190,231,245,0.85)';
      ctx.beginPath(); ctx.ellipse(x, floorY-62, 7, 10, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'monitor': {
      const w=30, h=22;
      ctx.fillStyle = '#20242c'; ctx.fillRect(x-w/2, floorY-h-24, w, h);
      ctx.strokeStyle = '#39ff6a'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x-w/2+3, floorY-h-24+h*0.6);
      ctx.lineTo(x-w/2+w*0.35, floorY-h-24+h*0.6);
      ctx.lineTo(x-w/2+w*0.5, floorY-h-24+h*0.2);
      ctx.lineTo(x-w/2+w*0.65, floorY-h-24+h*0.9);
      ctx.lineTo(x+w/2-3, floorY-h-24+h*0.6);
      ctx.stroke();
      ctx.fillStyle = '#3a3f48'; ctx.fillRect(x-4, floorY-24, 8, 24);
      break;
    }
    case 'curtain': {
      ctx.fillStyle = 'rgba(210,225,235,0.55)';
      ctx.fillRect(x-24, floorY-90, 48, 90);
      ctx.strokeStyle = 'rgba(150,165,175,0.6)'; ctx.lineWidth = 1;
      for(let i=1;i<4;i++){ const lx=x-24+i*12; ctx.beginPath(); ctx.moveTo(lx, floorY-90); ctx.lineTo(lx, floorY); ctx.stroke(); }
      break;
    }
    case 'desk': {
      const w=64, h=28;
      ctx.fillStyle = '#6b4a30'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#20242c'; ctx.fillRect(x-16, floorY-h-18, 26, 18);
      ctx.fillStyle = '#6FB8DE'; ctx.fillRect(x-14, floorY-h-16, 22, 13);
      break;
    }
    case 'chair': {
      ctx.fillStyle = '#3a3f48';
      ctx.fillRect(x-9, floorY-20, 18, 20);
      ctx.fillRect(x-9, floorY-34, 18, 6);
      break;
    }
    case 'cabinet': {
      const w=30, h=46;
      ctx.fillStyle = '#4b4f57'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x-w/2, floorY-h*0.5); ctx.lineTo(x+w/2, floorY-h*0.5); ctx.stroke();
      break;
    }
    case 'plant': {
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(x-10, floorY-16, 20, 16);
      ctx.fillStyle = '#3fa15a';
      ctx.beginPath(); ctx.ellipse(x, floorY-30, 16, 20, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'rug': {
      ctx.fillStyle = 'rgba(180,90,90,0.55)';
      ctx.beginPath(); ctx.ellipse(x, floorY-3, 40, 10, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'lamp': {
      ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, floorY-50); ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath(); ctx.moveTo(x-12, floorY-50); ctx.lineTo(x+12, floorY-50); ctx.lineTo(x+7, floorY-66); ctx.lineTo(x-7, floorY-66); ctx.closePath(); ctx.fill();
      break;
    }
    case 'shelf': {
      const w=54, h=60;
      ctx.fillStyle = '#6b4a30'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#2b1c10';
      for(let i=1;i<3;i++) ctx.fillRect(x-w/2, floorY-h+i*(h/3), w, 3);
      const bookColors = ['#c94f4f','#4f8fc9','#e8c468','#3fa15a'];
      for(let i=0;i<6;i++){ ctx.fillStyle = bookColors[i%bookColors.length]; ctx.fillRect(x-w/2+4+i*8, floorY-h+4, 6, h/3-8); }
      break;
    }
    case 'window': {
      const w=50, h=44;
      ctx.fillStyle = '#2b1c10'; ctx.fillRect(x-w/2-4, floorY-90-4, w+8, h+8);
      ctx.fillStyle = '#9fd6ef'; ctx.fillRect(x-w/2, floorY-90, w, h);
      ctx.strokeStyle = '#2b1c10'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, floorY-90); ctx.lineTo(x, floorY-90+h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-w/2, floorY-90+h/2); ctx.lineTo(x+w/2, floorY-90+h/2); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// dibuja UN entrepiso completo (la franja solida + el hueco de la escalera con su baranda a cada
// lado del hueco) -- en coordenadas de MUNDO real (x0 = ib.roomX0), floorY es donde pisa el
// jugador parado en ESE piso. Antes esto se dibujaba en coordenadas LOCALES (0..roomW) dentro de
// un ctx.translate/ctx.scale propio (versión vieja) -- ver la nota grande junto a
// drawRoomWorld mas abajo sobre por que se cambio eso.
// dibuja UN entrepiso completo (la franja solida partida por el hueco del ascensor) -- en
// coordenadas de MUNDO real (x0 = ib.roomX0). shaftX0/shaftX1 son LOCALES (relativos a x0), el
// MISMO hueco fijo en todos los pisos (ver ib.elevator) -- a diferencia de la version vieja, ya
// no hay barandas de "escalera": el borde del hueco es directamente el marco del ascensor,
// dibujado aparte por drawElevatorShaft/drawElevatorCabin
function drawFloorSlabWorld(ctx, x0, roomW, floorY, shaftX0, shaftX1, floorColor){
  const slabH = ROOM_FLOOR_STRIP;
  ctx.fillStyle = floorColor;
  // tramo izquierdo del entrepiso (desde la pared hasta el hueco del ascensor)
  ctx.fillRect(x0 + ROOM_WALL_PAD - 14, floorY, Math.max(0, shaftX0 - (ROOM_WALL_PAD-14)), slabH);
  // tramo derecho (desde el hueco hasta la pared)
  ctx.fillRect(x0 + shaftX1, floorY, Math.max(0, (roomW-ROOM_WALL_PAD+14) - shaftX1), slabH);
}

// dibuja UN segmento de pared del cubiculo del ascensor (izquierdo o derecho): solido de punta a
// punta del edificio, salvo si `hasDoor` es true, en cuyo caso deja un vano a la altura actual de
// la cabina -- con una hoja tapandolo si esta cerrada (o en pleno viaje) y nada si esta abierta,
// mas un resplandor si el jugador esta lo bastante cerca como para tocarla con E
function drawElevatorWallSegment(ctx, xA, xB, topY, groundY, hasDoor, cabTop, cabBottom, el, near){
  ctx.fillStyle = '#20222a';
  if(!hasDoor){
    ctx.fillRect(xA, topY, xB-xA, groundY-topY);
    return;
  }
  ctx.fillRect(xA, topY, xB-xA, cabTop-topY);       // arriba de la cabina: solido
  ctx.fillRect(xA, cabBottom, xB-xA, groundY-cabBottom); // abajo de la cabina: solido

  if(!el.doorOpen || el.moving){
    // cerrada (o en pleno viaje, donde no se puede tocar): una hoja tapando el vano
    ctx.fillStyle = near && !el.moving ? '#8a5a35' : '#6b4a30';
    ctx.fillRect(xA, cabTop, xB-xA, cabBottom-cabTop);
  }
  // abierta: no se dibuja nada aca -- se ve directo el interior de la cabina a traves del vano

  if(near && !el.moving){
    ctx.save();
    ctx.shadowColor = '#fff700'; ctx.shadowBlur = 10;
    ctx.strokeStyle = '#fff700'; ctx.lineWidth = 2;
    ctx.strokeRect(xA-2, cabTop-2, (xB-xA)+4, (cabBottom-cabTop)+4);
    ctx.restore();
  }
}

// dibuja el CUBICULO entero del ascensor: dos paredes solidas de punta a punta del edificio
// (piso a techo), un corredor cerrado separado del resto del cuarto -- con una puertita en el
// lado que mira al cuarto (el.doorSide), a la altura donde este parada la cabina en este
// instante, que se ve abierta o cerrada segun el.doorOpen. En coordenadas de mundo real, se
// llama desde drawRoomWorld.
function drawElevatorCabin(ctx, x0){
  const ib = window.insideBuilding;
  const el = ib.elevator;
  const shaftLeftX = x0 + el.localX, shaftRightX = x0 + el.localX + el.w;
  const topY = (ib.groundY - ib.floors*FLOOR_H) + ROOM_TOP_PAD;
  const cabTop = el.y - ELEVATOR_CABIN_H, cabBottom = el.y;
  const near = isNearElevatorDoor();

  // interior del corredor (todo el alto): un pasillo oscuro, bien distinto del resto de la
  // habitacion, para que se note de lejos que es una zona aparte, cerrada
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(shaftLeftX, topY, shaftRightX-shaftLeftX, ib.groundY-topY);

  const wallT = 6;
  drawElevatorWallSegment(ctx, shaftLeftX, shaftLeftX+wallT, topY, ib.groundY, el.doorSide === 'left', cabTop, cabBottom, el, near);
  drawElevatorWallSegment(ctx, shaftRightX-wallT, shaftRightX, topY, ib.groundY, el.doorSide === 'right', cabTop, cabBottom, el, near);

  // cable, desde el techo hasta la cabina
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo((shaftLeftX+shaftRightX)/2, topY); ctx.lineTo((shaftLeftX+shaftRightX)/2, cabTop); ctx.stroke();

  // cabina: caja donde pisa el jugador
  ctx.fillStyle = '#3a3d45';
  ctx.fillRect(shaftLeftX, cabTop, shaftRightX-shaftLeftX, ELEVATOR_CABIN_H);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
  ctx.strokeRect(shaftLeftX, cabTop, shaftRightX-shaftLeftX, ELEVATOR_CABIN_H);

  // indicador de piso, arriba de la cabina
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`Piso ${el.floorIndex+1}/${ib.floors}`, (shaftLeftX+shaftRightX)/2, cabTop-8);
  ctx.restore();

  // pistas de control: cerca de la puerta, que se puede abrir/cerrar con E; adentro con la
  // puerta ya cerrada, que hay un panel de botones al costado de la pantalla (ver
  // ensureElevatorPanel/syncElevatorPanel) para elegir piso
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  if(near && !el.moving){
    ctx.fillText('E: ' + (el.doorOpen ? 'cerrar puerta' : 'abrir puerta'), (shaftLeftX+shaftRightX)/2, cabTop-22);
  } else if(player.standingOnElevator === el && !el.doorOpen && !el.moving){
    ctx.fillText('Elegí un piso en el panel', (shaftLeftX+shaftRightX)/2, cabTop-22);
  }
  ctx.restore();
}

// dibuja el cuarto entero EN COORDENADAS DE MUNDO REALES (roomX0 + local, nunca 0..roomW) --
// pensada para llamarse DENTRO del mismo ctx.translate(-camera.x,-camera.y) que ya usa el mundo
// de afuera en render() (spiderswing.html), en vez de armar su propio encuadre/escala fijo como
// antes (bx,by,fit). Con esto la camara normal (la que sigue al jugador con el mismo criterio de
// siempre) encuadra el interior sola, sin ningun caso especial -- y de paso el resto de sistemas
// que ya asumen "coordenadas de mundo + camera.x/y" (la mira del mouse, drawRope, las redes
// tejidas) funcionan adentro sin tocarles nada.
function drawRoomWorld(ctx){
  const ib = window.insideBuilding;
  const x0 = ib.roomX0;
  const wallColor  = ib.kind === 'hospital' ? '#eef3f6' : ib.kind === 'office' ? '#2c2f38' : '#e9e6dd';
  const floorColor = ib.kind === 'hospital' ? '#cfd7dc' : ib.kind === 'office' ? '#1c1e24' : '#c9c3b2';

  ctx.fillStyle = wallColor;
  ctx.fillRect(x0, 0, ib.roomW, ib.roomH);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(x0, 0, ib.roomW, ib.roomH);

  // franjas sutiles horizontales marcando cada piso en la pared de fondo
  ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
  for(let f=1; f<ib.floors; f++){
    const y = ib.groundY - f*FLOOR_H;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0+ib.roomW, y); ctx.stroke();
  }

  // marcas de las paredes laterales, justo en el limite de colision real (ROOM_WALL_PAD) --
  // antes esa franja no tenia NINGUNA diferencia visual con el resto del piso, asi que se sentia
  // como una pared invisible frenandote sin razon aparente bien antes de llegar al borde
  // dibujado del cuarto. Ahora se ve como una columna/moldura de punta a punta, marcando
  // exactamente hasta donde se puede caminar -- y es tambien lo que se puede trepar con W+W
  // (ver tryGrabIndoorWall en habilities/wallClimb.js)
  const pilW = 12;
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(x0 + ROOM_WALL_PAD - pilW, 0, pilW, ib.roomH);
  ctx.fillRect(x0 + ib.roomW - ROOM_WALL_PAD, 0, pilW, ib.roomH);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0+ROOM_WALL_PAD, 0); ctx.lineTo(x0+ROOM_WALL_PAD, ib.roomH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x0+ib.roomW-ROOM_WALL_PAD, 0); ctx.lineTo(x0+ib.roomW-ROOM_WALL_PAD, ib.roomH); ctx.stroke();

  // entrepisos (pisos 1 en adelante -- planta baja se dibuja aparte, con su zocalo de siempre),
  // todos con el MISMO hueco fijo del ascensor (ib.elevator), nunca alternado como antes
  for(let f=1; f<ib.floors; f++){
    const floorY = ib.groundY - f*FLOOR_H;
    drawFloorSlabWorld(ctx, x0, ib.roomW, floorY, ib.elevator.localX, ib.elevator.localX+ib.elevator.w, floorColor);
  }

  // zocalo/piso de planta baja
  ctx.fillStyle = floorColor;
  ctx.fillRect(x0, ib.groundY, ib.roomW, ROOM_FLOOR_STRIP);

  // el ascensor (eje + cabina) -- se dibuja despues de los entrepisos para que la cabina quede
  // por encima de las franjas de piso que va atravesando
  drawElevatorCabin(ctx, x0);

  // puerta de ADENTRO: hueco recortado en la pared con marco + hoja, resaltado en amarillo
  // cuando estas lo bastante cerca (isNearIndoorDoor), igual que el cartel de afuera
  const near = isNearIndoorDoor();
  const doorW = 40, doorH = 78, doorX = x0 + ib.doorLocalX - doorW/2;
  const doorY = ib.groundY - doorH;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(doorX-3, doorY-3, doorW+6, doorH+3);
  ctx.fillStyle = near ? '#8a5a35' : '#6b4a30';
  ctx.fillRect(doorX+3, doorY+2, doorW-6, doorH-2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(doorX+doorW*0.5, doorY+4); ctx.lineTo(doorX+doorW*0.5, doorY+doorH-4); ctx.stroke();
  ctx.fillStyle = '#e8c468';
  ctx.beginPath(); ctx.arc(doorX+doorW-9, doorY+doorH*0.55, 2.4, 0, Math.PI*2); ctx.fill();
  if(near){
    ctx.save();
    ctx.shadowColor = '#fff700'; ctx.shadowBlur = 12;
    ctx.strokeStyle = '#fff700'; ctx.lineWidth = 2;
    ctx.strokeRect(doorX-4, doorY-4, doorW+8, doorH+6);
    ctx.restore();
  }

  // muebles (hoy siempre en planta baja, ver genInteriorDecor) -- item.x ya viene en local,
  // se le suma x0 aca para pasarlo a mundo real
  for(const item of ib.decor){
    drawDecorItem(ctx, {type: item.type, x: x0 + item.x, floorY: item.floorY}, item.floorY);
  }
}

// HUD del interior (rotulo de piso + hint de "E para salir"), en espacio de PANTALLA -- separado
// de drawRoomWorld porque este necesita camera.x/y para ubicarse (a diferencia del dibujo de
// mundo, que va dentro del translate de camara). Se llama desde la seccion de HUD de render(),
// mismo lugar donde antes se llamaba drawDoorPrompt (afuera) -- ver el "COMO SE ENGANCHA" al
// inicio del archivo.
function drawIndoorHUD(ctx){
  const ib = window.insideBuilding;
  const kindLabel = ib.kind === 'hospital' ? 'Habitacion de hospital' : ib.kind === 'office' ? 'Oficina' : 'Apartamento';
  const currentFloor = Math.max(0, Math.min(ib.floors-1, Math.round((ib.groundY - player.y) / FLOOR_H)));

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(`${kindLabel} -- Piso ${currentFloor+1}/${ib.floors}`, canvas.width/2, 28);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('A/D caminar · doble A o D correr · SPACE saltar · W+W en una pared para trepar · E para usar el ascensor', canvas.width/2, 48);
  ctx.restore();

  if(isNearIndoorDoor()){
    const sx = ib.roomX0 + ib.doorLocalX - camera.x;
    const sy = (ib.groundY - 78) - camera.y - 14;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#000';
    ctx.fillText('Presiona E para salir', sx+1, sy+1);
    ctx.fillStyle = '#fff700';
    ctx.fillText('Presiona E para salir', sx, sy);
    ctx.restore();
  }
}

// letrerito ("Presiona E para entrar") flotando sobre la puerta cuando estas cerca y todavia
// afuera -- se llama explicitamente desde la seccion de HUD de spiderswing.html (ver el punto 4
// de "COMO SE ENGANCHA" arriba), en espacio de pantalla (por eso resta camera.x/camera.y a mano).
// El cartelito equivalente de ADENTRO ("Presiona E para salir") vive dentro de
// drawIndoorHUD (necesita camera.x/y para ubicarse en pantalla).
function drawDoorPrompt(ctx){
  if(window.insideBuilding) return;
  const b = findNearbyDoor(player.x, player.y);
  if(!b) return;
  const screenX = b.x + b.w/2 - camera.x;
  const screenY = STREET_Y - camera.y - PLAYER_SIZE - 14;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#000';
  ctx.fillText('Presiona E para entrar', screenX+1, screenY+1);
  ctx.fillStyle = '#fff700';
  ctx.fillText('Presiona E para entrar', screenX, screenY);
  ctx.restore();
}

// interaccion con E, en orden de prioridad:
//   1. cerca de la puertita del ascensor (isNearElevatorDoor) -- la abre/cierra
//      (toggleElevatorDoor). Solo con esta cerrada aparece el panel de botones para elegir piso
//      (ver requestElevatorFloor/ensureElevatorPanel).
//   2. si no, y ya estas adentro del edificio, parado cerca de la puerta de ADENTRO
//      (isNearIndoorDoor) -- sale (exitBuilding).
//   3. si no, y estas afuera, cerca de la puerta de un edificio (findNearbyDoor) -- entra
//      (enterBuilding).
// Igual que el resto de los ganchos de teclado del juego, no hace nada si el juego esta pausado
// o en GAME OVER.
window.addEventListener('keydown', e=>{
  if(e.code !== DOOR_KEY || e.repeat) return;
  if(gameOver || paused) return;
  if(window.insideBuilding){
    if(isNearElevatorDoor()) toggleElevatorDoor();
    else if(isNearIndoorDoor()) exitBuilding();
  } else {
    const b = findNearbyDoor(player.x, player.y);
    if(b) enterBuilding(b);
  }
});
