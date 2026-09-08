// habilities/webSling.js -- habilidad de telaraña: disparar (click) y soltar (soltar el click).
// Movida tal cual desde spiderswing.html, referencia las mismas variables globales del motor
// (player, mouse, camera, webs, WEB_TRAVEL_SPEED, etc.) que siguen viviendo alla.
//
// NUEVO: soporte para dos tipos de telaraña, definidos en habilities/controls.json bajo
// "webType" (cual esta activo) y "webTypes" (la config de cada uno):
//   - "Andrew"  -> lanzatelarañas mecanico: hay un tanque de metros de telaraña compartido
//                  entre las dos manos (maxMeters), cada disparo gasta metros segun el largo
//                  real del tiro (con un minimo de WEB_MIN_METERS_PER_SHOT), y por ahora la
//                  unica forma de recargar es morir (regenOn: "death").
//   - "Tobey"   -> telarañas organicas: infinitas, no gastan nada (comportamiento de siempre).
// Estas dos funciones asumen que el loader ya parseo controls.json en el global CONTROLS
// (mismo patron que usa el motor para leer los bindings de teclas/botones) -- aca solo
// leemos CONTROLS.webType / CONTROLS.webTypes, no tocamos el loader.

// metros de telaraña que quedan, UNO POR MANO: son dos lanzatelarañas independientes, cada
// uno con su propio tanque (izquierda no le presta metros a derecha ni viceversa). Si el tipo
// activo es infinito, estos numeros no se usan para nada (hasWebAmmo siempre da true), pero
// los dejamos inicializados igual para no tener que chequear undefined en todos lados
let webMeters = { left: 0, right: 0 };

// timestamp (performance.now()) hasta el cual el HUD tiene que pintar en rojo el numero de
// CADA mano -- lo pisa consumeWebAmmo cada vez que esa mano gasta metros de verdad, y lo lee
// drawWebAmmoHUD en spiderswing.html para saber si esa mano "todavia esta en el ratito de
// flash" o no. Es por mano tambien: gastar la derecha no debe hacer flashear el numero de la
// izquierda
let webMetersFlashUntil = { left: 0, right: 0 };
const WEB_METERS_FLASH_MS = 350;

// cuantos px del mundo equivalen a 1 metro. Esto es una conversion aproximada -- si al jugar
// el gasto se siente muy rapido o muy lento comparado con las distancias reales del mapa,
// ajustar este numero (subirlo = cada metro "vale" mas px = se gasta mas lento)
const WEB_PIXELS_PER_METER = 22;

// costo MINIMO de metros por disparo, sin importar que tan cerca este el blanco (o si el tiro
// se va al vacio y no engancha nada, ver fireWeb mas abajo): ni un telarañazo pegado a la cara
// del enemigo mas cercano deberia costar centavos de metro
const WEB_MIN_METERS_PER_SHOT = 1.50;

function currentWebTypeConfig(){
  return CONTROLS.webTypes[CONTROLS.webType];
}

// llamar una vez al arrancar la partida (y de nuevo si el jugador cambia de webType desde
// el menu) para dejar los DOS tanques al maximo del tipo elegido
function initWebAmmo(){
  const cfg = currentWebTypeConfig();
  if(cfg.infinite) return;
  webMeters.left = cfg.maxMeters.left;
  webMeters.right = cfg.maxMeters.right;
}

// por ahora la unica forma de recargar el lanzatelarañas es morir (regenOn: "death") --
// llamar esto desde donde el motor maneje la muerte/respawn del jugador. Recarga las DOS
// manos por igual, cada una a su propio maximo
function replenishWebAmmo(){
  const cfg = currentWebTypeConfig();
  if(cfg.infinite || cfg.regenOn !== 'death') return;
  webMeters.left = cfg.maxMeters.left;
  webMeters.right = cfg.maxMeters.right;
}

function hasWebAmmo(hand){
  const cfg = currentWebTypeConfig();
  return cfg.infinite || webMeters[hand] > 0;
}

// gasta metros del tanque de ESA mano nada mas (no toca el tanque de la otra) si el tipo
// activo no es infinito. NO se llama directo desde fireWeb -- la usan settleWebCostFull /
// settleWebCostMin de aca abajo, que son quienes deciden CUANTO cobrar segun si el tiro
// llego a completarse o se corto antes.
function consumeWebAmmo(hand, hitDistPixels){
  const cfg = currentWebTypeConfig();
  if(cfg.infinite) return;
  const shotMeters = hitDistPixels == null
    ? WEB_MIN_METERS_PER_SHOT
    : Math.max(WEB_MIN_METERS_PER_SHOT, hitDistPixels / WEB_PIXELS_PER_METER);
  webMeters[hand] = Math.max(0, webMeters[hand] - shotMeters);
  webMetersFlashUntil[hand] = performance.now() + WEB_METERS_FLASH_MS;
}

