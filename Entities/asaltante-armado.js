// ============================================================================
//  entities/asaltante-armado.js
// ----------------------------------------------------------------------------
//  Asaltante Armado: una variante del asaltante comun (entities/asaltante.js,
//  que TIENE que ir cargado antes que este archivo en entities/manifest.js) --
//  misma apariencia (reusa su dibujo tal cual, cap incluido), misma vida,
//  mismo daño fijo por golpe, mismos estados compartidos con un civil
//  (towed/wrapped/lyingDown/hugging/dead), y la MISMA policia/911 (ver el
//  chequeo de tipo ampliado en asaltoBus, en asaltante.js). Aparece bastante
//  menos seguido que el comun.
//
//  Lo unico que cambia de verdad es la IA de ataque: en vez de acercarse y
//  pegar un puñetazo, saca una pistola y dispara. El ciclo es el mismo en
//  espiritu que el del asaltante comun (buscar blanco -> atacar UNA vez ->
//  huir un rato sin atacar de nuevo -> volver a buscar), pero con dos
//  diferencias de diseño propias:
//
//    - Para disparar le apunta primero a su blanco (se detiene, plantado). Si el blanco es un
//      civil (tiro de "ataque") tarda ARMED_ATTACK_AIM_WINDUP -- 5 segundos -- apuntando antes de
//      que salga el tiro, y durante esos 5 segundos el civil apuntado grita (mismo radar de borde
//      de pantalla + flechita que ya usan los testigos, para que se note aunque este fuera de
//      cuadro) Y ADEMAS queda paralizado en el sitio (ver el freezeo de target.vx en updateAI,
//      rama 'aiming'): antes seguia caminando su plan de siempre mientras gritaba, y como la bala
//      viaja en linea recta (no persigue, ver la entidad 'asaltanteArmadoBala' mas abajo) a veces
//      terminaba pasando de largo si para cuando llegaba el civil ya se habia corrido de lugar --
//      ese era el bug de "se acaba el timer y la victima no muere". Si en el medio de esos 5s lo
//      salvan (lo cargan en brazos, lo enganchan con telaraña, o el asaltante muere primero) el
//      apunte se cancela al toque: el grito y el freeze paran de una, no se quedan pegados de
//      gorra hasta que se cumplan los 5s enteros. Si el blanco es el jugador (tiro de "defensa",
//      ver mas abajo) sigue siendo instantaneo: solo AIM_WINDUP, un cuarto de segundo.
//    - Mientras huye despues de un disparo (haya matado a un civil, o haya
//      sido el jugador quien le pego a EL) puede, una vez, frenarse un
//      instante para pegarle un tiro de "defensa" al propio jugador antes de
//      seguir corriendo -- ver enterFleeing/updateAI mas abajo.
//
//  La bala es una entidad de verdad (tipo 'asaltanteArmadoBala', ver mas
//  abajo), no el sistema generico de entityProjectiles del motor: la
//  necesitamos como entidad porque asi el telarañazo SUELTO del jugador
//  (webProjectiles, el mismo mecanismo que envuelve civiles) la puede
//  atravesar y mandarla lejos SOLA, sin codigo extra en el motor -- el motor
//  ya busca, cuadro a cuadro, cualquier entidad viva con onWebProjectileHit
//  definido en el camino de un telarañazo suelto (ver findWebProjectileHitEntity
//  en spiderswing.html). Si no se la desvia, y llega hasta el jugador, hace
//  30 de daño -- por eso, apenas se dispara un tiro apuntandole al jugador
//  (el de "defensa"), si el que dispara esta en pantalla en ese instante se
//  prende el sentido aracnido al toque (bullet time NO permanente, se apaga
//  solo con un Ctrl como siempre -- misma idea que jaryman.js cuando se te
//  cae de los brazos), para darle a el jugador el reflejo de cortarla con
//  una telaraña antes de que llegue.
// ============================================================================

