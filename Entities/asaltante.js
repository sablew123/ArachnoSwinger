// ============================================================================
//  entities/asaltante.js
// ----------------------------------------------------------------------------
//  Asaltante: un villano callejero menor que usa 'civil' (civiles.js) como
//  base, igual que hace jaryman.js con Jary Mane -- pero a diferencia de JM,
//  este NO es invulnerable (se le puede pegar) y tiene su propia IA de calle:
//  en vez de caminar/pausar/charlar como cualquier civil, busca al civil mas
//  cercano, se le acerca caminando y lo golpea; despues huye corriendo.
//
//  Como su IA (buscar blanco, acercarse, golpear, huir) es bien distinta a la
//  de un civil comun, este archivo NO reutiliza el onUpdate de civiles.js
//  (esta atado por closure a su propia fisica/estados privados) -- reimplementa
//  su propia fisica (gravedad + calle + plataformas, calcada de la de civiles.js)
//  y sus propios estados de "muerto"/"cargado"/"cayendo"/etc., pero SI reutiliza
//  el dibujo de civiles.js tal cual (mismo monigote, misma animacion de muerte,
//  mismo abrazo) porque todos esos estados comparten los mismos nombres de
//  campo (state, deadTimer, hugSlot, trembleCycle, etc.) -- solo le agregamos
//  un gorrito encima, como jaryman.js le agrega el pelo a JM.
//
//  Aparece con poca probabilidad al cargar un chunk (no en todos, a diferencia
//  de los civiles comunes) y su persistencia por chunk es la MISMA idea que la
//  de Jary Mane: si se descarga el chunk en el que esta parado, no muere, queda
//  "congelado" en esa posicion, y reaparece ahi mismo cuando el chunk se vuelve
//  a cargar. La UNICA forma de que un chunk se quede sin su asaltante para
//  siempre es que muera a golpes.
//
//  Ademas trae dos sistemas propios:
//    - el "grito": cuando conecta un golpe, la victima brinca (con la misma
//      fisica de susto que ya usan los civiles) y durante 5 segundos aparece
//      un radar en pantalla (identico en estilo al de Jary Mane) señalando al
//      civil atacado, mientras el civil mismo señala con una flechita hacia
//      donde esta el asaltante en ese momento -- asi no hace falta perseguirlo
//      a ciegas.
//    - la llamada al 911: pulsar 9-1-1 seguido (como codigo, sin espacios de
//      por medio con otras teclas) programa un bus policial distinto (gris
//      oscuro, ventanas blancas en vez de las oscuras de siempre) que cruza,
//      16 segundos despues, el chunk en el que se hizo la llamada -- siempre
//      que ese chunk siga cargado en ese momento. Si en el camino se cruza con
//      un asaltante que el jugador tiene enganchado y colgando quieto de una
//      telaraña (estado 'towed': "cubierto", listo para que se lo lleven), se
//      lo lleva puesto y sigue de largo.
// ============================================================================