// ---- pago DIFERIDO del costo de un tiro ----
// un tiro que engancha algo no se cobra en el instante del click: se cobra recien cuando la
// animacion de viaje (w.state === 'travel') TERMINA DE VERDAD, porque mientras esta viajando
// el jugador todavia puede cancelarlo (soltando el boton -- ver releaseWeb -- o disparando
// otra telaraña con la misma mano encima -- ver el caso "prev" en fireWeb). Por eso cada web
// en viaje carga un flag w.costPending: true hasta que se resuelve de una forma u otra:
//
//   - settleWebCostFull(hand, w): el viaje SE COMPLETO (llego a destino) -- cobra el largo
//     real completo (w.hitDist). La llama updateWebs en spiderswing.html, justo antes de
//     convertir el 'travel' en 'attached'/'detached'.
//   - settleWebCostMin(hand, w): el viaje se CORTO antes de llegar -- cobra el minimo fijo
//     nada mas, como si hubiera sido un tiro al vacio. La llaman releaseWeb (soltaste el
//     boton a mitad de camino), fireWeb (disparaste una telaraña nueva con la misma mano
//     encima de una que todavia iba viajando), y updateWebs cuando el objetivo (una entidad)
//     desaparece a mitad de camino.
//
// si w.costPending ya es false (por ejemplo porque el tiro nunca llego a enganchar nada y se
// cobro de una en fireWeb, sin pasar por 'travel'), estas dos no hacen nada -- evita cobrar
// dos veces el mismo tiro.
function settleWebCostFull(hand, w){
  if(w && w.costPending){
    consumeWebAmmo(hand, w.hitDist);
    w.costPending = false;
  }
}
function settleWebCostMin(hand, w){
  if(w && w.costPending){
    consumeWebAmmo(hand, null);
    w.costPending = false;
  }
}

// dispara una telaraña nueva desde esa mano hacia el mouse. Si el punto apuntado no engancha
// nada, sale disparada de una como un telarañazo/proyectil (sin intentar viajar hacia ningun
// punto "fantasma"), tal cual cuando Spiderman tira una telaraña a la nada
function fireWeb(hand){
  // lanzatelarañas seco: ni dispara ni suelta lo que ya estaba enganchado en esa mano. Solo
  // se escucha el gatillo trabando en vacio (ver playWebDryClick en spiderswing.html) --
  // chequeo defensivo con typeof por si algun dia esto se usa sin esa funcion definida (tests,
  // otro motor, etc.), para que no rompa el disparo entero por un sonido que falta
  if(!hasWebAmmo(hand)){
    if(typeof playWebDryClick === 'function') playWebDryClick();
    return;
  }

  const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
  const ox = player.x, oy = player.y;
  const info = computeWebHit(ox,oy,worldX,worldY);

  // si esa mano ya tenia una telaraña viajando (sin llegar a destino todavia), que siga de largo
  // como proyectil independiente en vez de simplemente desaparecer al lanzar esta nueva -- y
  // como nunca llego a completarse, se le cobra el minimo (se corto, no se termino de tirar)
  const prev = webs[hand];
  if(prev && prev.state === 'travel'){
    settleWebCostMin(hand, prev);
    spawnWebProjectile(prev.tipX, prev.tipY, prev.dirX, prev.dirY);
  }

  detachIfAttached(hand); // si ya habia una enganchada en esa mano, que caiga antes de lanzar la nueva

  if(!info.hit){
    // tiro al vacio: no hay animacion de viaje que cancelar (sale disparado de una, ver mas
    // abajo), asi que no hay nada que "completar" despues -- se cobra el minimo YA, de una vez
    consumeWebAmmo(hand, null);
    spawnWebProjectile(ox, oy, info.dirX, info.dirY);
    webs[hand] = null;
    return;
  }

  // velocidad FIJA (ver WEB_TRAVEL_SPEED): el tiempo real de viaje sale solo de dividir la
  // distancia por esa velocidad -- lejos, tarda hasta WEB_TRAVEL_TIME; cerca, casi nada
  const speed = WEB_TRAVEL_SPEED;

  webs[hand] = {
    state: 'travel',
    ox, oy, dirX: info.dirX, dirY: info.dirY,
    dist: 0, speed,
    hitDist: info.dist,
    hitX: info.x, hitY: info.y,
    hitCar: info.car || null,
    hitEntity: info.entity || null,
    // costo TODAVIA NO cobrado: se salda cuando el viaje termina de verdad (settleWebCostFull,
    // llamado desde updateWebs) o se corta antes de llegar (settleWebCostMin, llamado desde
    // releaseWeb, desde aca mismo si se pisa con un tiro nuevo, o desde updateWebs si el
    // objetivo -- una entidad -- desaparece a mitad de camino)
    costPending: true,
    // si el destino es una entidad (se mueve sola), no alcanza con guardar el punto del mundo
    // donde estaba al tirar: para cuando la telaraña llegue ahi, ya se fue. Guardamos en cambio
    // el offset RELATIVO a la entidad (donde exactamente la apuntaste, respecto de su centro) y
    // el viaje persigue su posicion actual cuadro a cuadro (ver updateWebs) -- así el hilo se
    // mantiene apuntando a la entidad de verdad, no al fantasma de donde estaba
    hitEntityOffsetX: info.entity ? (info.x - info.entity.x) : 0,
    hitEntityOffsetY: info.entity ? (info.y - info.entity.y) : 0,
    tipX: ox, tipY: oy
  };
}

// suelta la telaraña de esa mano: si estaba enganchada, cae y se desvanece (como antes). Si
// todavia iba viajando hacia su destino, se CORTA ahi mismo: en vez de completar el viaje
// entero, sigue de largo en linea recta como un telarañazo/proyectil hasta salir de camara --
// y como nunca llego a completarse, se cobra el minimo (ver settleWebCostMin), no el largo
// completo que iba a costar si hubiera llegado
function releaseWeb(hand){
  const w = webs[hand];
  if(w && w.state === 'travel'){
    settleWebCostMin(hand, w);
    spawnWebProjectile(w.tipX, w.tipY, w.dirX, w.dirY);
    webs[hand] = null;
    return;
  }
  detachIfAttached(hand);
}
