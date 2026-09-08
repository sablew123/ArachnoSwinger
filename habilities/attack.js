// habilities/attack.js -- sistema de combate cuerpo a cuerpo completo: boton medio mantenido +
// click izq/der. Antes vivia partido en dos: startAttack (el disparo de la habilidad) ya estaba
// aca; las constantes PUNCH_*/KICK_*, applyAttackImpulse y updateAttack (la animacion/hitbox
// cuadro a cuadro) seguian inline en spiderswing.html. Se junto todo aca porque es un solo
// sistema, no dos: quedan mas cerca sus piezas mas relacionadas entre si.
//
// ORDEN DE CARGA: este archivo se carga dinamicamente por loadAllAbilityFiles() (ver
// habilities/manifest.js y spiderswing.html), que se ESPERA antes de arrancar el loop principal
// del juego -- a diferencia de las entidades, una tecla/click puede llegar en el primer frame,
// asi que startAttack/updateAttack tienen que existir ya para entonces. No hace falta ningun
// cambio en spiderswing.html mas alla de eso: una vez cargado, PUNCH_*/KICK_*/
// applyAttackImpulse/updateAttack/startAttack quedan disponibles como globales, igual que antes.
//
// Depende de globales del script principal (player, controlState, mouse, camera, angleDiff) y
// del motor de entidades en entities/engine.js (dealDamageAlongReach) -- todas se resuelven
// recien cuando estas funciones se LLAMAN (durante el loop / los handlers de mouse), nunca al
// cargarse este archivo, asi que el orden de carga entre este archivo y esos otros no importa.

// ---------- COMBATE CUERPO A CUERPO (boton medio del mouse + click): puños y patadas ----------
// cada golpe genera, por un instante nada mas, una hitbox circular que revisa las entidades (ver
// dealDamageAlongReach en entities/engine.js) y le aplica daño y empuje si corresponde. Mientras
// tanto, lo que SI se nota ya mismo es el impulso que el propio golpe le da al jugador (como un
// culatazo de retroceso al conectar), aun sin ningun enemigo cerca.

const PUNCH_DURATION = 0.18; // duracion total de la animacion del puñetazo
const PUNCH_ACTIVE_T = 0.08; // instante (dentro de esa duracion) en que la hitbox esta activa
const PUNCH_REACH    = 40;   // que tan lejos del cuerpo aparece la hitbox
const PUNCH_RADIUS   = 16;
const PUNCH_DAMAGE   = 8;
const PUNCH_IMPULSE  = 200;  // empuje chico: mas que nada la sensacion de haber pegado
const PUNCH_CONE     = Math.PI/5; // (36°) cuanto se puede desviar el puño de tu frente hacia la mira

const KICK_DURATION       = 0.26;
const KICK_ACTIVE_T       = 0.12;
const KICK_REACH          = 50;
const KICK_RADIUS         = 19;
const KICK_DAMAGE         = 14;
const KICK_IMPULSE_GROUND = 340; // patada parado: empuje notablemente mayor que el puñetazo
const KICK_IMPULSE_AIR    = 400; // patada en el aire: un poco mas fuerte todavia (nada exagerado)
const KICK_CONE_GROUND    = Math.PI/5; // parado, la patada tambien va bastante de frente

// aplica el impulso de un golpe: empuja en la direccion del golpe, PERO nunca hacia arriba
// (dirY negativo = arriba en pantalla). Asi los golpes no sirven para volar a puro combo:
// si pegas hacia abajo o al costado, empuja normal; si el golpe apunta para arriba, esa parte
// del empuje simplemente no se aplica
function applyAttackImpulse(dirX, dirY, impulse){
  player.vx += dirX*impulse;
  if(dirY > 0) player.vy += dirY*impulse;
}

// arranca un puñetazo o una patada apuntando hacia el mouse: el puñetazo y la patada parada
// van sobre todo al frente (solo se desvian un poco hacia la mira, dentro de un cono angosto),
// mientras que la patada en el aire va de lleno hacia donde apuntes, sin ceñirse al frente
// devuelve true si el golpe realmente arranco, false si no (clingeado, volteretiando, o
// controlState especial) -- el mousedown usa este valor para saber si el click "se gasto" en
// un puñetazo/patada o si, al no poder pegar, debe caer a lanzar telaraña como un click normal
function startAttack(type){
  if(player.clinging || player.vaulting || controlState !== 'normal') return false;

  const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
  const mouseAngle = Math.atan2(worldY - player.y, worldX - player.x);
  const side = worldX >= player.x ? 1 : -1;
  const faceAngle = side === 1 ? 0 : Math.PI;
  const aerial = !player.grounded;

  let aimAngle, impulse, dur, activeAt, reach, radius, damage;

  if(type === 'punch'){
    const dev = Math.max(-PUNCH_CONE, Math.min(PUNCH_CONE, angleDiff(faceAngle, mouseAngle)));
    aimAngle = faceAngle + dev;
    impulse = PUNCH_IMPULSE;
    dur = PUNCH_DURATION; activeAt = PUNCH_ACTIVE_T;
    reach = PUNCH_REACH; radius = PUNCH_RADIUS; damage = PUNCH_DAMAGE;
  } else {
    dur = KICK_DURATION; activeAt = KICK_ACTIVE_T;
    reach = KICK_REACH; radius = KICK_RADIUS; damage = KICK_DAMAGE;
    if(aerial){
      aimAngle = mouseAngle; // en el aire, la patada sigue de lleno al puntero
      impulse = KICK_IMPULSE_AIR;
    } else {
      const dev = Math.max(-KICK_CONE_GROUND, Math.min(KICK_CONE_GROUND, angleDiff(faceAngle, mouseAngle)));
      aimAngle = faceAngle + dev;
      impulse = KICK_IMPULSE_GROUND;
    }
  }

  const dirX = Math.cos(aimAngle), dirY = Math.sin(aimAngle);

  player.attacking = {type, t:0, dur, activeAt, hit:false, dirX, dirY, reach, radius, damage, side};

  // el golpe empuja un poco al jugador en su propia direccion (retroceso/impulso de impacto),
  // pero nunca hacia arriba (ver applyAttackImpulse): asi no se puede usar puños/patadas para
  // ganar altura gratis
  applyAttackImpulse(dirX, dirY, impulse);

  player.running = false;
  return true;
}

// avanza la animacion del golpe en curso y dispara la hitbox una sola vez, justo en el
// instante "activo" de la animacion (no en todo momento, como un golpe de verdad). El motor
// principal (spiderswing.html) la llama una vez por frame dentro de su loop de update, como
// cualquier otro sistema -- no hace falta que este archivo se enganche solo a nada
function updateAttack(dt){
  const a = player.attacking;
  if(!a) return;
  a.t += dt;
  if(!a.hit && a.t >= a.activeAt){
    a.hit = true;
    dealDamageAlongReach(player.x, player.y, a.dirX, a.dirY, a.reach, a.radius, a.damage, a.dirX*260, a.dirY*260);
  }
  if(a.t >= a.dur) player.attacking = null;
}
