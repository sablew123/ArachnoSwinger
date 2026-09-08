// ============================================================================
//  entities/engine.js
// ----------------------------------------------------------------------------
//  Motor GENERICO de entidades: civiles, villanos, bots, dummies de practica,
//  lo que sea. Antes vivia inline dentro de spiderswing.html (seccion
//  "SISTEMA MODULAR DE ENTIDADES"); se movio aca para que ese HTML quede mas
//  chico y para que el motor este junto al resto de la carpeta entities/
//  (manifest.js, civiles.js, etc.), que es donde conceptualmente pertenece.
//
//  ORDEN DE CARGA -- IMPORTANTE:
//  Este archivo se carga con un <script src="entities/engine.js"> normal
//  (sincronico) puesto en el <head> de spiderswing.html, INMEDIATAMENTE
//  DESPUES de <script src="entities/manifest.js">. Ese orden no es opcional:
//  mas abajo (ENTITY_SCRIPT_FILES / ENTITY_JSON_FILES) este archivo lee
//  window.ENTITY_MANIFEST apenas se ejecuta -- si se cargara ANTES que
//  manifest.js, window.ENTITY_MANIFEST todavia no existiria y las dos listas
//  quedarian vacias para siempre (nada se rompe, pero nada se cargaria).
//
//  Ademas, TODO lo demas (habilities/*, el combate cuerpo a cuerpo, los
//  proyectiles del jugador, mundo/carros, etc. -- lo que sigue viviendo
//  inline en spiderswing.html) depende de que las funciones/variables de
//  aca abajo (registerEntityType, spawnEntity, updateEntities, drawEntities,
//  loadEntityScript, loadAllEntityFiles, entities, entityProjectiles,
//  dealDamageAt, dealDamageAlongReach, etc.) ya existan como globales ANTES
//  de que el <script> principal (el inline, al final del <head>/<body>)
//  empiece a ejecutarse. Por eso este archivo tiene que cargarse temprano,
//  en el <head>, junto a los demas manifest.js -- nunca despues del script
//  principal.
//
//  Este archivo SI depende de unas pocas globales que declara el script
//  principal de spiderswing.html (player, GRAVITY, STREET_Y, PLAYER_SIZE,
//  WEB_PULL_SPEED, damagePlayer): esta bien que las use por nombre aca
//  adentro porque esas referencias solo se resuelven cuando estas funciones
//  se LLAMAN de verdad (durante el loop del juego), momento en el que esas
//  globales ya estan definidas. Ningun codigo de este archivo las toca al
//  cargarse, asi que el orden entre este archivo y el script principal no
//  importa para ESO -- lo que si importa es el orden con manifest.js (ver
//  arriba) y que este archivo este listo ANTES de que el script principal
//  llame a cualquiera de sus funciones.
// ============================================================================

// ---------- SISTEMA MODULAR DE ENTIDADES ----------
// Base generica para TODO lo que no sea el jugador ni un carro: civiles, villanos, bots,
// dummies de practica, lo que sea. La idea es que el motor no necesite saber nada especifico
// de cada uno: solo conoce "tipos" registrados (ENTITY_TYPES) con datos + un puñado de hooks
// opcionales, e instancias vivas (`entities`) creadas a partir de esos tipos con spawnEntity().
//
// Por que esto importa para lo que viene (misiones activables, mas entidades, etc.):
//  - un tipo se puede registrar desde ESTE archivo, pero tambien desde un <script> aparte, o
//    cargando un JSON con fetch() (ver loadEntityTypesFromJSON mas abajo) — el motor no le
//    pregunta nunca "de donde saliste", solo revisa ENTITY_TYPES[id].
//  - una mision, a futuro, va a poder ser tan simple como: "registra estos tipos (si no estan
//    ya) + spawnEntity(tipo, x, y) para cada uno de sus actores".
//  - las telarañas ya saben engancharse a una entidad exactamente igual que a un carro (ver
//    findEntityAt / computeWebHit / updateEntityRopePulls en spiderswing.html): cualquier tipo
//    nuevo que definas hereda ese comportamiento gratis, a menos que pongas webAttachable:false.
//  - el combate (dealDamageAt, usado por puños/patadas Y por el hueco de proyectiles) ya revisa
//    esta lista en vez de una lista aparte de "enemigos": un civil y un villano son lo mismo
//    para el motor, la diferencia la pone cada tipo (def.friendly, def.invulnerable, etc.)
const ENTITY_TYPES = {};