(function(){

  // ---------- apariencia: MISMA paleta de piel que un civil/asaltante comun, ropa
  // igual de oscura -- la unica diferencia visual real es la pistola (ver drawGun) ----------
  const SKIN_COLORS = ['#e8b48c', '#c98a5c', '#8d5a3c', '#f0c8a0', '#a9673f'];
  const ARMED_SHIRT_COLOR = '#23262b';
  const ARMED_PANTS_COLOR = '#1a1c20';

  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---------- ajustes de aparicion por chunk: bastante menos seguido que el comun (que
  // subimos de 0.08 a 0.10 en asaltante.js justamente para compensar este nuevo tipo) ----------
  const ARMED_SPAWN_CHANCE = 0.025; // ~1 de cada 40 chunks (bajado de 0.04 a pedido, junto con el del comun -- ver ASSAILANT_SPAWN_CHANCE en asaltante.js)

  // ---------- movimiento: identico al asaltante comun ----------
  const ARMED_WALK_SPEED_MIN = 40;
  const ARMED_WALK_SPEED_MAX = 95;
  const ARMED_RUN_SPEED      = (typeof MAX_GROUND_SPEED !== 'undefined') ? MAX_GROUND_SPEED : 320;
  const ARMED_ACCEL          = 230;

  // ---------- combate cuerpo a cuerpo (recibir golpes): identico al asaltante comun --
  // 5 hp, 2 de daño fijo por golpe, a una vida se tumba para siempre ----------
  const ARMED_MAX_HP     = 5;
  const ARMED_HIT_DAMAGE = 2;

  // ---------- combate a distancia (la pistola): esto es lo nuevo ----------
  const GUN_RANGE          = 460;  // que tan cerca del blanco tiene que estar para plantarse a disparar
  const AIM_WINDUP         = 0.25; // cuarto de segundo parado, apuntando, antes de que salga el tiro DE DEFENSA (al jugador)
  const ARMED_ATTACK_AIM_WINDUP = 5; // apuntandole a un civil tarda mucho mas -- 5s -- y en ese rato el civil grita (radar) y queda paralizado (ver updateAI)
  const ARMED_FLEE_DURATION = 5;   // segundos sin poder atacar de nuevo tras disparar (o tras recibir un golpe) -- un poco mas que el comun (4)
  const ARMED_SEARCH_RADIUS = 900; // no persigue a un civil mas lejos que esto

  const BULLET_SPEED         = 1400;
  const BULLET_HIT_RADIUS    = 5;
  const BULLET_PLAYER_DAMAGE = 30;
  const BULLET_LIFE          = 3; // segundos hasta que se autodestruye si no choco con nada

  // ---------- desenlace del tiro de "ataque" (el que le pega a un civil): igual que un asalto a
  // mano armada real, no siempre es fatal -- puede matar o dejar herido de gravedad (a 1 hp,
  // tirado para siempre hasta que lo salves, ver woundCivil en civiles.js). 50/50 por default ----------
  const ARMED_ATTACK_KILL_CHANCE = 0.5;

  // ---------- radares: el de los testigos (civiles cercanos que ven la muerte de otro y
  // gritan) dura un tiempo random distinto cada vez; el del propio disparo (el ruido de la
  // pistola en si, se dispare a quien se dispare) SIEMPRE dura 8s fijos ----------
  const WITNESS_MIN_DURATION  = 4;
  const WITNESS_MAX_DURATION  = 7;
  const WITNESS_RADIUS        = 420;  // que tan cerca de la victima tiene que estar otro civil para contar como testigo
  const GUNSHOT_RADAR_DURATION = 8;
  const ALERT_COLOR = '#ff5b3d';
  const FIRE_COLOR  = '#ff8a3d';

  // ---------- fisica propia: calcada de asaltante.js (moveType:'custom' obliga a que cada
  // tipo se haga cargo de la suya) ----------
  const ARMED_GRAVITY      = GRAVITY * 0.55;
  const ARMED_TERMINAL_VY  = 620;
  const ARMED_HIT_RADIUS   = (ENTITY_TYPES['civil'] && ENTITY_TYPES['civil'].hitRadius) || 14;

  const ARMED_DEAD_TOTAL_DURATION = 1.05;
  const ARMED_LIE_DURATION        = 1.1;
  const ARMED_DROP_HOLD_TIME      = 3;
  const CATCH_RADIUS              = 34;

  const ARMED_WRAP_MELT_TIME      = 15;
  const ARMED_FACADE_HIT_Y_MARGIN = 10;

  function isOnScreen(x, y, margin){
    const sx = x - camera.x, sy = y - camera.y;
    return sx > margin && sx < canvas.width - margin && sy > margin && sy < canvas.height - margin;
  }

  // ============================================================================
  //  LA BALA -- una entidad de verdad (no entityProjectiles), justamente para que
  //  el telarañazo suelto del jugador la pueda atravesar y desviar sola (ver
  //  onWebProjectileHit mas abajo, y la nota grande al principio del archivo)
  // ============================================================================
  registerEntityType('asaltanteArmadoBala', {
    hp: 1,
    hitRadius: BULLET_HIT_RADIUS,
    moveType: 'custom',
    webAttachable: false,
    huggable: false,
    invulnerable: true,
    friendly: false,

    onSpawn(e){
      e.deflected = false;
      e.life = 0;
    },

    onUpdate(e, dt){
      e.x += e.dirX*BULLET_SPEED*dt;
      e.y += e.dirY*BULLET_SPEED*dt;
      e.life += dt;

      if(!e.deflected){
        // choque con el civil al que le estaba apuntando (si este tiro era de "ataque"): 50/50
        // (ARMED_ATTACK_KILL_CHANCE) entre matarlo directo o dejarlo herido de gravedad -- a 1 hp,
        // tirado para siempre (ver woundCivil, expuesta desde civiles.js) hasta que lo cargues/
        // salves. El motor dispara su propio onDeath (la animacion de civiles.js) solo, en cuanto
        // note hp<=0 al terminar este mismo cuadro -- eso solo pasa en la rama de matar
        if(e.targetCivil && !e.targetCivil.dead){
          const d = Math.hypot(e.targetCivil.x - e.x, e.targetCivil.y - e.y);
          if(d <= (e.targetCivil.hitRadius||14) + e.hitRadius){
            if(Math.random() < ARMED_ATTACK_KILL_CHANCE){
              e.targetCivil.hp = 0;
              onGunKillCivil(e.targetCivil, e.shooter);
            } else if(window.woundCivil){
              window.woundCivil(e.targetCivil);
              onGunWoundCivil(e.targetCivil, e.shooter);
            } else {
              // civiles.js no llego a cargar (no deberia pasar nunca, pero por las dudas no
              // dejamos la bala colgada sin resolver nada): mata directo, como antes
              e.targetCivil.hp = 0;
              onGunKillCivil(e.targetCivil, e.shooter);
            }
            e.dead = true;
            return;
          }
        }
        // choque con el jugador: CUALQUIER bala (de ataque o de defensa) puede pegarle si se cruza
        // en el camino, no solo la que le apuntaba directamente
        const half = (typeof PLAYER_SIZE !== 'undefined') ? PLAYER_SIZE/2 : 16;
        if(Math.hypot(player.x - e.x, player.y - e.y) <= half + e.hitRadius){
          damagePlayer(BULLET_PLAYER_DAMAGE);
          e.dead = true;
          return;
        }
      }

      // BUG FIX: antes esto tambien mataba la bala si quedaba fuera de la CAMARA (con 100px de
      // margen). El problema es que un tiro de "ataque" le puede pegar a un civil hasta a
      // GUN_RANGE (460px) o el asaltante lo puede perseguir hasta ARMED_SEARCH_RADIUS (900px) --
      // bastante mas de lo que entra en pantalla. Si el tiro ocurria fuera de camara, la bala
      // nacia ya "offscreen" y este chequeo la mataba en el primerisimo onUpdate (a 1400px/s un
      // frame solo avanza ~20px), MUCHO antes de llegar a chocar con el civil o con el jugador --
      // ese era el bug de "el tiro fuera de camara no mata". BULLET_LIFE (3s = hasta 4200px de
      // alcance) ya alcanza de sobra para autodestruirla si no choca con nada, asi que el chequeo
      // de camara no hacia falta para nada mas que romper los tiros fuera de pantalla.
      if(e.life > BULLET_LIFE) e.dead = true;
    },

    // el telarañazo suelto la atraviesa: a partir de aca vuela para otro lado (el que traiga la
    // telaraña) y deja de poder matar civiles o dañar al jugador -- "la manda lejos"
    onWebProjectileHit(e, dirX, dirY, speed){
      e.deflected = true;
      e.targetCivil = null;
      e.dirX = dirX; e.dirY = dirY;
      e._deflectSpeed = speed;
      return true; // siempre reacciona (se desvia), asi que el telarañazo si se consume aca
    },

    draw(ctx, e){
      const speed = e.deflected ? (e._deflectSpeed||BULLET_SPEED) : BULLET_SPEED;
      void speed;
      const angle = Math.atan2(e.dirY, e.dirX);
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(angle);
      ctx.fillStyle = e.deflected ? '#cfd3da' : '#f4d35e';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 3, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  });

  function fireGun(e, targetX, targetY, opts){
    opts = opts || {};
    const dx = targetX - e.x, dy = targetY - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx/dist, dirY = dy/dist;

    spawnEntity('asaltanteArmadoBala', e.x + dirX*ARMED_HIT_RADIUS, e.y + dirY*ARMED_HIT_RADIUS, {
      dirX, dirY,
      targetCivil: opts.targetCivil || null,
      shooter: e
    });

    // el ruido de la pistola en si: SIEMPRE deja un radar (sea tiro de ataque o de defensa),
    // fijo en 8s, apuntando a donde se disparo (la posicion del tirador en ESE instante, no la
    // bala mientras viaja)
    addGunshotRadar(e.x, e.y);

    // bullet time instantaneo: solo tiene sentido avisar cuando la bala va derecho al jugador --
    // es la unica que lo puede lastimar sin que el haga nada. Activacion NO permanente (igual que
    // el aviso de jaryman.js al soltarse de los brazos): un Ctrl del jugador la apaga como siempre
    if(opts.atPlayer && isOnScreen(e.x, e.y, 0)){
      if(!spiderSenseOn) spiderSenseOn = true;
    }
  }

  // ---------- testigos: cuando un tiro de ataque le pega a un civil (lo mate o lo hiera de
  // gravedad -- ver ARMED_ATTACK_KILL_CHANCE), todos los civiles vivos y libres a menos de
  // WITNESS_RADIUS de la victima se vuelven testigos -- cada uno con su propio radar de duracion
  // random (4 a 7s), apuntando al tirador ----------
  let gunWitnesses = []; // {civil, assailant, timer}
  let gunshotRadars = []; // {x, y, timer} -- el "fuego", uno por disparo, sea cual sea el blanco

  function recruitGunWitnesses(civil, shooter){
    for(const other of entities){
      if(other === civil || other.type !== 'civil' || other.dead) continue;
      if(other.carried || other.beingReeled || other.state === 'towed') continue;
      const d = Math.hypot(other.x - civil.x, other.y - civil.y);
      if(d > WITNESS_RADIUS) continue;
      gunWitnesses = gunWitnesses.filter(w => w.civil !== other); // reemplaza un testigo viejo si ya estaba señalando otra cosa
      gunWitnesses.push({
        civil: other, assailant: shooter,
        timer: WITNESS_MIN_DURATION + Math.random()*(WITNESS_MAX_DURATION - WITNESS_MIN_DURATION)
      });
    }
  }

  function onGunKillCivil(civil, shooter){
    window.pushAssailantMessage('Un asaltante armado mató a un civil');
    recruitGunWitnesses(civil, shooter);
  }

  // mismo trato que onGunKillCivil (mismos testigos reclutados: ver un disparo, se pegue o no
  // fatal, asusta igual a cualquiera cerca), pero para el otro desenlace posible del tiro de
  // ataque -- ver ARMED_ATTACK_KILL_CHANCE y woundCivil (civiles.js)
  function onGunWoundCivil(civil, shooter){
    window.pushAssailantMessage('Un asaltante armado hirió de gravedad a un civil');
    recruitGunWitnesses(civil, shooter);
  }

  function addGunshotRadar(x, y){
    gunshotRadars.push({x, y, timer: GUNSHOT_RADAR_DURATION});
  }

  window.WORLD_UPDATE_LISTENERS.push(function(dt){
    for(let i = gunWitnesses.length-1; i >= 0; i--){
      const w = gunWitnesses[i];
      w.timer -= dt;
      if(w.timer <= 0 || w.civil.dead) gunWitnesses.splice(i, 1);
    }
    for(let i = gunshotRadars.length-1; i >= 0; i--){
      const g = gunshotRadars[i];
      g.timer -= dt;
      if(g.timer <= 0) gunshotRadars.splice(i, 1);
    }
  });

  window.RESET_LISTENERS.push(function(){
    gunWitnesses = [];
    gunshotRadars = [];
  });

  // radar de borde de pantalla generico (mismo estilo que el del asaltante comun): circulo +
  // flechita, con un "!" adentro para un testigo o un 🔥 para el ruido del disparo
  function drawEdgeRadar(ctx, x, y, color, glyph){
    const margin = 24;
    if(isOnScreen(x, y, margin)) return;

    const sx = x - camera.x, sy = y - camera.y;
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
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(21, 0); ctx.lineTo(11, -6); ctx.lineTo(11, 6); ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.font = '13px sans-serif'; // sans-serif generico: la mayoria de los navegadores ya trae emoji ahi
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(glyph, ix, iy);
    ctx.restore();
  }

  // flechita flotando sobre la cabeza del testigo, apuntando al tirador -- solo mientras el
  // testigo este a la vista (si no lo esta, ya lo cubre el radar de arriba)
  function drawWitnessPointer(ctx, civil, shooter){
    const margin = 24;
    if(!isOnScreen(civil.x, civil.y, margin)) return;

    const sx = civil.x - camera.x, sy = civil.y - camera.y - 22;
    const asx = shooter.x - camera.x, asy = shooter.y - camera.y;
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
    for(const w of gunWitnesses){
      drawEdgeRadar(ctx, w.civil.x, w.civil.y, ALERT_COLOR, '!');
      if(w.assailant && !w.assailant.dead) drawWitnessPointer(ctx, w.civil, w.assailant);
    }
    for(const g of gunshotRadars){
      drawEdgeRadar(ctx, g.x, g.y, FIRE_COLOR, '🔥');
    }
    // grito del civil apuntado: mientras un asaltante armado este parado apuntandole (los 5s de
    // ARMED_ATTACK_AIM_WINDUP), el civil grita -- mismo radar de borde + flechita que un testigo,
    // reusando drawEdgeRadar/drawWitnessPointer tal cual (no hace falta un array propio con timer:
    // el estado ya vive en la entidad misma, asi que esto se apaga solo en cuanto deja de apuntar,
    // sea porque disparo, porque lo salvaron a mitad de camino (ver el chequeo de target valido
    // en updateAI, rama 'aiming'), o porque el asaltante murio primero -- ver el reseteo de
    // _huntState en onDeath, sin eso el grito se quedaba pegado durante toda su animacion de
    // muerte aunque ya estuviera tirado en el piso desvaneciendose)
    for(const en of entities){
      if(en.type !== 'asaltanteArmado' || en.dead) continue;
      if(en._huntState !== 'aiming' || en._aimKind !== 'attack') continue;
      const civil = en._aimTarget;
      if(!civil || civil.dead) continue;
      drawEdgeRadar(ctx, civil.x, civil.y, ALERT_COLOR, '!');
      drawWitnessPointer(ctx, civil, en);
    }
  });

  // ============================================================================
  //  FISICA PROPIA -- calcada 1 a 1 de asaltante.js (misma nota: moveType:'custom'
  //  exige que cada tipo se haga cargo de principio a fin)
  // ============================================================================
  // ---------- daño de caida: calcado 1 a 1 de applyFallDamage en asaltante.js (que a su vez esta
  // calcado de civiles.js) -- antes el asaltante armado tampoco lo tenia, mismo bug que su
  // contraparte desarmada ----------
  const ARMED_FALL_DAMAGE_MIN_SPEED = 430; // igual a CIVIL_FALL_DAMAGE_MIN_SPEED/ASSAILANT_FALL_DAMAGE_MIN_SPEED
  const ARMED_FALL_DAMAGE_MAX_HP = ARMED_MAX_HP; // a velocidad terminal, el golpe es letal
  const ARMED_WRAP_FALL_DAMAGE_DAMPING = 0.35; // el envoltorio amortigua el golpe, igual que en civiles.js/asaltante.js

  function applyFallDamage(e, impactSpeed){
    if(e.dying || e.state === 'dead') return;
    if(impactSpeed < ARMED_FALL_DAMAGE_MIN_SPEED) return; // caida chica: sin daño
    const t = Math.min(1, (impactSpeed - ARMED_FALL_DAMAGE_MIN_SPEED) / (ARMED_TERMINAL_VY - ARMED_FALL_DAMAGE_MIN_SPEED));
    const dmg = t * ARMED_FALL_DAMAGE_MAX_HP;
    if(dmg <= 0) return;
    e.hp -= dmg;
  }

  function physicsStep(e, dt){
    const wasGrounded = e.grounded;
    const prevBottom = e.y + e.hitRadius;
    e.vy += ARMED_GRAVITY*dt;
    if(e.vy > ARMED_TERMINAL_VY) e.vy = ARMED_TERMINAL_VY;
    const impactVy = e.vy;
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

  function updateWrapped(e, dt){
    if(e.wrapPhase === 'stuck'){ updateWrappedStuck(e, dt); return; }
    if(e.wrapPhase === 'resting'){ updateWrappedResting(e, dt); return; }
    updateWrappedFlying(e, dt);
  }

  function updateWrappedFlying(e, dt){
    const prevY = e.y;
    e.vy += ARMED_GRAVITY*dt;
    if(e.vy > ARMED_TERMINAL_VY) e.vy = ARMED_TERMINAL_VY;
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
      applyFallDamage(e, impactVy * ARMED_WRAP_FALL_DAMAGE_DAMPING);
      if(e.hp > 0) enterWrappedResting(e); // si el golpe (ya amortiguado) lo mato, que muera normal
    }
  }

  function findFacadeHit(x, y, r){
    for(const b of buildings){
      if(x + r <= b.x || x - r >= b.x + b.w) continue;
      if(y + r <= b.y + ARMED_FACADE_HIT_Y_MARGIN) continue;
      if(y - r >= STREET_Y) continue;
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
    e.wrapTimer = ARMED_WRAP_MELT_TIME;
  }

  function updateWrappedStuck(e, dt){
    e.wrapTimer -= dt;
    if(e.wrapTimer <= 0) unwrapEntity(e);
  }

  function enterWrappedResting(e){
    e.wrapPhase = 'resting';
    e.wrapTimer = ARMED_WRAP_MELT_TIME;
    e.vx = 0;
  }

  function updateWrappedResting(e, dt){
    e.vx = 0;
    e.wrapTimer -= dt;
    if(e.wrapTimer <= 0) unwrapEntity(e);
  }

  function unwrapEntity(e){
    e.wrapPhase = null;
    e.stuckBuilding = null;
    e._huntState = 'hunting';
    e._aimTarget = null;
    if(e.grounded){
      // igual que updateFalling: si quedo parado sobre un techo/balcon, temblando ahi
      // (enterStranded) en vez de retomar la caceria de una -- antes ignoraba standingPlatform
      if(e.standingPlatform) enterStranded(e);
      else e.state = 'walking';
    } else {
      e.state = 'falling';
      e.vx = 0; e.vy = 0;
    }
  }

  // ============================================================================
  //  IA: buscar civil / apuntar-disparar / huir (con la posibilidad de un tiro de
  //  defensa al jugador en el medio de la huida) -- ver la nota grande al inicio
  // ============================================================================
  function accelerateTo(e, targetVx, dt){
    const diff = targetVx - e.vx;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), ARMED_ACCEL*dt);
    e.vx += step;
  }

  function updateFacingAndWalkCycle(e, vx, dt){
    if(Math.abs(vx) > 5) e.facing = vx > 0 ? 1 : -1;
    if(e.grounded && Math.abs(vx) > 15) e.walkCycle += Math.abs(vx)*dt*0.08;
  }

  function findNearestCivil(e){
    let best = null, bestD = ARMED_SEARCH_RADIUS;
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

  // entra (o reentra) en huida: 5 segundos sin poder disparar de nuevo a un civil, con un
  // instante random en el medio reservado para un posible tiro de defensa al jugador (ver
  // updateAI, rama 'fleeing')
  function enterFleeing(e){
    e._huntState = 'fleeing';
    e._fleeTimer = ARMED_FLEE_DURATION;
    e._fleeElapsed = 0;
    e._fleeShotDone = false;
    e._fleeShotAt = 0.4 + Math.random()*(ARMED_FLEE_DURATION - 0.8); // nunca pegado al principio ni al final
  }

  function performShot(e){
    if(e._aimKind === 'attack'){
      const target = e._aimTarget;
      e._aimTarget = null;
      // se escapo/desaparecio/lo agarraron antes de que saliera el tiro: igual dispara al aire y
      // huye, como si hubiera fallado -- no dejamos el ciclo colgado
      if(target && !target.dead && !target.carried && target.state !== 'towed'){
        fireGun(e, target.x, target.y, {targetCivil: target, atPlayer: false});
      } else {
        fireGun(e, e.x + e.facing*GUN_RANGE, e.y, {atPlayer: false});
      }
      enterFleeing(e);
    } else { // 'defense': el tiro de mitad de huida, apuntandole al jugador
      fireGun(e, player.x, player.y, {atPlayer: true});
      // retoma la huida justo donde iba (no la reinicia entera): el tiro fue un parate en el
      // medio, no un evento nuevo
      e._huntState = 'fleeing';
      if(typeof e._resumeFleeTimer === 'number') e._fleeTimer = e._resumeFleeTimer;
      e._resumeFleeTimer = undefined;
    }
  }

  function updateAI(e, dt){
    if(!e._huntState) e._huntState = 'hunting';

    if(e._huntState === 'aiming'){
      e.vx = 0;
      updateFacingAndWalkCycle(e, 0, dt);

      // el tiro de "ataque" (a un civil) es el unico que tiene un blanco que puede dejar de ser
      // valido a mitad de la cuenta regresiva -- lo pueden salvar (cargandolo en brazos o
      // enganchandolo con telaraña) mientras grita. En cuanto pasa, cancelamos el apunte de una:
      // sin esto el asaltante se quedaba plantado apuntando (y el civil gritando y paralizado)
      // los 5 segundos enteros para terminar disparandole al aire -- ver performShot, que ya
      // tenia este mismo chequeo como ultimo resguardo, pero solo se enteraba AL FINAL del timer
      if(e._aimKind === 'attack'){
        const target = e._aimTarget;
        if(!target || target.dead || target.carried || target.state === 'towed'){
          e._huntState = 'hunting';
          e._aimTarget = null;
          return;
        }
        // paraliza al civil mientras dura el apunte: frenamos su vx CADA cuadro (si no, su propia
        // IA en civiles.js lo vuelve a acelerar hacia su plan de caminata de siempre un instante
        // despues). Esto es lo que de verdad arregla el bug de la victima que no muere: al quedar
        // quieto en el lugar exacto donde le estaban apuntando, la bala (que viaja en linea recta
        // y no persigue) ya no le puede pasar de largo por haberse movido mientras tanto
        target.vx = 0;
      }

      e._aimTimer -= dt;
      if(e._aimTimer <= 0) performShot(e);
      return;
    }

    if(e._huntState === 'fleeing'){
      e._fleeTimer -= dt;
      e._fleeElapsed += dt;
      const dir = e.x < player.x ? -1 : 1;
      accelerateTo(e, dir*ARMED_RUN_SPEED, dt);
      updateFacingAndWalkCycle(e, e.vx, dt);

      // en algun punto random de la huida, un tiro de defensa al jugador -- se frena un cuarto
      // de segundo (AIM_WINDUP, igual que cualquier otro disparo) y sigue corriendo despues
      if(!e._fleeShotDone && e._fleeElapsed >= e._fleeShotAt){
        e._fleeShotDone = true;
        e._resumeFleeTimer = e._fleeTimer;
        e._huntState = 'aiming';
        e._aimTimer = AIM_WINDUP;
        e._aimKind = 'defense';
        e.facing = e.x < player.x ? 1 : -1;
        e.vx = 0;
        return;
      }

      if(e._fleeTimer <= 0) e._huntState = 'hunting';
      return;
    }

    // 'hunting': busca al civil vivo mas cercano y camina hasta tener tiro
    const target = findNearestCivil(e);
    if(!target){
      e.vx *= 0.8;
      updateFacingAndWalkCycle(e, e.vx, dt);
      return;
    }

    const dx = target.x - e.x;
    if(Math.abs(dx) <= GUN_RANGE){
      e._huntState = 'aiming';
      e._aimTimer = ARMED_ATTACK_AIM_WINDUP; // apuntandole a un civil: 5s largos, gritando y paralizado (ver HUD_DRAW_LISTENERS y updateAI)
      e._aimKind = 'attack';
      e._aimTarget = target;
      e.facing = dx >= 0 ? 1 : -1;
      e.vx = 0;
      return;
    }

    const dir = dx >= 0 ? 1 : -1;
    accelerateTo(e, dir*(e._walkSpeed || ARMED_WALK_SPEED_MIN), dt);
    updateFacingAndWalkCycle(e, e.vx, dt);
  }

  // ---------- estados compartidos con un civil (mismos nombres de campo, para que civilDraw
  // -- reusado via el draw del asaltante comun -- los siga animando sin diferencias) ----------
  function enterStranded(e){
    e.state = 'strandedOnRoof';
    e.vx = 0;
    e.trembleCycle = Math.random()*Math.PI*2;
  }
  function updateStranded(e, dt){
    e.vx = 0;
    e.trembleCycle += dt*14;
  }
  function enterLyingDown(e, permanent){
    e.state = 'lyingDown';
    e.vx = 0;
    e.downedForGood = !!permanent;
    e.lieTimer = ARMED_LIE_DURATION;
  }
  function updateLyingDown(e, dt){
    if(e.downedForGood) return;
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
    if(e.dropHoldTimer >= ARMED_DROP_HOLD_TIME) window.dropCivil(e, {voluntary: true});
  }

  function tryCatchTowed(e){
    const dx = player.x - e.x, dy = player.y - e.y;
    if(dx*dx + dy*dy > CATCH_RADIUS*CATCH_RADIUS) return;

    const group = e.def.carryGroup || e.type;
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
    e.hugSlot = Math.min(carriedNow, 3);
  }

  // ---------- muerte (a golpes, no a tiros) ----------
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

    // si lo matabas justo mientras apuntaba, e.state ya paso a 'dead' (asi que onUpdate corta
    // derecho a updateDead y nunca vuelve a pasar por la rama 'aiming' de arriba), PERO
    // _huntState seguia valiendo 'aiming' -- y el chequeo del grito en HUD_DRAW_LISTENERS mas
    // abajo solo mira eso, no e.state. Sin este reseteo, el civil se quedaba gritando (radar +
    // flechita) mirando a un asaltante que ya estaba muerto y desvaneciendose en el piso, durante
    // toda su animacion de muerte (~1s). Limpiando esto aca, el grito para en el mismo cuadro en
    // el que el asaltante muere, no un segundo despues.
    e._huntState = null;
    e._aimTarget = null;

    // se borra la entrada entera (no se marca "defeated"): el chunk queda libre para volver a
    // sortear un asaltante armado nuevo la proxima vez que se cargue
    armedChunkState.delete(e._homeChunkIndex);

    window.pushAssailantMessage('Un asaltante armado ha muerto');
  }
  function updateDead(e, dt){
    e.deadTimer += dt;
    if(e.deadTimer >= ARMED_DEAD_TOTAL_DURATION){ e.dead = true; return; }
    e.x += e.vx*dt;
    e.vx *= 0.9;
  }

  function onDamage(en, dmg /*, src */){
    // si lo estas cargando en brazos (hugging) no tiene sentido que tu propio golpe lo lastime --
    // se cancela el daño entero (ni siquiera se le resta el fijo de ARMED_HIT_DAMAGE). `en.hp +=
    // dmg` cancela el `en.hp -= dmg` que dealDamageAt hace justo despues de este hook, asi que
    // queda intacto
    if(en.state === 'hugging'){ en.hp += dmg; return; }

    const hpBefore = en.hp;
    en.hp += dmg;
    en.hp -= ARMED_HIT_DAMAGE;
    const hpAfter = hpBefore - ARMED_HIT_DAMAGE;

    // cualquier golpe que no lo tumbe del todo lo manda a huir (y, de paso, quiza a devolver un
    // tiro de defensa en el medio de esa huida -- ver enterFleeing/updateAI)
    if(en.state !== 'dead' && en.state !== 'hugging' && en.state !== 'towed' && en.state !== 'wrapped'){
      enterFleeing(en);
    }

    // a una vida: se tumba para siempre (pisa la huida de arriba), listo para que la policia lo
    // agarre o para que lo termines de un golpe mas -- identico al asaltante comun
    if(hpAfter > 0 && hpAfter <= 1 &&
       en.state !== 'dead' && en.state !== 'hugging' && en.state !== 'towed' &&
       en.state !== 'wrapped' && en.state !== 'lyingDown'){
      enterLyingDown(en, true);
    }
  }

  // BUG FIX: si al asaltante armado lo neutralizan (lo envuelven con un telarañazo SUELTO ->
  // 'wrapped', o lo enganchan y quedan colgando de el -> 'towed') justo mientras estaba en medio
  // de un apunte de "ataque" (_huntState==='aiming', los 5s de ARMED_ATTACK_AIM_WINDUP), ninguna
  // de esas dos transiciones de estado pasa por onDamage NI por la rama 'aiming' de updateAI (de
  // hecho, dejan de llamar a updateAI del todo mientras dure -- ver 'wrapped'/'towed' mas abajo,
  // cortan antes de llegar a el). Entonces _huntState se quedaba congelado en 'aiming' PARA
  // SIEMPRE (o hasta que se desenrede solo), y el civil al que le apuntaba se quedaba gritando
  // (radar + flechita, ver HUD_DRAW_LISTENERS) aunque el asaltante ya estuviera neutralizado y no
  // pudiera disparar mas -- el civil ya estaba salvado, pero el susto seguia en pantalla. Se
  // cancela aca, apenas se detecta la transicion, ANTES de los cortes de 'wrapped'/'towed' de mas
  // abajo -- misma logica que ya usa unwrapEntity() cuando el envoltorio se termina solo, pero
  // disparada al momento de la captura en vez de al final.
  function cancelAimIfInterrupted(e, becomingState){
    if(e._huntState !== 'aiming') return;
    if(becomingState !== 'walking') { e._huntState = 'hunting'; e._aimTarget = null; }
  }

  function onUpdate(e, dt){
    if(e.state === 'dead'){ updateDead(e, dt); return; }
    if(e.state === 'hugging'){ cancelAimIfInterrupted(e, 'hugging'); updateHugging(e, dt); return; }

    const towedNow = (webs.left  && webs.left.state  === 'attached' && webs.left.entity  === e) ||
                      (webs.right && webs.right.state === 'attached' && webs.right.entity === e);
    if(towedNow && e.state !== 'towed'){
      e.state = 'towed';
      e.vx = 0; e.vy = 0;
      cancelAimIfInterrupted(e, 'towed');
    } else if(!towedNow && e.state === 'towed'){
      if(e.grounded && e.standingPlatform) enterStranded(e);
      else if(e.grounded) e.state = 'walking';
      else e.state = 'falling';
    }

    if(e.state === 'wrapped'){ cancelAimIfInterrupted(e, 'wrapped'); updateWrapped(e, dt); return; }

    physicsStep(e, dt);

    if(e.state === 'towed'){ tryCatchTowed(e); return; }
    if(e.state === 'falling'){ updateFalling(e, dt); return; }
    if(e.state === 'lyingDown'){ updateLyingDown(e, dt); return; }
    if(e.state === 'strandedOnRoof'){ updateStranded(e, dt); return; }

    updateAI(e, dt);
  }

  // ---------- registro del tipo: clona 'asaltante' ENTERO (que a su vez ya clono 'civil') --
  // misma vida/daño/dibujo de base/estados, y pisamos onUpdate/onDamage/onDeath/onSpawn/draw
  // para la IA de pistola y la pistola en si ----------
  const asaltanteDef = ENTITY_TYPES['asaltante'];
  // chunkIndex -> {suspended, entity, x, y} -- declarado antes de onDeath porque lo usa. A
  // diferencia del asaltante comun, ESTE mapa NO guarda un veredicto para siempre: una entrada
  // solo existe mientras ese chunk tiene (o tuvo, congelado) un asaltante armado vivo pendiente.
  // En cuanto se resuelve -- muere a golpes (onDeath) o se lo lleva la policia (mas abajo) -- se
  // borra la entrada entera en vez de marcarla "defeated", asi la proxima vez que el chunk se
  // cargue (el jugador se fue y volvio) se vuelve a sortear de cero y puede tocarle uno nuevo.
  const armedChunkState = new Map();

  if(!asaltanteDef){
    console.warn('asaltante-armado.js: no se encontro el tipo "asaltante" -- revisa que asaltante.js este ANTES que asaltante-armado.js en entities/manifest.js');
  } else {
    const baseDraw = asaltanteDef.draw;

    registerEntityType('asaltanteArmado', Object.assign({}, asaltanteDef, {
      hp: ARMED_MAX_HP,
      invulnerable: false,
      onDamage,
      onDeath,
      onUpdate,

      onSpawn(e){
        e.skinColor  = e.skinColor  || pickRandom(SKIN_COLORS);
        e.shirtColor = ARMED_SHIRT_COLOR;
        e.pantsColor = ARMED_PANTS_COLOR;

        e.weightKg    = e.weightKg || (55 + Math.random()*35);
        e.carryWeight = e.weightKg / (window.PLAYER_REFERENCE_WEIGHT_KG || 75);

        e.state = 'walking';
        e.walkCycle = Math.random()*Math.PI*2;
        e.facing = Math.random() < 0.5 ? -1 : 1;
        e.dropHoldTimer = 0;
        e.downedForGood = false;

        e._huntState = 'hunting';
        e._walkSpeed = ARMED_WALK_SPEED_MIN + Math.random()*(ARMED_WALK_SPEED_MAX - ARMED_WALK_SPEED_MIN);
      },

      draw(ctx, e){
        baseDraw(ctx, e); // mismo cuerpo + gorrito que el asaltante comun (que a su vez reusa civilDraw)
        drawGun(ctx, e);
      }
    }));
  }

  // pistola simple: caño + mango, apuntando al blanco mientras apunta/dispara, o "de reposo" en
  // el sentido en el que mira mientras camina/huye
  function drawGun(ctx, e){
    if(e.state === 'dead' || e.state === 'lyingDown') return;

    let angle;
    if(e._huntState === 'aiming' && e._aimKind === 'attack' && e._aimTarget){
      angle = Math.atan2(e._aimTarget.y - e.y, e._aimTarget.x - e.x);
    } else if(e._huntState === 'aiming' && e._aimKind === 'defense'){
      angle = Math.atan2(player.y - e.y, player.x - e.x);
    } else {
      angle = e.facing >= 0 ? 0 : Math.PI;
    }

    ctx.save();
    ctx.translate(e.x, e.y - 2);
    ctx.rotate(angle);
    ctx.fillStyle = '#15171a';
    ctx.fillRect(0, -2, 14, 4);  // caño
    ctx.fillRect(-1, 0, 5, 8);   // mango/culata
    ctx.restore();
  }

  // ---------- spawn por chunk + persistencia "congelada" -- a diferencia del asaltante comun, ESTE
  // se puede volver a sortear: si el chunk no tiene entrada en el mapa (nunca tuvo uno, o tuvo uno
  // y ya se resolvio -- ver onDeath/CHUNK_UNLOAD_LISTENERS) se vuelve a tirar el dado entero cada
  // vez que el chunk se carga. Si SI tiene entrada, es porque hay un asaltante armado congelado
  // (suspended) esperando a que el jugador vuelva -- ese se respeta y no se resortea nada ----------
  //
  // BUG FIX: el `rng` que nos pasa el motor (chunkEntityRng, ver world/rng.js) es DETERMINISTA a
  // proposito -- mismo chunkIndex siempre da la misma secuencia de numeros, sin importar cuantas
  // veces se llame. Eso esta perfecto para lo que fue pensado (edificios, poblacion de civiles),
  // pero rompia el reroll de aca: no importaba cuantas veces borraramos la entrada del mapa al
  // resolverse (onDeath, policia), el PROXIMO roll para ese mismo chunk iba a repetir EXACTAMENTE
  // el mismo resultado que la primera vez -- si aparecio una vez, aparecia siempre; si no aparecio
  // nunca, no iba a aparecer jamas. Por eso este sorteo puntual usa Math.random() en vez del rng
  // del chunk: es el UNICO que necesita variar de verdad entre visitas (a diferencia de la
  // posicion de los edificios, que si tiene que ser siempre igual). No afecta nada mas del mundo.
  window.CHUNK_LOAD_LISTENERS.push(function(chunkIndex, startX, endX, rng){
    void rng; // a proposito sin usar aca -- ver nota de arriba
    if(!asaltanteDef) return;

    let st = armedChunkState.get(chunkIndex);
    if(!st){
      const roll = Math.random();
      if(roll >= ARMED_SPAWN_CHANCE) return; // no le toco esta vez -- no se guarda nada, asi se
                                              // vuelve a sortear la proxima vez que el chunk cargue
      const x = startX + 80 + Math.random()*(endX - startX - 160);
      st = {suspended: false, entity: null, x, y: STREET_Y - ARMED_HIT_RADIUS};
      armedChunkState.set(chunkIndex, st);
    }

    if(st.entity && !st.entity.dead) return;

    const e = spawnEntity('asaltanteArmado', st.x, st.y);
    if(e){
      st.entity = e;
      st.suspended = false;
      e._homeChunkIndex = chunkIndex;
    }
  });

  // captura pasiva al descargar chunk: recorremos TODAS las entradas (no solo la del chunk de
  // nacimiento) porque, igual que el asaltante comun, puede haber huido a un chunk vecino antes
  // de quedar tumbado -- ver la nota larga sobre esto en asaltante.js
  window.CHUNK_UNLOAD_LISTENERS.push(function(chunkIndex){
    for(const [key, st] of armedChunkState.entries()){
      if(!st.entity || st.entity.dead) continue;
      const e = st.entity;
      if(e.carried || e.beingReeled || e.state === 'towed') continue;
      if(Math.floor(e.x / CHUNK_WIDTH) !== chunkIndex) continue;

      // el mismo 911/misma policia que el asaltante comun -- ver window.getAssailant911Chunks,
      // expuesto desde asaltante.js justo para esto: UNA sola llamada sirve para los dos tipos.
      // igual que alla, tambien cuenta si lo dejaste TEMBLANDO varado en un techo/balcon (state
      // 'strandedOnRoof', ver enterStranded), no solo tumbado o envuelto
      const calledChunks = window.getAssailant911Chunks ? window.getAssailant911Chunks() : null;
      const chunkHasNearby911Call = !!calledChunks &&
        (calledChunks.has(chunkIndex-1) || calledChunks.has(chunkIndex) || calledChunks.has(chunkIndex+1));

      if((e.state === 'lyingDown' || e.state === 'wrapped' || e.state === 'strandedOnRoof') && chunkHasNearby911Call){
        e.dead = true;
        // se borra la entrada entera: el chunk queda libre para volver a sortear un asaltante
        // armado nuevo la proxima vez que se cargue
        armedChunkState.delete(key);
        window.pushAssailantMessage('La policía se llevó a un asaltante armado');
        continue;
      }

      st.x = e.x; st.y = e.y;
      st.suspended = true;
      e.dead = true;
      st.entity = null;
    }
  });

  window.RESET_LISTENERS.push(function(){
    armedChunkState.clear();
  });

})();