(function(){

  // ---------- apariencia: piel al azar (mismo criterio que un civil), ropa SIEMPRE
  // oscura (a diferencia de los civiles, que la sortean de una paleta de colores) ----------
  const SKIN_COLORS = ['#e8b48c', '#c98a5c', '#8d5a3c', '#f0c8a0', '#a9673f'];
  const ASSAILANT_SHIRT_COLOR = '#23262b'; // gris muy oscuro (a efectos practicos, "negro")
  const ASSAILANT_PANTS_COLOR = '#1a1c20';
  const ASSAILANT_CAP_COLOR   = '#141519'; // gorrito, un pelin mas oscuro todavia que la ropa

  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---------- ajustes de aparicion por chunk ----------
  const ASSAILANT_SPAWN_CHANCE = 0.10; // ~1 de cada 10 chunks (subido de 0.08: el armado le resta protagonismo -- ver asaltante-armado.js, que aparece bastante menos -- asi que el comun sube un poco para compensar)

  // ---------- ajustes de movimiento: mismas velocidades que ya usa el resto del juego,
  // segun pide el diseño ("camina como un civil", "corre como camina el prota") ----------
  const ASSAILANT_WALK_SPEED_MIN = 40;   // calcado de CIVIL_WALK_SPEED_MIN en civiles.js
  const ASSAILANT_WALK_SPEED_MAX = 95;   // calcado de CIVIL_WALK_SPEED_MAX en civiles.js
  const ASSAILANT_RUN_SPEED      = (typeof MAX_GROUND_SPEED !== 'undefined') ? MAX_GROUND_SPEED : 320; // tope de velocidad CAMINANDO del propio ArachnoSwinger (MAX_RUN_SPEED es cuando CORRE, ese no)
  const ASSAILANT_ACCEL          = 230;  // un poco mas vivo que el de un civil (220): tiene urgencia, sea acercandose o huyendo

  // ---------- combate ----------
  const ASSAILANT_MAX_HP      = 5;  // igual que un civil (CIVIL_MAX_HP en civiles.js), no 6
  const ASSAILANT_HIT_DAMAGE  = 2;  // FIJO, sea puñetazo (PUNCH_DAMAGE=8) o patada (KICK_DAMAGE=14): se pisa el daño real del motor (ver onDamage)
  // con 5 hp y 2 de daño fijo por golpe: 5 -> 3 -> 1 -> -1. El golpe que lo deja en 1 (no en 0)
  // lo tumba acostado (mismo estado 'lyingDown' que ya usa una caida fuerte, ver onDamage mas
  // abajo) en vez de seguir de pie -- un golpe mas, ahi o despues de que se pare y huya, recien
  // ahi lo termina de verdad (hp<=0, ver onDeath)
  const ASSAILANT_ATTACK_RANGE  = 36;   // que tan cerca del civil tiene que estar para conectar el golpe
  const ASSAILANT_ATTACK_WINDUP = 0.35; // segundos parado, encarando a la victima, antes de que el golpe "conecte"
  const ASSAILANT_HIT_JUMP_VY   = 220;  // impulso del brinco de la victima -- mas chico que el susto normal de los civiles (385): "brinca poco"
  const ASSAILANT_FLEE_MIN_DURATION = 4;   // segundos minimos huyendo, sea porque golpeo y corre, o porque lo golpearon a EL
  const ASSAILANT_SEARCH_RADIUS     = 900; // no persigue a un civil si esta mas lejos que esto

  // ---------- fisica propia: gravedad + calle + techos/balcones -- calcada de civiles.js
  // (physicsStep), duplicada aca porque es privada a ese archivo y moveType:'custom' exige
  // que cada tipo se haga cargo de su propia fisica (ver registerEntityType en el motor) ----------
  const ASSAILANT_GRAVITY      = GRAVITY * 0.55;
  const ASSAILANT_TERMINAL_VY  = 620;
  const ASSAILANT_HIT_RADIUS   = (ENTITY_TYPES['civil'] && ENTITY_TYPES['civil'].hitRadius) || 14;

  // ---------- "muerto": misma duracion total que DEAD_TIP_DURATION+DEAD_FADE_DURATION en
  // civiles.js (0.45+0.6) -- drawDeadCivil (que reutilizamos via civilDraw) calcula el
  // tumbado/desvanecido con SUS PROPIAS constantes privadas, asi que esto solo necesita
  // alcanzar para no cortar la animacion a mitad de camino ----------
  const ASSAILANT_DEAD_TOTAL_DURATION = 1.05;
  const ASSAILANT_LIE_DURATION        = 1.1;  // igual a KNOCKED_LIE_DURATION en civiles.js
  const ASSAILANT_DROP_HOLD_TIME      = 3;    // igual a DROP_HOLD_TIME en civiles.js
  const CATCH_RADIUS                  = 34;   // igual a CATCH_RADIUS en civiles.js: que tan cerca hace falta llegar, colgando, para completar el abrazo

  // ---------- "cubierto" con un telarañazo SUELTO (sin anclaje) -- mismo mecanismo que el civil
  // "envuelto" de civiles.js (WEB_HIT_KNOCKBACK_*/WRAP_* alla, el onWebProjectileHit que
  // heredamos tal cual via el Object.assign de mas abajo lo dispara solo), calcado aca porque
  // updateWrapped/findFacadeHit/etc. son privados a ESE closure y moveType:'custom' exige que
  // cada tipo se haga cargo de su propia fisica de principio a fin, igual que ya hacemos con
  // physicsStep mas arriba ----------
  const ASSAILANT_WRAP_MELT_TIME     = 15;  // igual a WRAP_MELT_TIME en civiles.js: cuanto tarda la telaraña en derretirse
  const ASSAILANT_FACADE_HIT_Y_MARGIN = 10; // igual a FACADE_HIT_Y_MARGIN en civiles.js
  // el envoltorio amortigua el golpe de caida, igual que WRAP_FALL_DAMAGE_DAMPING en civiles.js
  const ASSAILANT_WRAP_FALL_DAMAGE_DAMPING = 0.35;

  // ---------- daño de caida: calcado 1 a 1 de CIVIL_FALL_DAMAGE_MIN_SPEED/applyFallDamage en
  // civiles.js (mismos 5 hp, misma escala 0..letal). Antes el asaltante no tenia daño de caida
  // (a proposito, "mas simple que un civil") pero eso lo dejaba invulnerable a que lo tiraras de
  // un techo -- ahora SI lo tiene, para que sea una forma valida de bajarlo como a cualquier otro ----------
  const ASSAILANT_FALL_DAMAGE_MIN_SPEED = 430; // igual a CIVIL_FALL_DAMAGE_MIN_SPEED: el saltito nunca duele
  const ASSAILANT_FALL_DAMAGE_MAX_HP = ASSAILANT_MAX_HP; // a velocidad terminal, el golpe es letal

  function applyFallDamage(e, impactSpeed){
    if(e.dying || e.state === 'dead') return;
    if(impactSpeed < ASSAILANT_FALL_DAMAGE_MIN_SPEED) return; // caida chica: sin daño
    const t = Math.min(1, (impactSpeed - ASSAILANT_FALL_DAMAGE_MIN_SPEED) / (ASSAILANT_TERMINAL_VY - ASSAILANT_FALL_DAMAGE_MIN_SPEED));
    const dmg = t * ASSAILANT_FALL_DAMAGE_MAX_HP;
    if(dmg <= 0) return;
    e.hp -= dmg;
    // si esto lo deja en hp<=0, el motor (updateEntities) lo detecta solo y llama a onDeath, igual
    // que con un golpe normal
  }

  function physicsStep(e, dt){
    const wasGrounded = e.grounded;
    const prevBottom = e.y + e.hitRadius;
    e.vy += ASSAILANT_GRAVITY*dt;
    if(e.vy > ASSAILANT_TERMINAL_VY) e.vy = ASSAILANT_TERMINAL_VY;
    const impactVy = e.vy; // velocidad de ESTE frame: si aterriza ahora, es esta la que lo golpeo
    e.y += e.vy*dt;
    e.x += e.vx*dt;
    e.grounded = false;
    e.standingPlatform = null;

    if(e.vy >= 0){
      for(const plat of platforms){
        const withinX = e.x + e.hitRadius > plat.x && e.x - e.hitRadius < plat.x + plat.w;
        if(withinX && prevBottom <= plat.y + 2 && e.y + e.hitRadius >= plat.y){
          e.y = plat.y - e.hitRadius;
          e.vy = 0;
          e.grounded = true;
          e.standingPlatform = plat;
          break;
        }
      }
    }

    if(!e.grounded && e.y + e.hitRadius >= STREET_Y){
      e.y = STREET_Y - e.hitRadius;
      e.vy = 0;
      e.grounded = true;
      e.standingPlatform = null;
    }

    if(e.grounded && !wasGrounded) applyFallDamage(e, impactVy);
  }

  // se llama cuadro a cuadro mientras e.state === 'wrapped': reparte segun la sub-fase actual --
  // calcado 1 a 1 de updateWrapped en civiles.js
  function updateWrapped(e, dt){
    if(e.wrapPhase === 'stuck'){ updateWrappedStuck(e, dt); return; }
    if(e.wrapPhase === 'resting'){ updateWrappedResting(e, dt); return; }
    updateWrappedFlying(e, dt);
  }

  // volando por el impulso del telarañazo: misma gravedad+colision de calle/plataformas que el
  // resto de physicsStep, pero chequeando ADEMAS si en el camino se estampa contra la fachada de
  // un edificio antes de llegar a tocar el piso -- calcado de updateWrappedFlying en civiles.js,
  // daño de caida amortiguado incluido (ver ASSAILANT_WRAP_FALL_DAMAGE_DAMPING)
  function updateWrappedFlying(e, dt){
    const prevY = e.y;
    e.vy += ASSAILANT_GRAVITY*dt;
    if(e.vy > ASSAILANT_TERMINAL_VY) e.vy = ASSAILANT_TERMINAL_VY;
    const impactVy = e.vy;
    e.x += e.vx*dt;
    e.y += e.vy*dt;

    const hitBuilding = findFacadeHit(e.x, e.y, e.hitRadius);
    if(hitBuilding){ stickToBuilding(e, hitBuilding); return; }

    e.grounded = false;
    e.standingPlatform = null;
    if(e.vy >= 0){
      for(const plat of platforms){
        const withinX = e.x + e.hitRadius > plat.x && e.x - e.hitRadius < plat.x + plat.w;
        if(withinX && prevY + e.hitRadius <= plat.y + 2 && e.y + e.hitRadius >= plat.y){
          e.y = plat.y - e.hitRadius;
          e.vy = 0;
          e.grounded = true;
          e.standingPlatform = plat;
          break;
        }
      }
    }
    if(!e.grounded && e.y + e.hitRadius >= STREET_Y){
      e.y = STREET_Y - e.hitRadius;
      e.vy = 0;
      e.grounded = true;
      e.standingPlatform = null;
    }

    if(e.grounded){
      e.vx = 0;
      // no aterrizo contra una fachada sino en el piso: el envoltorio amortigua el golpe (misma
      // idea que WRAP_FALL_DAMAGE_DAMPING en civiles.js)
      applyFallDamage(e, impactVy * ASSAILANT_WRAP_FALL_DAMAGE_DAMPING);
      if(e.hp > 0) enterWrappedResting(e); // si el golpe (ya amortiguado) lo mato, que muera normal
    }
  }

  // busca un edificio cuya FACHADA (no el techo) este en este punto -- calcado de findFacadeHit
  // en civiles.js (privada alla, asi que la reimplementamos aca)
  function findFacadeHit(x, y, r){
    for(const b of buildings){
      if(x + r <= b.x || x - r >= b.x + b.w) continue;
      if(y + r <= b.y + ASSAILANT_FACADE_HIT_Y_MARGIN) continue; // apenas raspando el techo: eso es un aterrizaje normal
      if(y - r >= STREET_Y) continue; // ya a la altura de la calle, no de la fachada
      return b;
    }
    return null;
  }

  function stickToBuilding(e, b){
    e.wrapPhase = 'stuck';
    e.stuckBuilding = b;
    e.vx = 0; e.vy = 0;
    e.grounded = false;
    e.standingPlatform = null;
    e.wrapTimer = ASSAILANT_WRAP_MELT_TIME;
  }

  // pegado a una fachada, congelado, ignorando la gravedad -- hasta que se derrita la telaraña
  function updateWrappedStuck(e, dt){
    e.wrapTimer -= dt;
    if(e.wrapTimer <= 0) unwrapEntity(e);
  }

  function enterWrappedResting(e){
    e.wrapPhase = 'resting';
    e.wrapTimer = ASSAILANT_WRAP_MELT_TIME;
    e.vx = 0;
  }

  // tirado/parado tieso donde aterrizo (no contra una fachada), quieto hasta que se derrita la
  // telaraña
  function updateWrappedResting(e, dt){
    e.vx = 0;
    e.wrapTimer -= dt;
    if(e.wrapTimer <= 0) unwrapEntity(e);
  }

  // se derritio la telaraña (o lo sacaron antes de tiempo con un jalon nuevo -- ver el chequeo de
  // towedNow en onUpdate, que corta a 'towed' ANTES de siquiera llegar a updateWrapped): vuelve a
  // la normalidad. Reiniciamos _huntState a 'hunting' a proposito: que retome la busqueda de cero
  // en vez de quedarse con un blanco/estado viejo de antes de quedar envuelto
  function unwrapEntity(e){
    e.wrapPhase = null;
    e.stuckBuilding = null;
    e._huntState = 'hunting';
    e._attackTarget = null;
    if(e.grounded){
      // igual que updateFalling unas lineas mas abajo: si quedo parado sobre un techo/balcon,
      // temblando ahi (enterStranded) en vez de retomar la caminata/caceria de una -- antes esto
      // ignoraba standingPlatform y lo mandaba derecho a 'walking' aunque estuviera en una cornisa
      if(e.standingPlatform) enterStranded(e);
      else e.state = 'walking';
    } else {
      e.state = 'falling';
      e.vx = 0; e.vy = 0;
    }
  }

  // ---------- IA propia: buscar / golpear / huir ----------
  function accelerateTo(e, targetVx, dt){
    const diff = targetVx - e.vx;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), ASSAILANT_ACCEL*dt);
    e.vx += step;
  }

  function updateFacingAndWalkCycle(e, vx, dt){
    if(Math.abs(vx) > 5) e.facing = vx > 0 ? 1 : -1;
    if(e.grounded && Math.abs(vx) > 15) e.walkCycle += Math.abs(vx)*dt*0.08;
  }

  // el civil mas cercano que este en condiciones de ser un blanco valido: vivo, en la calle,
  // parado en sus dos pies (no cargado/enganchado/en pleno susto ajeno) -- deliberadamente solo
  // type 'civil' (Jary Mane, type 'jaryman', queda afuera: no hace falta para el diseño pedido)
  function findNearestCivil(e){
    let best = null, bestD = ASSAILANT_SEARCH_RADIUS;
    for(const other of entities){
      if(other.type !== 'civil' || other.dead) continue;
      if(other.carried || other.beingReeled || other.state === 'towed') continue;
      if(other.state !== 'walking' && other.state !== 'chatting' && other.state !== 'gathering') continue;
      if(!other.grounded || other.standingPlatform) continue;
      const d = Math.abs(other.x - e.x);
      if(d < bestD){ bestD = d; best = other; }
    }
    return best;
  }

  function landAttack(e){
    const target = e._attackTarget;
    e._huntState = 'fleeing';
    e._fleeTimer = ASSAILANT_FLEE_MIN_DURATION;
    e._attackTarget = null;
    if(!target || target.dead || target.carried || target.state === 'towed') return; // se escapo/desaparecio antes de que conectara: igual huye, como si hubiera fallado

    // el golpe conecta: pierde una vida. Se pisa el hp directo (igual que applyFallDamage en
    // civiles.js) porque los civiles son def.invulnerable=true contra dealDamageAt -- esto es lo
    // mismo que ya usa el propio motor para el daño de caida, no un agujero nuevo
    target.hp -= 1;

    // brinca poco, alejandose del asaltante: reusamos el MISMO mecanismo que el susto por
    // aterrizaje fuerte de un civil (scaredJump -> gathering, ver civiles.js) con un impulso mas
    // chico -- la fisica de ESE civil (su propio onUpdate, no el nuestro) hace el resto solita
    const side = target.x < e.x ? -1 : 1;
    target.vx = side * (50 + Math.random()*30);
    target.vy = -ASSAILANT_HIT_JUMP_VY;
    target.grounded = false;
    target.facing = side;
    target.state = 'scaredJump';

    addWitness(target, e);
  }

  function updateHunting(e, dt){
    if(!e._huntState) e._huntState = 'hunting';

    if(e._huntState === 'attacking'){
      e.vx = 0;
      e._attackTimer -= dt;
      if(e._attackTimer <= 0) landAttack(e);
      updateFacingAndWalkCycle(e, 0, dt);
      return;
    }

    if(e._huntState === 'fleeing'){
      e._fleeTimer -= dt;
      // huye siempre alejandose del JUGADOR (no del civil), recalculando el rumbo cada cuadro --
      // asi corrige el camino solo si el jugador le corta el paso en vez de perseguirlo por atras
      const dir = e.x < player.x ? -1 : 1;
      accelerateTo(e, dir*ASSAILANT_RUN_SPEED, dt);
      updateFacingAndWalkCycle(e, e.vx, dt);
      if(e._fleeTimer <= 0) e._huntState = 'hunting'; // se sintio a salvo: vuelve a buscar a quien asaltar
      return;
    }

    // 'hunting': busca al civil vivo mas cercano y camina hacia el
    const target = findNearestCivil(e);
    if(!target){
      e.vx *= 0.8; // sin nadie a quien perseguir por ahora: se va frenando y queda parado, pendiente
      updateFacingAndWalkCycle(e, e.vx, dt);
      return;
    }

    const dx = target.x - e.x;
    if(Math.abs(dx) <= ASSAILANT_ATTACK_RANGE){
      e._huntState = 'attacking';
      e._attackTimer = ASSAILANT_ATTACK_WINDUP;
      e._attackTarget = target;
      e.facing = dx >= 0 ? 1 : -1;
      e.vx = 0;
      return;
    }

    const dir = dx >= 0 ? 1 : -1;
    accelerateTo(e, dir*(e._walkSpeed || ASSAILANT_WALK_SPEED_MIN), dt);
    updateFacingAndWalkCycle(e, e.vx, dt);
  }

  // ---------- estados compartidos con un civil (fisica propia, pero mismos nombres de campo que
  // usa civilDraw para dibujarlos) ----------
  function enterStranded(e){
    e.state = 'strandedOnRoof';
    e.vx = 0;
    e.trembleCycle = Math.random()*Math.PI*2;
  }
  function updateStranded(e, dt){
    e.vx = 0;
    e.trembleCycle += dt*14;
  }
  // permanent=true (usado solo desde onDamage, al llegar a 1 hp): se queda tirado PARA SIEMPRE,
  // no se levanta solo -- es justo el punto: que quede ahi tirado listo para que la policia lo
  // agarre sin lio (o para que lo termines de un golpe mas, o lo engancharlo/envolverlo, lo que
  // sea -- el chequeo de towedNow en onUpdate corre ANTES que este estado, asi que igual lo podes
  // sacar de aca enganchandolo con la telaraña como a cualquier otro). El caso normal (sin
  // permanent, desde una caida fuerte tras un rodada mientras lo llevabas encima -- ver
  // updateFalling/knockedOnLand mas abajo) sigue siendo temporal, como en un civil comun.
  function enterLyingDown(e, permanent){
    e.state = 'lyingDown';
    e.vx = 0;
    e.downedForGood = !!permanent;
    e.lieTimer = ASSAILANT_LIE_DURATION;
  }
  function updateLyingDown(e, dt){
    if(e.downedForGood) return; // tirado para siempre: no cuenta el timer, no se levanta solo
    e.lieTimer -= dt;
    if(e.lieTimer <= 0) e.state = 'walking';
  }
  function updateFalling(e, dt){
    if(e.grounded){
      if(e.standingPlatform) enterStranded(e);
      else if(e.knockedOnLand){ e.knockedOnLand = false; enterLyingDown(e); }
      else e.state = 'walking';
    }
  }
  function updateHugging(e, dt){
    const touchingSomethingElse = keys.a || keys.d || keys.w || keys.s || pressed.left || pressed.right;
    if(player.grounded && keys.midMouse && !touchingSomethingElse) e.dropHoldTimer = (e.dropHoldTimer||0) + dt;
    else e.dropHoldTimer = 0;
    if(e.dropHoldTimer >= ASSAILANT_DROP_HOLD_TIME) window.dropCivil(e, {voluntary: true});
  }

  // colgando de una telaraña, sin abrazar todavia (estado 'towed'): en cuanto llega lo bastante
  // cerca del jugador, el abrazo se completa solo -- misma idea que tryCatchTowedCivil en
  // civiles.js (privada ahi, asi que la reimplementamos aca)
  function tryCatchTowed(e){
    const dx = player.x - e.x, dy = player.y - e.y;
    if(dx*dx + dy*dy > CATCH_RADIUS*CATCH_RADIUS) return;

    const group = e.def.carryGroup || e.type; // 'civil' (heredado del clon): cuenta para el mismo tope de 4 que cualquier civil
    const carriedNow = entities.filter(en => (en.def.carryGroup || en.type) === group && en.carried).length;
    const limit = e.def.carryLimit;
    if(limit !== undefined && carriedNow >= limit) return;

    for(const hand of ['left','right']){
      const w = webs[hand];
      if(w && w.state === 'attached' && w.entity === e) detachIfAttached(hand);
    }
    e.state = 'hugging';
    e.carried = true;
    e.vx = 0; e.vy = 0;
    e.dropHoldTimer = 0;
    e.hugSlot = Math.min(carriedNow, 3); // 3 = HUG_SLOTS.length-1 en civiles.js (4 lugares fijos, 0..3)
  }

  // ---------- muerte: mismo estilo "bloque rojo tumbandose de costado" que un civil (reutilizado
  // via civilDraw, ver draw() mas abajo), reimplementado aca a mano porque updateDead es privada
  // de civiles.js ----------
  function onDeath(e){
    if(e.dying){ e.dead = false; return; }
    e.dying = true;
    e.dead = false;
    e.carried = false;
    e.state = 'dead';
    e.deadTimer = 0;
    e.deadSide = Math.random() < 0.5 ? -1 : 1;
    e.vx = e.deadSide * (30 + Math.random()*25);
    e.vy = 0;

    // se borra la entrada entera (no se marca "defeated"): el chunk queda libre para volver a
    // sortear un asaltante nuevo la proxima vez que se cargue
    assailantChunkState.delete(e._homeChunkIndex);

    pushAssailantMessage('Un Asaltante ha muerto');
  }
  function updateDead(e, dt){
    e.deadTimer += dt;
    if(e.deadTimer >= ASSAILANT_DEAD_TOTAL_DURATION){ e.dead = true; return; }
    e.x += e.vx*dt;
    e.vx *= 0.9;
  }

  // recibe daño de puños/patadas (dealDamageAt en el motor, ya que invulnerable:false lo deja
  // pasar): se pisa el daño real (8 del puño / 14 de la patada) por el valor fijo que pide el
  // diseño (2 por golpe, sea cual sea), y cualquier golpe lo asusta y lo hace huir
  function onDamage(en, dmg /*, src */){
    const hpBefore = en.hp;
    en.hp += dmg;                    // cancela el `en.hp -= dmg` que dealDamageAt va a hacer JUSTO despues de este hook
    en.hp -= ASSAILANT_HIT_DAMAGE;   // nuestro propio valor fijo
    en._huntState = 'fleeing';
    en._fleeTimer = Math.max(en._fleeTimer || 0, ASSAILANT_FLEE_MIN_DURATION);

    // a una vida (el golpe que lo deja en 1 hp, NO en 0 o menos): en vez de seguir de pie, cae
    // acostado PARA SIEMPRE -- reusamos el mismo estado 'lyingDown' que ya dispara una caida
    // fuerte contra el piso (ver updateFalling/enterLyingDown mas arriba), pero con permanent=true:
    // no se levanta solo, se queda ahi tirado listo para que la policia lo agarre sin lio (o para
    // que lo termines de un golpe mas). Si el golpe lo manda directo a 0 o menos, no hace falta
    // nada aca: eso ya lo resuelve onDeath solo (hp<=0, chequeado por el motor un poco despues de
    // este hook). Tampoco pisamos un estado "raro" en el que ya podria estar (colgando, envuelto,
    // siendo abrazado, ya acostado, etc.)
    const hpAfter = hpBefore - ASSAILANT_HIT_DAMAGE;
    if(hpAfter > 0 && hpAfter <= 1 &&
       en.state !== 'dead' && en.state !== 'hugging' && en.state !== 'towed' &&
       en.state !== 'wrapped' && en.state !== 'lyingDown'){
      enterLyingDown(en, true);
    }
  }

  // ---------- onUpdate: misma estructura de dispatch que civiles.js (dead / hugging / towed /
  // fisica + falling/lyingDown/strandedOnRoof / caso por defecto), pero el caso por defecto es
  // NUESTRA IA (updateHunting) en vez de la caminata al azar de un civil comun ----------
  function onUpdate(e, dt){
    if(e.state === 'dead'){ updateDead(e, dt); return; }
    if(e.state === 'hugging'){ updateHugging(e, dt); return; }

    const towedNow = (webs.left  && webs.left.state  === 'attached' && webs.left.entity  === e) ||
                      (webs.right && webs.right.state === 'attached' && webs.right.entity === e);
    if(towedNow && e.state !== 'towed'){
      e.state = 'towed';
      e.vx = 0; e.vy = 0;
    } else if(!towedNow && e.state === 'towed'){
      if(e.grounded && e.standingPlatform) enterStranded(e);
      else if(e.grounded) e.state = 'walking';
      else e.state = 'falling';
    }

    // "cubierto" con un telarañazo suelto (heredado tal cual de civiles.js via el onWebProjectileHit
    // que trae el Object.assign de mas abajo, asi que esto YA se disparaba solo -- lo que faltaba
    // era este corte): usa su PROPIA fisica de vuelo/pegado/tirado en vez de la generica de mas
    // abajo, asi que corta aca y no llega ni a physicsStep ni a updateHunting. SIN este chequeo,
    // el asaltante seguia con su IA de caza (caminando/atacando/huyendo) encima de la telaraña que
    // lo estaba envolviendo, como si no estuviera pasando nada -- este era el bug.
    if(e.state === 'wrapped'){ updateWrapped(e, dt); return; }

    physicsStep(e, dt);

    if(e.state === 'towed'){ tryCatchTowed(e); return; }
    if(e.state === 'falling'){ updateFalling(e, dt); return; }
    if(e.state === 'lyingDown'){ updateLyingDown(e, dt); return; }
    if(e.state === 'strandedOnRoof'){ updateStranded(e, dt); return; }

    // caso por defecto ('walking', igual que en un civil -- asi civilDraw sigue animando las
    // piernas de la caminata normalmente): aca es donde vive TODA nuestra IA propia
    updateHunting(e, dt);
  }

  // ---------- registro del tipo: clona 'civil' entero (misma fisica DE ORIGEN documentada arriba
  // en el dibujo, mismo webAttachable/huggable/carryGroup/carryLimit) y pisa lo que lo hace
  // distinto: vida, si es golpeable, apariencia, y toda la logica de update/daño/muerte/dibujo ----------
  const civilDef = ENTITY_TYPES['civil'];
  if(!civilDef){
    console.warn('asaltante.js: no se encontro el tipo "civil" -- revisa que civiles.js este ANTES que asaltante.js en entities/manifest.js');
  } else {
    const civilDraw = civilDef.draw;

    registerEntityType('asaltante', Object.assign({}, civilDef, {
      hp: ASSAILANT_MAX_HP,
      invulnerable: false, // a diferencia de un civil comun: ESTE si se le puede pegar
      onDamage,
      onDeath,
      onUpdate,

      onSpawn(e){
        e.skinColor  = e.skinColor  || pickRandom(SKIN_COLORS);
        e.shirtColor = ASSAILANT_SHIRT_COLOR; // fijo, no al azar: "ropa toda negra"
        e.pantsColor = ASSAILANT_PANTS_COLOR;

        e.weightKg    = e.weightKg || (55 + Math.random()*35);
        e.carryWeight = e.weightKg / (window.PLAYER_REFERENCE_WEIGHT_KG || 75);

        e.state = 'walking';
        e.walkCycle = Math.random()*Math.PI*2;
        e.facing = Math.random() < 0.5 ? -1 : 1;
        e.dropHoldTimer = 0;
        e.downedForGood = false;

        e._huntState  = 'hunting';
        e._walkSpeed  = ASSAILANT_WALK_SPEED_MIN + Math.random()*(ASSAILANT_WALK_SPEED_MAX - ASSAILANT_WALK_SPEED_MIN);
        e._fleeTimer  = 0;
      },

      draw(ctx, e){
        civilDraw(ctx, e); // mismo cuerpo/animacion que un civil (caminando, abrazado, muerto, tirado, tembloroso arriba de un techo)
        if(e.state !== 'dead' && e.state !== 'lyingDown') drawCap(ctx, e);
      }
    }));
  }

  // gorrito oscuro cubriendo la cabeza: mismo sistema de coordenadas que usa drawCivil para la
  // cabeza (centro local (0,-10), radio 5, dentro de translate(e.x,e.y)+rotate(e.rotation||0))
  function drawCap(ctx, e){
    ctx.save();
    let tx = e.x, ty = e.y;
    if(e.state === 'strandedOnRoof'){
      tx += Math.sin(e.trembleCycle*1.7)*1.2;
      ty += Math.cos(e.trembleCycle*2.3)*0.6;
    }
    ctx.translate(tx, ty);
    ctx.rotate(e.rotation || 0);

    ctx.fillStyle = ASSAILANT_CAP_COLOR;
    ctx.beginPath();
    ctx.arc(0, -10.5, 5.8, Math.PI*0.95, Math.PI*2.05);
    ctx.fill();
    // visera chica
    ctx.beginPath();
    ctx.ellipse(3.4, -8.6, 3, 1.6, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- spawn por chunk + persistencia "congelada" igual que Jary Mane, pero UNA instancia
  // propia POR CHUNK (no una unica global): mientras un chunk tiene un asaltante vivo (o congelado,
  // suspended, esperando a que el jugador vuelva) esa instancia se conserva tal cual. Pero a
  // diferencia de antes, un chunk YA NO queda "sin asaltante para siempre" apenas se resuelve: en
  // cuanto se lo derrota (a golpes, onDeath) o se lo lleva la policia (mas abajo), se borra la
  // entrada del mapa entera, asi que la proxima vez que el chunk se cargue se vuelve a sortear de
  // cero y puede tocarle uno nuevo ----------
  const assailantChunkState = new Map(); // chunkIndex -> {suspended, entity, x, y}

  window.CHUNK_LOAD_LISTENERS.push(function(chunkIndex, startX, endX, rng){
    if(!civilDef) return; // el tipo no llego a registrarse: no hay nada que aparecer

    let st = assailantChunkState.get(chunkIndex);
    if(!st){
      // no hay entrada: o nunca le toco, o le toco y ya se resolvio -- en cualquier caso se tira
      // la moneda de nuevo con el rng propio de este chunk
      const roll = rng();
      if(roll >= ASSAILANT_SPAWN_CHANCE) return; // no le toco esta vez -- no se guarda nada, asi se
                                                  // vuelve a sortear la proxima vez que el chunk cargue
      const x = startX + 80 + rng()*(endX - startX - 160);
      st = {suspended: false, entity: null, x, y: STREET_Y - ASSAILANT_HIT_RADIUS};
      assailantChunkState.set(chunkIndex, st);
    }

    if(st.entity && !st.entity.dead) return; // ya esta vivo en este mismo chunk (no deberia pasar, pero por las dudas)

    const e = spawnEntity('asaltante', st.x, st.y);
    if(e){
      st.entity = e;
      st.suspended = false;
      e._homeChunkIndex = chunkIndex; // para que onDeath sepa a que entrada del mapa avisarle
    }
  });

  window.CHUNK_UNLOAD_LISTENERS.push(function(chunkIndex){
    // OJO: NO usamos assailantChunkState.get(chunkIndex) aca. Ese Map esta indexado por el chunk
    // de NACIMIENTO del asaltante, pero un asaltante que ya recibio un golpe huye corriendo
    // (ASSAILANT_FLEE_MIN_DURATION a velocidad de carrera) antes de que caiga el golpe que lo dejo
    // "a una vida" -- para cuando eso pasa, bien puede estar parado en un chunk vecino, no en el de
    // origen. Si buscaramos solo por chunkIndex==home, el dia que se descargue justo el chunk de
    // origen (que ya no es donde esta parado) no habria coincidencia de posicion y no pasaria nada;
    // y el dia que se descargue el chunk donde REALMENTE esta, esa descarga no tiene entrada propia
    // en el Map (esta guardado bajo la llave del chunk de origen) y tampoco se lo encontraria.
    // Por eso recorremos TODAS las entradas y nos fijamos, para cada una, si su entidad viva esta
    // parada AHORA MISMO en el chunk que se esta por descargar -- sin importar cual sea su chunk
    // de nacimiento.
    for(const [key, st] of assailantChunkState.entries()){
      if(!st.entity || st.entity.dead) continue;
      const e = st.entity;
      // si el jugador se lo esta llevando (abrazado, enganchado con la telaraña, o siendo
      // reelBehavior-ado por otra cosa) no lo congelamos aunque su chunk actual quede atras:
      // sigue vivo pegado al jugador, igual que con Jary Mane
      if(e.carried || e.beingReeled || e.state === 'towed') continue;
      // solo nos importa si esta parado AHORA en el chunk que se esta descargando
      if(Math.floor(e.x / CHUNK_WIDTH) !== chunkIndex) continue;

      // si lo dejas ACOSTADO (a una vida, tumbado -- ver enterLyingDown en onDamage), ENVUELTO en
      // una telaraña suelta (state 'wrapped'), o TEMBLANDO varado en un techo/balcon (state
      // 'strandedOnRoof' -- ver enterStranded: lo dejaste ahi en vez de en el suelo, asustado y
      // sin poder bajar solo) justo cuando te vas del chunk, Y ADEMAS ya llamaste al 911 en algun
      // momento desde este chunk o alguno de sus 2 vecinos (los "3 chunks cercanos" --
      // calledFromChunks, ver mas abajo en el sistema de 911: no hace falta que el bus haya llegado
      // a pasar, alcanza con haber marcado el numero antes de irte), se interpreta como que la
      // policia -- ya avisada -- lo encontro asi de indefenso y se lo llevo mientras no mirabas: se
      // borra la entrada entera (el chunk queda libre para volver a sortear un asaltante nuevo),
      // IGUAL que si lo hubieras terminado a golpes. SIN la llamada previa, no hay a quien
      // avisarle: se congela tal cual y vuelve a funcionar al recargar, igual que dejarlo
      // deambulando/persiguiendo/huyendo con normalidad
      const chunkHasNearby911Call = calledFromChunks.has(chunkIndex-1) || calledFromChunks.has(chunkIndex) || calledFromChunks.has(chunkIndex+1);
      if((e.state === 'lyingDown' || e.state === 'wrapped' || e.state === 'strandedOnRoof') && chunkHasNearby911Call){
        e.dead = true;
        assailantChunkState.delete(key);
        pushAssailantMessage('La policía se llevó a un asaltante');
        continue;
      }

      st.x = e.x; st.y = e.y;
      st.suspended = true;
      e.dead = true;    // solo lo saca de `entities` -- NO dispara onDeath (eso es solo por hp<=0), asi que no cuenta como derrotado
      st.entity = null;
    }
  });

  window.RESET_LISTENERS.push(function(){
    assailantChunkState.clear();
  });

  // ---------- el "grito": radar en pantalla + flechita del civil apuntando al asaltante,
  // durante los mismos 5 segundos ----------
  const WITNESS_DURATION = 5;
  const ALERT_COLOR = '#ff5b3d';
  let witnesses = []; // {civil, assailant, timer}

  function addWitness(civil, assailant){
    witnesses = witnesses.filter(w => w.civil !== civil); // si ya estaba señalando un asalto viejo, este lo reemplaza
    witnesses.push({civil, assailant, timer: WITNESS_DURATION});
  }

  window.WORLD_UPDATE_LISTENERS.push(function(dt){
    for(let i = witnesses.length-1; i >= 0; i--){
      const w = witnesses[i];
      w.timer -= dt;
      if(w.timer <= 0 || w.civil.dead) witnesses.splice(i, 1);
    }
  });

  window.RESET_LISTENERS.push(function(){ witnesses = []; });

  function isOnScreen(x, y, margin){
    const sx = x - camera.x, sy = y - camera.y;
    return sx > margin && sx < canvas.width - margin && sy > margin && sy < canvas.height - margin;
  }

  // radar de borde de pantalla, identico en estilo al indicador "JM" de jaryman.js, pero
  // apuntando al civil que grito (y solo mientras este fuera de pantalla: si ya se ve, no hace
  // falta señalarlo)
  function drawScreamRadar(ctx, civil){
    const margin = 24;
    if(isOnScreen(civil.x, civil.y, margin)) return;

    const sx = civil.x - camera.x, sy = civil.y - camera.y;
    const cx = canvas.width/2, cy = canvas.height/2;
    const dx = sx - cx, dy = sy - cy;
    const angle = Math.atan2(dy, dx);

    const pad = 46;
    const halfW = canvas.width/2 - pad, halfH = canvas.height/2 - pad;
    const scale = Math.min(halfW/Math.abs(dx || 0.0001), halfH/Math.abs(dy || 0.0001));
    const ix = cx + dx*scale, iy = cy + dy*scale;

    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(20,20,25,0.72)';
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = ALERT_COLOR;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = ALERT_COLOR;
    ctx.beginPath();
    ctx.moveTo(21, 0); ctx.lineTo(11, -6); ctx.lineTo(11, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', ix, iy);
    ctx.restore();
  }

  // flechita flotando sobre la cabeza del civil, apuntando hacia donde esta el asaltante EN ESTE
  // INSTANTE (se recalcula cuadro a cuadro): solo tiene sentido dibujarla si el civil esta a la
  // vista (si no lo esta, ya lo cubre el radar de arriba)
  function drawChasePointer(ctx, civil, assailant){
    const margin = 24;
    if(!isOnScreen(civil.x, civil.y, margin)) return;

    const sx = civil.x - camera.x, sy = civil.y - camera.y - 22;
    const asx = assailant.x - camera.x, asy = assailant.y - camera.y;
    const angle = Math.atan2(asy - sy, asx - sx);

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    ctx.fillStyle = ALERT_COLOR;
    ctx.beginPath();
    ctx.moveTo(9, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  window.HUD_DRAW_LISTENERS.push(function(ctx){
    for(const w of witnesses){
      drawScreamRadar(ctx, w.civil);
      if(w.assailant && !w.assailant.dead) drawChasePointer(ctx, w.civil, w.assailant);
    }
  });

  // ---------- pantalla de alertas propia (mismo estilo que el kill-feed de civiles.js, pero en
  // la esquina inferior DERECHA para no superponerse con el de civiles.js) ----------
  let msgLayer = null;
  function ensureMsgLayer(){
    if(msgLayer) return msgLayer;
    msgLayer = document.createElement('div');
    msgLayer.style.cssText = [
      'position:fixed', 'right:14px', 'bottom:14px',
      'display:flex', 'flex-direction:column-reverse', 'gap:4px',
      'pointer-events:none', 'z-index:9999', 'font-family:monospace'
    ].join(';');
    document.body.appendChild(msgLayer);
    return msgLayer;
  }
  // expuesta globalmente para que asaltante-armado.js reutilice el MISMO feed de mensajes en vez
  // de armar una capa de DOM propia por separado
  window.pushAssailantMessage = function(text){ pushAssailantMessage(text); };
  function pushAssailantMessage(text){
    // mismo contador global que arma civiles.js (window.deathCount), esquina superior
    // izquierda: como asaltante-armado.js reutiliza esta MISMA funcion (via
    // window.pushAssailantMessage) para su propio "ha muerto", con este solo chequeo alcanza
    // para sumar tanto asaltantes normales como armados, sin tocar ese otro archivo
    if(text.indexOf('ha muerto') !== -1) window.deathCount = (window.deathCount || 0) + 1;
    const layer = ensureMsgLayer();
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = [
      'background:rgba(0,0,0,0.55)', 'color:#f2f2ec', 'font-size:14px',
      'padding:5px 10px', 'border-radius:6px', 'border-right:3px solid ' + ALERT_COLOR,
      'box-shadow:0 2px 6px rgba(0,0,0,0.35)',
      'opacity:0', 'transform:translateY(6px)',
      'transition:opacity .25s ease, transform .25s ease'
    ].join(';');
    layer.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    while(layer.children.length > 6) layer.removeChild(layer.firstChild);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, 4000);
  }

  // ---------- 911: 9-1-1 seguidos, como un codigo (misma idea que el 555 de jaryman.js, pero
  // con una secuencia FIJA en vez de la misma tecla tres veces) ----------
  const CALL_DIGITS_WINDOW_MS = 2500; // los 3 digitos tienen que caer dentro de esta ventana
  let digitPresses = [];

  window.addEventListener('keydown', function(ev){
    if(ev.repeat) return;
    if(!/^Digit[0-9]$/.test(ev.code)) return;
    const now = performance.now();
    digitPresses.push({code: ev.code, t: now});
    digitPresses = digitPresses.filter(p => now - p.t <= CALL_DIGITS_WINDOW_MS);
    if(digitPresses.length >= 3){
      const last3 = digitPresses.slice(-3).map(p => p.code).join(',');
      if(last3 === 'Digit9,Digit1,Digit1'){
        digitPresses = [];
        call911();
      }
    }
  });

  const CALL_TO_BUS_DELAY = 16; // segundos
  let pending911Calls = []; // {chunkIndex, timer}

  // registro de "desde que chunk se llamo al 911 alguna vez" -- a diferencia de pending911Calls
  // (que se vacia apenas el bus aparece, o si el chunk se descarga antes de los 16s), este NUNCA
  // se borra solo (solo con un reset de partida entera): lo usa la captura pasiva del
  // CHUNK_UNLOAD_LISTENERS de mas arriba, que necesita saber si "en algun momento, ya se llamo a
  // la policia por esta zona" sin importar si el bus llego a pasar o no
  let calledFromChunks = new Set();
  // se expone tal cual (la referencia al Set, no una copia) para que asaltante-armado.js pueda
  // consultar "ya se llamo a la policia cerca de este chunk" en su propia captura pasiva al
  // descargar chunk, sin duplicar todo el sistema de 911 -- es UNA sola llamada/policia para
  // los dos tipos de asaltante, ver tambien el chequeo de tipo en asaltoBus mas abajo
  window.getAssailant911Chunks = function(){ return calledFromChunks; };

  function call911(){
    if(typeof gameOver !== 'undefined' && gameOver) return;
    const chunkIndex = Math.floor(player.x / CHUNK_WIDTH);
    pending911Calls.push({chunkIndex, timer: CALL_TO_BUS_DELAY});
    calledFromChunks.add(chunkIndex);
    pushAssailantMessage('Llamada al 911 realizada');
  }

  window.WORLD_UPDATE_LISTENERS.push(function(dt){
    for(let i = pending911Calls.length-1; i >= 0; i--){
      const call = pending911Calls[i];
      call.timer -= dt;
      if(call.timer <= 0){
        pending911Calls.splice(i, 1);
        // "si el chunk sigue cargado": si para cuando pasan los 16s ya se descargo, no aparece nada
        if(loadedChunks.has(call.chunkIndex)) spawnPoliceBus(call.chunkIndex);
      }
    }
  });

  window.RESET_LISTENERS.push(function(){
    digitPresses = [];
    pending911Calls = [];
    calledFromChunks.clear();
  });

  // ---------- bus policial: mismo diseño que los buses comunes (cars/spawnCar en el motor), pero
  // gris oscuro con ventanas BLANCAS en vez de las oscuras de siempre -- como esa personalizacion
  // por unidad no se puede lograr con el sistema de `cars` (el dibujo de ventanas ahi es el mismo
  // color fijo para todos), se implementa como una entidad mas, con dibujo 100% propio ----------
  const POLICE_BUS_W = 170, POLICE_BUS_H = 64;
  const POLICE_BUS_SPEED = 90;
  const POLICE_BUS_BODY   = '#3a3a3f';
  const POLICE_BUS_WINDOW = '#f2f2ec';
  const POLICE_BUS_WHEEL_RADIUS = (typeof CAR_WHEEL_RADIUS !== 'undefined') ? CAR_WHEEL_RADIUS : 64*0.2;
  const POLICE_BUS_SPAWN_MARGIN = (typeof CAR_SPAWN_MARGIN !== 'undefined') ? CAR_SPAWN_MARGIN : 500;
  const POLICE_BUS_DESPAWN_DIST = (typeof CAR_DESPAWN_DIST !== 'undefined') ? CAR_DESPAWN_DIST : CHUNK_WIDTH*2;

  function spawnPoliceBus(chunkIndex){
    void chunkIndex; // no hace falta mas que para decidir CUANDO llamar a esta funcion (ver arriba); aparece relativo a la camara, "como los demas"
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x = dir > 0
      ? camera.x - POLICE_BUS_SPAWN_MARGIN - POLICE_BUS_W/2
      : camera.x + canvas.width + POLICE_BUS_SPAWN_MARGIN + POLICE_BUS_W/2;
    const y = STREET_Y - POLICE_BUS_H/2 - POLICE_BUS_WHEEL_RADIUS;
    spawnEntity('asaltoBus', x, y, {_cruiseVx: dir*POLICE_BUS_SPEED});
  }

  registerEntityType('asaltoBus', {
    hp: 9999,
    hitRadius: POLICE_BUS_W/2,
    moveType: 'custom',
    webAttachable: false,
    huggable: false,
    invulnerable: true,
    friendly: true,

    onUpdate(e, dt){
      e.x += (e._cruiseVx || 0)*dt;

      // en el camino, si se cruza con un asaltante "cubierto" -- sea colgando quieto de una
      // telaraña enganchada (estado 'towed', todavia sin abrazar), envuelto por un telarañazo
      // suelto y ya asentado (estado 'wrapped', pegado a una fachada o tirado en el piso --
      // wrapPhase 'stuck'/'resting'; mientras sigue 'flying' por el aire con el impulso del golpe
      // todavia no cuenta, no esta "listo" para que se lo lleven), O tirado a una vida para
      // siempre (estado 'lyingDown' con downedForGood, ver enterLyingDown en onDamage: el mismo
      // estado en el que la captura pasiva de CHUNK_UNLOAD_LISTENERS ya lo reconoce como "listo")
      // -- se lo lleva puesto: el asaltante desaparece y el bus sigue de largo
      for(const other of entities){
        // ambos tipos de asaltante (comun y armado, ver asaltante-armado.js) comparten este mismo
        // bus/sistema de 911 -- no hace falta duplicarlo por tipo, es UNA sola policia para los dos
        if((other.type !== 'asaltante' && other.type !== 'asaltanteArmado') || other.dead) continue;
        const towedReady   = other.state === 'towed';
        const wrappedReady = other.state === 'wrapped' && other.wrapPhase !== 'flying';
        const downedReady  = other.state === 'lyingDown' && other.downedForGood;
        if(!towedReady && !wrappedReady && !downedReady) continue;
        if(Math.abs(other.x - e.x) > POLICE_BUS_W/2) continue;

        for(const hand of ['left','right']){
          const w = webs[hand];
          if(w && w.state === 'attached' && w.entity === other) detachIfAttached(hand);
        }
        other.dead = true;
        pushAssailantMessage('La policía se llevó a un asaltante');
      }

      if(Math.abs(e.x - player.x) > POLICE_BUS_DESPAWN_DIST) e.dead = true;
    },

    draw(ctx, e){
      const x = e.x - POLICE_BUS_W/2, y = e.y - POLICE_BUS_H/2;
      ctx.save();
      ctx.fillStyle = POLICE_BUS_BODY;
      ctx.fillRect(x, y, POLICE_BUS_W, POLICE_BUS_H);

      // ventanas BLANCAS: lo que lo distingue a simple vista de un bus comun (que las tiene oscuras)
      ctx.fillStyle = POLICE_BUS_WINDOW;
      ctx.fillRect(x + POLICE_BUS_W*0.14, y + 6, POLICE_BUS_W*0.72, POLICE_BUS_H*0.34);

      ctx.fillStyle = '#111';
      const wheelR = POLICE_BUS_WHEEL_RADIUS;
      ctx.beginPath(); ctx.arc(x + POLICE_BUS_W*0.22, y + POLICE_BUS_H, wheelR, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + POLICE_BUS_W*0.78, y + POLICE_BUS_H, wheelR, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = '#ffe9a8';
      const headlightX = (e._cruiseVx||0) >= 0 ? x + POLICE_BUS_W - 5 : x;
      ctx.fillRect(headlightX, y + POLICE_BUS_H*0.55, 5, 6);
      ctx.restore();
    }
  });

})();