// registra (o sobreescribe) un tipo de entidad. `def` solo necesita llenar lo que le importe:
// todo lo demas queda con un default razonable.
//   hp, hitRadius        -> vida y tamaño de la hitbox (circular)
//   moveType             -> 'static' (no se mueve solo) | 'walker' (camina por el piso, gravedad)
//                            | 'flyer' (vuela libre, sin gravedad) | 'custom' (moveType propio:
//                            el motor no le toca ni x/y/vx/vy, todo lo mueve onUpdate)
//   speed                -> velocidad de referencia que puede usar tu propio onUpdate/IA
//   webAttachable         -> si una telaraña se puede pegar a esta entidad (como a un carro)
//   pullMass              -> "peso" en la pulseada de una telaraña tensa (ver CAR_PULL_MASS);
//                            mas alto = mas dificil de arrastrar/frenar con la soga
//   friendly              -> civiles = true (a futuro, para que la IA/combate los trate distinto)
//   invulnerable          -> si es true, dealDamageAt nunca le baja HP (util para dummies fijos,
//                            civiles no combatientes, etc.)
//   color                 -> color base para el dibujo generico (si no das draw custom)
//   draw(ctx, entity)     -> dibujo 100% custom; si no lo das, se usa un monigote simple generico
//   onSpawn(entity)       -> se llama una sola vez, justo al crearse
//   onUpdate(entity, dt)  -> IA/logica propia: patrullar, perseguir, disparar proyectiles, etc.
//   onDamage(entity,dmg,src) -> se llama cada vez que recibe daño (antes de aplicarlo al hp)
//   onDeath(entity)       -> se llama una vez, justo cuando su hp llega a 0
//   onWebProjectileHit(entity, dirX, dirY, speed) -> se llama una vez, el frame exacto en el que
//                            un telarañazo SUELTO (webProjectiles, disparado a la nada o cortado
//                            a mitad de viaje -- ver spawnWebProjectile/fireWeb) atraviesa la
//                            hitbox de esta entidad; dirX/dirY/speed son los del telarañazo en ese
//                            instante. El motor solo detecta el choque y llama esto -- que hacer
//                            con el impacto (empujar, envolver, ignorar) es 100% cosa del tipo
//                            (ver civiles.js, que envuelve al civil en telaraña con esto).
//                            IMPORTANTE: tiene que devolver true si de verdad reacciono al
//                            impacto -- solo ahi el motor da el telarañazo por consumido y lo
//                            borra. Si devuelve false/undefined (por ej. un civil que ya esta
//                            'hugging'/'carried'/'wrapped' y no debe reaccionar dos veces), el
//                            motor trata a esta entidad como si no estuviera ahi y el proyectil
//                            sigue de largo -- asi no "muere" contra alguien que ya cargabas
//                            encima al tirar desde tu propio origen (ver civiles.js)
//   projectile             -> config basica {speed,damage,radius,color,life} para que tu propio
//                            onUpdate dispare con spawnEntityProjectile sin repetir numeros
function registerEntityType(id, def){
  ENTITY_TYPES[id] = Object.assign({
    hp: 20,
    hitRadius: 18,
    moveType: 'static',
    speed: 0,
    webAttachable: true,
    pullMass: 1.5,
    friendly: false,
    invulnerable: false,
    color: '#9aa0ac',
    // huggable -> si es true, un TOQUE de boton medio (ver performWebPull) con una telaraña
    // tensada enganchada a esta entidad NO jala al jugador hacia ella (como con un edificio):
    // es la entidad la que recibe el jalon, un impulso real de fisica hacia donde este el
    // jugador en ese instante (ver applyEntityPullImpulse) -- despues cae bajo su propia
    // gravedad/colisiones como cualquier cosa, puede no alcanzar, y la telaraña sigue enganchada
    // para poder volver a tirar. El motor no decide cuando "atrapar" a la entidad: eso es cosa
    // del propio onUpdate del tipo (ver el estado 'towed' en civiles.js), que la deja abrazarse
    // sola en cuanto llegue lo bastante cerca del jugador
    huggable: false,
    draw: null,
    onSpawn: null,
    onUpdate: null,
    onDamage: null,
    onDeath: null,
    onWebProjectileHit: null,
    projectile: null
  }, def);
}

// carga tipos de entidad desde un JSON externo (mismo formato que el segundo argumento de
// registerEntityType, uno por clave). Pensado para el dia que las entidades vivan en archivos
// aparte (entities/civiles.json, entities/villanos.json, etc.) en vez de este HTML. Los hooks
// (onUpdate, draw, etc.) no viajan bien en JSON puro, asi que si el tipo los necesita, lo mejor
// sigue siendo un .js aparte que llame a registerEntityType directamente (tambien soportado:
// con un tag script src="entities/loquesea.js" (cerrado normal) antes de este script, siempre y cuando
// llame a registerEntityType, ya queda disponible aca sin tocar nada mas).
async function loadEntityTypesFromJSON(url){
  try{
    const res = await fetch(url);
    const data = await res.json();
    for(const id in data) registerEntityType(id, data[id]);
  } catch(err){
    console.warn('No se pudo cargar tipos de entidad desde', url, err);
  }
}

// carga un .js suelto (uno que llame a registerEntityType por su cuenta) inyectando un <script>
// nuevo en el <head>, y devuelve una promesa que se resuelve cuando termino de ejecutarse (asi
// loadAllEntityFiles puede esperar a que cada uno registre sus tipos antes de seguir con el que
// sigue, o antes de arrancar el juego). Generica a proposito: no tiene nada de especifico a
// entidades, asi que habilities/manifest.js (ver loadAllAbilityFiles en spiderswing.html) la
// reutiliza tal cual para cargar sus propios archivos.
function loadEntityScript(src){
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(src);
    s.onerror = () => { console.warn('No se pudo cargar el script de entidad', src); resolve(src); };
    document.head.appendChild(s);
  });
}

// ---------- ARCHIVOS DE ENTIDADES (civiles, villanos, lo que sea) ----------
// El motor NO tiene rutas hardcodeadas aca: las lee de entities/manifest.js (ver <script>
// entities/manifest.js en el <head> de spiderswing.html, se carga JUSTO ANTES que este archivo
// -- ver nota de orden de carga al principio de este mismo archivo). Ese archivo aparte es el
// UNICO que hace falta editar cuando haya entidades de verdad — nunca este motor.
// Si por algun motivo manifest.js no esta o no cargo, seguimos con listas vacias (no rompe nada,
// simplemente no hay nada para cargar).
const ENTITY_SCRIPT_FILES = (window.ENTITY_MANIFEST && window.ENTITY_MANIFEST.scripts) || [];
const ENTITY_JSON_FILES   = (window.ENTITY_MANIFEST && window.ENTITY_MANIFEST.json)    || [];

// recorre las dos listas de arriba y carga todo lo que encuentre, en orden, antes de devolver
// la promesa (asi quien la llame puede hacer "await loadAllEntityFiles()" y recien despues
// arrancar a spawnear cosas, con la garantia de que todos los tipos ya estan registrados). La
// llama el script principal de spiderswing.html al arrancar el juego — mientras manifest.js
// este vacio, esto no hace absolutamente nada, asi que es seguro dejarla siempre activa.
async function loadAllEntityFiles(){
  // las rutas en manifest.js son relativas a la carpeta entities/ (para que ese archivo se
  // pueda escribir sin repetir "entities/" en cada linea) — aca es donde se le agrega el prefijo
  // real antes de pedirlas
  for(const src of ENTITY_SCRIPT_FILES) await loadEntityScript('entities/' + src);
  for(const url of ENTITY_JSON_FILES) await loadEntityTypesFromJSON('entities/' + url);
}

const entities = []; // instancias vivas: civiles, villanos, dummies, lo que sea
let entityIdCounter = 1;

// crea una instancia de un tipo ya registrado. opts puede pisar cualquier campo de la instancia
// (por ejemplo spawnEntity('civil', x, y, {facing:-1, patrolMinX:x-200, patrolMaxX:x+200}) para
// darle a esta instancia puntual datos que solo ella necesita, sin tocar el tipo en general)
function spawnEntity(typeId, x, y, opts={}){
  const def = ENTITY_TYPES[typeId];
  if(!def){ console.warn('Tipo de entidad no registrado:', typeId); return null; }
  const e = Object.assign({
    id: entityIdCounter++,
    type: typeId,
    def,
    x, y, vx: 0, vy: 0,
    hp: def.hp, maxHp: def.hp,
    hitRadius: def.hitRadius,
    grounded: false,
    facing: 1,
    dead: false,
    state: 'idle',
    t: 0
  }, opts);
  entities.push(e);
  if(def.onSpawn) def.onSpawn(e);
  return e;
}

// avanza fisica/IA basica de cada entidad y limpia las que murieron. La fisica que da el motor
// es a proposito minima (gravedad simple + piso al nivel de la calle para 'walker'): cualquier
// cosa mas especifica (patrullar, perseguir, esquivar, volar en patron, etc.) es responsabilidad
// del onUpdate de cada tipo, que corre SIEMPRE, sin importar el moveType.
// (usa player, WEB_PULL_SPEED, GRAVITY y STREET_Y -- ver nota de orden de carga al principio de
// este archivo: son globales del script principal de spiderswing.html, resueltas recien cuando
// esta funcion se LLAMA, no cuando se define, asi que no importa el orden de carga entre archivos)
function updateEntities(dt){
  for(let i = entities.length-1; i >= 0; i--){
    const e = entities[i];
    if(e.dead){ entities.splice(i,1); continue; }

    // reel-in generico: viaja en linea recta hacia el jugador a WEB_PULL_SPEED, ignorando su
    // moveType normal (gravedad, patrullaje, etc.) mientras dure el viaje -- lo usan entidades
    // con def.reelBehavior propio (ej. una bomba enganchada, ver performWebPull) que decidan
    // prender e.beingReeled por su cuenta. Las entidades "huggable" (civiles, etc.) YA NO pasan
    // por aca: a esas el jalon de boton medio les da un impulso de fisica real en vez de
    // teletransportarlas en linea recta (ver applyEntityPullImpulse/performWebPull), asi que se
    // manejan con su fisica normal de mas abajo, no con este branch.
    if(e.beingReeled){
      const dx = player.x - e.x, dy = player.y - e.y;
      const dist = Math.hypot(dx,dy) || 0.0001;
      const step = WEB_PULL_SPEED*dt;
      if(step >= dist){
        e.x = player.x; e.y = player.y;
        e.vx = 0; e.vy = 0;
        e.beingReeled = false;
        e.justCaught = true; // senial de un solo frame: "recien llegue", que la lea el propio onUpdate
      } else {
        e.x += dx/dist*step; e.y += dy/dist*step;
        e.vx = dx/dist*WEB_PULL_SPEED; e.vy = dy/dist*WEB_PULL_SPEED;
      }
    } else if(!e.carried){
      if(e.def.moveType === 'walker'){
        e.vy += GRAVITY*dt;
        e.y += e.vy*dt;
        if(e.y >= STREET_Y - e.hitRadius){ e.y = STREET_Y - e.hitRadius; e.vy = 0; e.grounded = true; }
        else e.grounded = false;
        e.x += e.vx*dt;
      } else if(e.def.moveType === 'flyer'){
        e.x += e.vx*dt;
        e.y += e.vy*dt;
      }
      // 'static' y 'custom' no reciben ningun movimiento automatico del motor
    }

    if(e.def.onUpdate) e.def.onUpdate(e, dt);
    e.justCaught = false; // dura un solo frame, la lea o no el onUpdate

    if(e.hp <= 0 && !e.dead){
      e.dead = true;
      if(e.def.onDeath) e.def.onDeath(e);
    }
  }
}

// dibujo generico (si el tipo no trae uno propio): un monigote simple, sin animacion, mas una
// barrita de vida arriba (solo si esta danada, para no ensuciar la pantalla con entidades sanas)
function drawEntities(ctx){
  for(const e of entities){
    if(e.def.draw){ e.def.draw(ctx, e); }
    else {
      ctx.fillStyle = e.def.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y - e.hitRadius*0.3, e.hitRadius*0.55, 0, Math.PI*2); // "cabeza"
      ctx.fill();
      ctx.fillRect(e.x - e.hitRadius*0.35, e.y - e.hitRadius*0.1, e.hitRadius*0.7, e.hitRadius*1.1); // "cuerpo"
    }
    if(e.hp < e.maxHp){
      const w = e.hitRadius*2, h = 5;
      const bx = e.x - w/2, by = e.y - e.hitRadius - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(bx-1, by-1, w+2, h+2);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(bx, by, w, h);
      ctx.fillStyle = '#2ecc71';
      ctx.fillRect(bx, by, w*Math.max(0,e.hp/e.maxHp), h);
    }
  }
}

// ---------- PROYECTILES DE ENTIDADES ----------
// generico y separado de webProjectiles (esos son puramente esteticos/de telaraña): estos
// SI dañan al jugador al tocarlo. Cualquier tipo de entidad puede usarlos desde su onUpdate,
// por ejemplo: if(e.t > e.def.projectile.cooldown){ spawnEntityProjectile(e.x,e.y,dirX,dirY,e.def.projectile); e.t=0; }
const entityProjectiles = [];
function spawnEntityProjectile(x, y, dirX, dirY, cfg={}){
  entityProjectiles.push({
    x, y, dirX, dirY,
    speed: cfg.speed ?? 500,
    damage: cfg.damage ?? 5,
    radius: cfg.radius ?? 8,
    color: cfg.color ?? '#e67e22',
    life: 0,
    maxLife: cfg.life ?? 4
  });
}
// usa player, PLAYER_SIZE y damagePlayer -- ver nota de orden de carga al principio de este
// archivo
function updateEntityProjectiles(dt){
  const half = PLAYER_SIZE/2;
  for(let i = entityProjectiles.length-1; i >= 0; i--){
    const p = entityProjectiles[i];
    p.x += p.dirX*p.speed*dt;
    p.y += p.dirY*p.speed*dt;
    p.life += dt;

    const hitPlayer = Math.hypot(p.x-player.x, p.y-player.y) <= p.radius + half;
    let remove = p.life >= p.maxLife;
    if(hitPlayer){ damagePlayer(p.damage); remove = true; }

    if(remove) entityProjectiles.splice(i,1);
  }
}
function drawEntityProjectiles(ctx){
  for(const p of entityProjectiles){
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
  }
}

// ---------- TIPOS/INSTANCIAS DE ENTIDAD ----------
// Aca no hay nada spawneado a proposito: el sistema (registerEntityType, spawnEntity,
// loadEntityTypesFromJSON) queda listo y funcionando, pero sin ningun civil/villano de prueba
// dando vueltas. Cuando haya misiones o entidades de verdad, se registran sus tipos (desde un
// <script> aparte, o con loadEntityTypesFromJSON) y se llama a spawnEntity(tipo, x, y) donde
// corresponda — el motor no necesita ningun otro cambio para tomarlas.

// ---------- COMBATE GENERICO CONTRA ENTIDADES ----------
// dealDamageAt/dealDamageAlongReach viven aca (y no junto al resto del combate cuerpo a cuerpo,
// que sigue en spiderswing.html) porque son las que saben iterar `entities` -- el resto del
// combate (constantes de puño/patada, applyAttackImpulse, updateAttack) no le importa nada de
// como esta guardada la lista de entidades, solo llama a estas dos funciones.

// aplica daño + empuje a cualquier entidad (civil, villano, dummy, lo que sea) dentro del radio
// de la hitbox. Las que su tipo marco como invulnerable (def.invulnerable) sienten el empujon
// igual, pero nunca pierden vida (util para dummies fijos o civiles que no deberian "morir")
function dealDamageAt(x, y, radius, damage, knockbackX, knockbackY){
  for(const en of entities){
    if(en.dead) continue;
    const d = Math.hypot(en.x - x, en.y - y);
    if(d <= radius + (en.hitRadius || 20)){
      en.vx = (en.vx||0) + knockbackX;
      en.vy = (en.vy||0) + knockbackY;
      if(!en.def.invulnerable){
        if(en.def.onDamage) en.def.onDamage(en, damage, {x,y});
        en.hp = (en.hp||0) - damage;
      }
    }
  }
}

// version "capsula" de dealDamageAt, pensada para los puños/patadas (ver updateAttack en
// spiderswing.html): en vez de una unica hitbox circular flotando a `reach` de distancia del
// jugador (que deja un hueco MUERTO entre el cuerpo del jugador y ese circulo -- nada mas cerca
// que reach-radius puede recibir el golpe), esta cubre TODO el tramo desde el jugador hasta ese
// punto. Sin esto, algo que estas jalando hacia vos con la telaraña (ver
// applyEntityPullImpulse/performWebPull) pasa buena parte del vuelo mas cerca que ese hueco
// muerto, y un golpe en pleno aire simplemente lo atraviesa sin conectar -- ni knockback ni
// daño -- porque su hitbox real quedaba mas lejos que el blanco. Mismo criterio de impacto que
// dealDamageAt (circulo contra circulo), solo que el punto de comparacion es el mas cercano
// sobre el segmento jugador -> jugador+dir*reach, no un punto fijo
function dealDamageAlongReach(originX, originY, dirX, dirY, reach, radius, damage, knockbackX, knockbackY){
  for(const en of entities){
    if(en.dead) continue;
    const px = en.x - originX, py = en.y - originY;
    const t = Math.max(0, Math.min(reach, px*dirX + py*dirY)); // proyeccion clampeada a [0, reach]
    const cx = originX + dirX*t, cy = originY + dirY*t;
    const d = Math.hypot(en.x - cx, en.y - cy);
    if(d <= radius + (en.hitRadius || 20)){
      en.vx = (en.vx||0) + knockbackX;
      en.vy = (en.vy||0) + knockbackY;
      if(!en.def.invulnerable){
        if(en.def.onDamage) en.def.onDamage(en, damage, {x:cx, y:cy});
        en.hp = (en.hp||0) - damage;
      }
    }
  }
}
