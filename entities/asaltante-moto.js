// ============================================================================
//  entities/asaltante-moto.js
// ----------------------------------------------------------------------------
//  Dúo de asaltantes en moto. TIENE que ir cargado despues de asaltante.js y
//  asaltante-armado.js (reusa 'asaltante'/'asaltanteArmado' como los tipos en
//  los que se "convierten" los jinetes apenas quedan a pie, y 'asaltanteArmadoBala'
//  para la pistola del conductor) y despues de bossengine.js (usa
//  registerForcedChunkAnchor, ver mas abajo).
//
//  TRES entidades nuevas:
//    - 'motoAsaltanteRueda' : hitbox chica e independiente por cada rueda (2 por
//      moto), asi un telarañazo SUELTO puede pegarle especificamente a UNA rueda
//      en vez de a la moto entera. No se dibuja sola: la moto la pinta como parte
//      de su propio sprite.
//    - 'motoAsaltante'      : la moto en si. Tiene hitbox propia, fisica propia
//      (calcada de civiles.js/asaltante.js: gravedad + calle + plataformas +
//      "envuelta" en telaraña), un pequeño ciclo de estados de manejo
//      (patrolling -> stopping -> stopped -> fleeing -> patrolling...), y puede
//      quedar sin jinetes (choque por telarañazo en una rueda) y rodar sola
//      hasta que se la detenga o explote.
//    - 'asaltanteMotoConductor' / 'asaltanteMotoPasajero' : los dos jinetes.
//      SOLO existen como estos tipos mientras estan "atados" a la moto (el
//      conductor SIEMPRE; el pasajero solo durante su mandado a pie). Apenas
//      alguno queda suelto para siempre (el conductor al chocar, el pasajero si
//      lo abandonan o si lo interrumpen), se lo "convierte": se borra esta
//      entidad y se spawnea una 'asaltante'/'asaltanteArmado' de las de
//      siempre en su lugar, con su posicion/velocidad/estado -- asi heredan
//      gratis TODO lo que ya tienen esos tipos (persistencia por chunk, 911,
//      recogida policial) sin duplicar ni una linea de eso aca.
//
//  DISEÑO DEL DUO (ciclo de manejo):
//    patrolling -> busca el civil valido mas cercano mientras avanza; el
//    conductor puede pegar tiros sueltos al jugador de tanto en tanto, sin
//    frenar. Al acercarse lo suficiente al blanco elegido, pasa a...
//    stopping -> frena en seco cerca del civil (el conductor sigue pudiendo
//    disparar mientras decelera) y al quedar quieta...
//    stopped -> baja al pasajero (nace recien aca, como 'asaltanteMotoPasajero',
//    apuntado a ese civil) y espera. Mientras espera, si el jugador se acerca
//    MUCHO (mucho mas cerca que el rango normal de tiro), el conductor dispara
//    en panico y la moto arranca de una, con o sin el pasajero (si no llego a
//    volver, queda abandonado -- se convierte en 'asaltante' independiente ahi
//    mismo). Si nadie interrumpe nada, el pasajero pega su golpe, vuelve
//    caminando, remonta, y la moto pasa a...
//    fleeing -> arranca al DOBLE de la velocidad de carrera de un asaltante
//    comun, durante al menos el ancho de un chunk entero, antes de volver a
//    'patrolling' y repetir el ciclo buscando un civil nuevo.
//
//  PERSISTENCIA: a diferencia del asaltante comun/armado (que se "congelan" si
//  se descarga el chunk en el que estan parados), la moto usa el MISMO
//  mecanismo que el boss (entities/bossengine.js, registerForcedChunkAnchor):
//  mientras este viva, fuerza su propio entorno de chunks cargado ademas del
//  del jugador, asi puede alejarse manejando sin que el mundo se le desarme
//  debajo. El sorteo de aparicion por chunk (ver el final del archivo) SI
//  tiene reroll, igual que asaltante.js/asaltante-armado.js -- la diferencia
//  es que aca "resolverse" no es congelarse por chunk descargado, sino que la
//  moto en si haya muerto de verdad (exploto): mientras siga entera en el
//  mundo (aunque sea sin jinetes, rodando sola o ya detenida), su chunk de
//  origen no vuelve a intentar otro dúo.
// ============================================================================

(function(){

  if(!ENTITY_TYPES['asaltante'] || !ENTITY_TYPES['asaltanteArmado']){
    console.warn('asaltante-moto.js: hacen falta "asaltante" y "asaltanteArmado" ya registrados -- revisa el orden en entities/manifest.js');
    return;
  }
  if(typeof registerForcedChunkAnchor !== 'function'){
    console.warn('asaltante-moto.js: hace falta bossengine.js cargado antes (registerForcedChunkAnchor)');
    return;
  }

  const asaltanteDraw = ENTITY_TYPES['asaltante'].draw; // reusado tal cual para dibujar al pasajero de a pie

  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---------- apariencia ----------
  const SKIN_COLORS   = ['#e8b48c', '#c98a5c', '#8d5a3c', '#f0c8a0', '#a9673f'];
  const RIDER_SHIRT    = '#23262b';
  const RIDER_PANTS    = '#1a1c20';
  const MOTO_BODY_COLOR   = '#7a1f1f';
  const MOTO_BODY_DARK    = '#4a1212';
  const MOTO_WHEEL_COLOR  = '#15171a';
  const MOTO_WEB_PATCH    = 'rgba(214,214,214,0.9)';

  // ---------- aparicion por chunk ----------
  const MOTO_SPAWN_CHANCE = 0.022; // baja: es un enemigo bastante mas aparatoso que un asaltante suelto (subida un poquito de 0.018 a pedido)

  // ---------- manejo ----------
  const MOTO_HIT_RADIUS       = 26;
  const MOTO_WHEEL_OFFSET_X   = 32;
  const MOTO_WHEEL_HIT_RADIUS = 11;
  const MOTO_WHEEL_Y_OFFSET   = 18; // de e.y (centro de la moto) hacia abajo, donde van las ruedas
  const MOTO_PATROL_SPEED     = 260;
  const MOTO_ACCEL            = 340;
  const MOTO_STOP_TRIGGER_DIST = 90;  // que tan cerca del civil elegido arranca a frenar
  const MOTO_SEARCH_RADIUS    = 900;
  const MOTO_BASE_RUN_SPEED   = (typeof MAX_GROUND_SPEED !== 'undefined') ? MAX_GROUND_SPEED : 320; // igual que ASSAILANT_RUN_SPEED en asaltante.js
  const MOTO_FLEE_SPEED       = MOTO_BASE_RUN_SPEED * 2; // "el doble de la velocidad a la que corre un asaltante normalmente"
  const MOTO_WILD_SPEED       = 300; // rodando sola, sin control, tras el choque -- sigue siendo una moto (subida de 150 a pedido, andaba mas lenta que en patrulla)
  const MOTO_PASSENGER_TIMEOUT = 6; // segundos esperando al pasajero antes de irse sin el

  const MOTO_GRAVITY     = GRAVITY * 0.55;
  const MOTO_TERMINAL_VY = 620;
  const MOTO_FACADE_Y_MARGIN = 10;
  const MOTO_WRAP_MELT_TIME  = 15;
  const MOTO_CATCH_RADIUS    = 40; // un poco mas generoso que el de un civil (34): es un bulto mas grande

  // umbral de caida-explosion: EL MISMO que usan civiles/asaltantes para su daño de caida letal
  // (CIVIL_FALL_DAMAGE_MIN_SPEED/ASSAILANT_FALL_DAMAGE_MIN_SPEED), a pedido explicito
  const MOTO_FALL_EXPLODE_MIN_SPEED = 430;

  // ---------- choque (rueda web-golpeada mientras hay jinetes) ----------
  const MOTO_EJECT_VX_MIN = 260, MOTO_EJECT_VX_MAX = 380; // igual de rango que ROLL_EJECT_VX en civiles.js
  const MOTO_EJECT_VY     = -260;
  const MOTO_EJECT_DAMAGE = 1; // vida fija que pierden por el golpe del despiste, aparte del daño de caida normal al aterrizar

  // ---------- atropello (moto sin jinetes, rodando sola) ----------
  const MOTO_RUNOVER_DAMAGE = 1;

  // ---------- explosion ----------
  const MOTO_EXPLOSION_RADIUS = 150;
  const MOTO_EXPLOSION_MAX_DAMAGE = 4;   // a civiles/asaltantes cercanos, con caida lineal segun distancia
  const MOTO_EXPLOSION_PLAYER_DAMAGE = 25; // "casi lo mismo que un balazo" (la bala de asaltante-armado.js hace 30)

  // ---------- pistola del conductor (reusa la ENTIDAD 'asaltanteArmadoBala' de asaltante-armado.js) ----------
  const MOTO_DRIVE_SHOT_RANGE   = 750;
  const MOTO_DRIVE_SHOT_COOLDOWN_MIN = 2.2, MOTO_DRIVE_SHOT_COOLDOWN_MAX = 4.5;
  const MOTO_STOPPED_PANIC_RADIUS = 230; // "cosa dificil, requeriria mucha cercania"

  // ---------- pasajero a pie: mismos numeros que ASSAILANT_* en asaltante.js ----------
  const PASSENGER_WALK_SPEED   = 70;
  const PASSENGER_RUN_SPEED    = MOTO_BASE_RUN_SPEED; // volviendo a la moto corre, no camina
  const PASSENGER_ATTACK_RANGE = 36;
  const PASSENGER_ATTACK_WINDUP = 0.35;
  const PASSENGER_HIT_JUMP_VY  = 220;
  const PASSENGER_MAX_HP       = 5;

  // ================================================================
  //  RUEDA -- hitbox propia, invulnerable, sigue a la moto cuadro a cuadro
  // ================================================================
  registerEntityType('motoAsaltanteRueda', {
    hp: 1,
    hitRadius: MOTO_WHEEL_HIT_RADIUS,
    moveType: 'custom',
    // OJO: NO webAttachable. Ese flag es para el enganche SOSTENIDO (apuntar+click, sistema
    // separado de onWebProjectileHit) -- si la rueda lo tuviera, apuntar cerca de una rueda ya
    // cubierta le "robaba" el enganche al cuerpo de la moto, y como esta entidad se reposiciona
    // sola cada cuadro seguendo a e.parentMoto (ver onUpdate), cualquier tiron que recibiera
    // quedaba cancelado al instante -- ese era el bug de "no me deja jalarla". El telarañazo
    // SUELTO (onWebProjectileHit) funciona igual sin este flag, ver asaltanteArmadoBala en
    // asaltante-armado.js (webAttachable:false y aun asi reacciona a telarañazos sueltos).
    webAttachable: false,
    huggable: false,
    invulnerable: true,
    friendly: false,

    onUpdate(e, dt){
      void dt;
      if(!e.parentMoto || e.parentMoto.dead){ e.dead = true; return; }
      e.x = e.parentMoto.x + e.offsetX;
      e.y = e.parentMoto.y + MOTO_WHEEL_Y_OFFSET;
    },

    // un telarañazo SUELTO que le da de lleno a ESTA rueda -- ver handleWheelHit mas abajo para
    // que hace la moto con esto (choca si tiene jinetes, o se termina de detener si ya no)
    onWebProjectileHit(e){
      if(!e.parentMoto || e.parentMoto.dead || e.parentMoto.exploded) return false;
      handleWheelHit(e.parentMoto, e.side);
      return true;
    },

    draw(){} // la dibuja la moto (ver drawMoto) -- esta entidad es solo la hitbox
  });

  function spawnWheel(moto, side, offsetX){
    return spawnEntity('motoAsaltanteRueda', moto.x+offsetX, moto.y+MOTO_WHEEL_Y_OFFSET, {parentMoto: moto, side, offsetX});
  }

  // ================================================================
  //  CONDUCTOR -- siempre montado mientras existe como este tipo; el disparo
  //  y el manejo los decide la MOTO (ver maybeDrivingShot/maybeStoppedPanicShot
  //  mas abajo), esta entidad solo le da a la bala un "shooter" de verdad y un
  //  lugar donde vivir su hp (aunque en la practica, montado, es invulnerable)
  // ================================================================
  registerEntityType('asaltanteMotoConductor', {
    hp: 1,
    hitRadius: 14,
    moveType: 'custom',
    webAttachable: false,
    huggable: false,
    invulnerable: true, // montado no se puede castigar por separado -- la unica forma de sacarlo es hacer chocar la moto
    friendly: false,

    onUpdate(e, dt){
      void dt;
      const moto = e._homeMoto;
      if(!moto || moto.dead){ e.dead = true; return; } // resguardo: en teoria siempre se lo eyecta/convierte ANTES de que la moto muera
      e.x = moto.x; e.y = moto.y; e.facing = moto.facing;
    },

    draw(){} // lo dibuja la moto, montado
  });

  // ================================================================
  //  PASAJERO -- clon de 'asaltante' (mismo hp/daño/estados compartidos con un
  //  civil), pero con IA propia: en vez de cazar por su cuenta, tiene un
  //  blanco fijo (el que le señalo la moto al parar) y en vez de huir lejos
  //  vuelve caminando/corriendo hacia la moto para remontar
  // ================================================================
  registerEntityType('asaltanteMotoPasajero', Object.assign({}, ENTITY_TYPES['asaltante'], {
    hp: PASSENGER_MAX_HP,

    onSpawn(e){
      e.skinColor  = pickRandom(SKIN_COLORS);
      e.shirtColor = RIDER_SHIRT;
      e.pantsColor = RIDER_PANTS;
      e.weightKg    = 55 + Math.random()*35;
      e.carryWeight = e.weightKg / (window.PLAYER_REFERENCE_WEIGHT_KG || 75);

      e.state = 'walking'; // caso por defecto del dispatch de mas abajo -- nuestra IA vive en e._pState
      e.walkCycle = Math.random()*Math.PI*2;
      e.facing = 1;
      e.dropHoldTimer = 0;
      e.downedForGood = false;
      e._pState = 'approaching';
    },

    onUpdate: passengerOnUpdate,
    draw(ctx, e){ asaltanteDraw(ctx, e); } // mismo monigote + gorrito que un asaltante comun
  }));

  // onDamage/onDeath/onWebProjectileHit se heredan tal cual de 'asaltante' (no los pisamos arriba):
  // mismo daño fijo por golpe, misma animacion de muerte, mismo "envuelto" por telarañazo suelto.

  function pAccelerateTo(e, targetVx, dt){
    const diff = targetVx - e.vx;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), 260*dt);
    e.vx += step;
  }
  function pUpdateFacingAndWalk(e, vx, dt){
    if(Math.abs(vx) > 5) e.facing = vx > 0 ? 1 : -1;
    if(e.grounded && Math.abs(vx) > 15) e.walkCycle += Math.abs(vx)*dt*0.08;
  }

  // ---------- fisica propia del pasajero (calcada de asaltante.js: moveType:'custom' exige que
  // cada tipo se haga cargo de la suya de principio a fin) ----------
  const P_GRAVITY = GRAVITY*0.55, P_TERMINAL_VY = 620, P_FACADE_MARGIN = 10, P_WRAP_MELT = 15;
  const P_FALL_MIN_SPEED = 430, P_FALL_MAX_HP = PASSENGER_MAX_HP, P_LIE_DURATION = 1.1;

  function pApplyFallDamage(e, impactSpeed){
    if(e.dying || e.state==='dead') return;
    if(impactSpeed < P_FALL_MIN_SPEED) return;
    const t = Math.min(1, (impactSpeed-P_FALL_MIN_SPEED)/(P_TERMINAL_VY-P_FALL_MIN_SPEED));
    const dmg = t*P_FALL_MAX_HP;
    if(dmg>0) e.hp -= dmg;
  }
  function pPhysicsStep(e, dt){
    const wasGrounded = e.grounded;
    const prevBottom = e.y + e.hitRadius;
    e.vy += P_GRAVITY*dt;
    if(e.vy > P_TERMINAL_VY) e.vy = P_TERMINAL_VY;
    const impactVy = e.vy;
    e.y += e.vy*dt; e.x += e.vx*dt;
    e.grounded = false; e.standingPlatform = null;
    if(e.vy >= 0){
      for(const plat of platforms){
        const withinX = e.x+e.hitRadius>plat.x && e.x-e.hitRadius<plat.x+plat.w;
        if(withinX && prevBottom<=plat.y+2 && e.y+e.hitRadius>=plat.y){
          e.y=plat.y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=plat; break;
        }
      }
    }
    if(!e.grounded && e.y+e.hitRadius>=STREET_Y){ e.y=STREET_Y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=null; }
    if(e.grounded && !wasGrounded) pApplyFallDamage(e, impactVy);
  }
  function pFindFacadeHit(x,y,r){
    for(const b of buildings){
      if(x+r<=b.x || x-r>=b.x+b.w) continue;
      if(y+r<=b.y+P_FACADE_MARGIN) continue;
      if(y-r>=STREET_Y) continue;
      return b;
    }
    return null;
  }
  function pStickToBuilding(e,b){ e.wrapPhase='stuck'; e.stuckBuilding=b; e.vx=0; e.vy=0; e.grounded=false; e.standingPlatform=null; e.wrapTimer=P_WRAP_MELT; }
  function pEnterWrappedResting(e){ e.wrapPhase='resting'; e.wrapTimer=P_WRAP_MELT; e.vx=0; }
  function pUpdateWrappedFlying(e, dt){
    const prevY = e.y;
    e.vy += P_GRAVITY*dt; if(e.vy>P_TERMINAL_VY) e.vy=P_TERMINAL_VY;
    const impactVy = e.vy;
    e.x += e.vx*dt; e.y += e.vy*dt;
    const hitB = pFindFacadeHit(e.x, e.y, e.hitRadius);
    if(hitB){ pStickToBuilding(e, hitB); return; }
    e.grounded=false; e.standingPlatform=null;
    if(e.vy>=0){
      for(const plat of platforms){
        const withinX = e.x+e.hitRadius>plat.x && e.x-e.hitRadius<plat.x+plat.w;
        if(withinX && prevY+e.hitRadius<=plat.y+2 && e.y+e.hitRadius>=plat.y){
          e.y=plat.y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=plat; break;
        }
      }
    }
    if(!e.grounded && e.y+e.hitRadius>=STREET_Y){ e.y=STREET_Y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=null; }
    if(e.grounded){
      e.vx=0;
      pApplyFallDamage(e, impactVy*0.35);
      if(e.hp>0) pEnterWrappedResting(e);
    }
  }
  function pUpdateWrapped(e, dt){
    if(e.wrapPhase==='stuck'){ e.wrapTimer-=dt; if(e.wrapTimer<=0) pUnwrap(e); return; }
    if(e.wrapPhase==='resting'){ e.vx=0; e.wrapTimer-=dt; if(e.wrapTimer<=0) pUnwrap(e); return; }
    pUpdateWrappedFlying(e, dt);
  }
  function pUnwrap(e){
    e.wrapPhase=null; e.stuckBuilding=null; e._pState='approaching';
    if(e.grounded){
      if(e.standingPlatform) pEnterStranded(e);
      else e.state='walking';
    } else { e.state='falling'; e.vx=0; e.vy=0; }
  }
  function pEnterStranded(e){ e.state='strandedOnRoof'; e.vx=0; e.trembleCycle=Math.random()*Math.PI*2; }
  function pUpdateStranded(e,dt){ e.vx=0; e.trembleCycle+=dt*14; }
  function pUpdateLyingDown(e,dt){ if(e.downedForGood) return; e.lieTimer-=dt; if(e.lieTimer<=0) e.state='walking'; }
  function pUpdateFalling(e,dt){
    if(e.grounded){
      if(e.standingPlatform) pEnterStranded(e);
      else e.state='walking';
    }
  }
  function pUpdateHugging(e,dt){
    const touchingSomethingElse = keys.a||keys.d||keys.w||keys.s||pressed.left||pressed.right;
    if(player.grounded && keys.midMouse && !touchingSomethingElse) e.dropHoldTimer=(e.dropHoldTimer||0)+dt;
    else e.dropHoldTimer=0;
    if(e.dropHoldTimer>=3 && window.dropCivil) window.dropCivil(e, {voluntary:true});
  }
  function pTryCatchTowed(e){
    const dx=player.x-e.x, dy=player.y-e.y;
    if(dx*dx+dy*dy > 34*34) return;
    const group = e.def.carryGroup || e.type;
    const carriedNow = entities.filter(en => (en.def.carryGroup||en.type)===group && en.carried).length;
    if(e.def.carryLimit!==undefined && carriedNow>=e.def.carryLimit) return;
    for(const hand of ['left','right']){ const w=webs[hand]; if(w&&w.state==='attached'&&w.entity===e) detachIfAttached(hand); }
    e.state='hugging'; e.carried=true; e.vx=0; e.vy=0; e.dropHoldTimer=0;
    e.hugSlot = Math.min(carriedNow, 3);
  }

  function passengerOnUpdate(e, dt){
    if(e.state==='dead'){ pUpdateDead(e,dt); return; }
    if(e.state==='hugging'){ pUpdateHugging(e,dt); return; }

    const towedNow = (webs.left && webs.left.state==='attached' && webs.left.entity===e) ||
                      (webs.right && webs.right.state==='attached' && webs.right.entity===e);
    if(towedNow && e.state!=='towed'){ e.state='towed'; e.vx=0; e.vy=0; }
    else if(!towedNow && e.state==='towed'){
      if(e.grounded && e.standingPlatform) pEnterStranded(e);
      else if(e.grounded){ e.state='walking'; if(!e._pState) e._pState='approaching'; }
      else e.state='falling';
    }

    if(e.state==='wrapped'){ pUpdateWrapped(e,dt); return; }

    pPhysicsStep(e, dt);

    if(e.state==='towed'){ pTryCatchTowed(e); return; }
    if(e.state==='falling'){ pUpdateFalling(e,dt); return; }
    if(e.state==='lyingDown'){ pUpdateLyingDown(e,dt); return; }
    if(e.state==='strandedOnRoof'){ pUpdateStranded(e,dt); return; }

    updatePassengerAI(e, dt);
  }

  function pUpdateDead(e, dt){
    e.deadTimer = (e.deadTimer||0)+dt;
    if(e.deadTimer >= 1.05){ e.dead = true; return; }
    e.x += (e.vx||0)*dt; e.vx = (e.vx||0)*0.9;
  }

  // ---------- IA propia del pasajero: aproximarse -> golpear -> volver a la moto ----------
  function updatePassengerAI(e, dt){
    if(!e._pState) e._pState = 'approaching';

    if(e._pState === 'attacking'){
      e.vx = 0;
      e._attackTimer -= dt;
      if(e._attackTimer <= 0) passengerLandAttack(e);
      pUpdateFacingAndWalk(e, 0, dt);
      return;
    }

    if(e._pState === 'returning'){
      const moto = e._homeMoto;
      if(!moto || moto.dead || moto.exploded || moto.state !== 'stopped'){
        convertMotoPassengerToIndependent(e);
        return;
      }
      const dx = moto.x - e.x;
      if(Math.abs(dx) <= MOTO_CATCH_RADIUS){ remountPassenger(e, moto); return; }
      pAccelerateTo(e, (dx>=0?1:-1)*PASSENGER_RUN_SPEED, dt);
      pUpdateFacingAndWalk(e, e.vx, dt);
      return;
    }

    // 'approaching'
    const target = e._targetCivil;
    if(!target || target.dead || target.carried || target.state==='towed'){
      e._pState = 'returning';
      return;
    }
    const dx = target.x - e.x;
    if(Math.abs(dx) <= PASSENGER_ATTACK_RANGE){
      e._pState = 'attacking';
      e._attackTimer = PASSENGER_ATTACK_WINDUP;
      e.facing = dx>=0?1:-1;
      e.vx = 0;
      return;
    }
    pAccelerateTo(e, (dx>=0?1:-1)*PASSENGER_WALK_SPEED, dt);
    pUpdateFacingAndWalk(e, e.vx, dt);
  }

  function passengerLandAttack(e){
    const target = e._targetCivil;
    e._pState = 'returning';
    e._targetCivil = null;
    if(!target || target.dead || target.carried || target.state==='towed') return;

    target.hp -= 1;
    const side = target.x < e.x ? -1 : 1;
    target.vx = side*(50+Math.random()*30);
    target.vy = -PASSENGER_HIT_JUMP_VY;
    target.grounded = false; target.facing = side; target.state = 'scaredJump';

    addMotoWitness(target, e);
    window.pushAssailantMessage('Un asaltante en moto atacó a un civil');
  }

  function remountPassenger(e, moto){
    e.dead = true; // silencioso: no dispara onDeath, simplemente "sube" de nuevo
    moto.passenger = null;
    moto.hasPassengerAboard = true; // vuelve a montado -- beginStoppedEncounter lo habia puesto
                                     // en false al bajarlo, y sin esto drawMoto nunca lo vuelve a
                                     // dibujar aunque la logica diga que ya remonto (este era el
                                     // bug: la moto arrancaba a huir dibujada como si el pasajero
                                     // se hubiera quedado atras, aunque en los datos si volvio)
    beginMotoFleeing(moto);
  }

  // pasa a ser un 'asaltante' comun independiente: se usa cuando lo abandonan, lo interrumpen a
  // mitad de camino, o la moto que lo esperaba ya no esta -- a partir de aca vive TOTALMENTE
  // aparte, con la persistencia/911/policia normales de asaltante.js, sin ninguna relacion con
  // la moto ni el conductor
  function convertMotoPassengerToIndependent(p){
    if(!p || p.dead) return;
    const ne = spawnEntity('asaltante', p.x, p.y, {});
    if(ne){
      ne.hp = p.hp; ne.vx = p.vx; ne.vy = p.vy; ne.grounded = p.grounded; ne.facing = p.facing;
      if(p.state==='lyingDown'){ ne.state='lyingDown'; ne.downedForGood=p.downedForGood; ne.lieTimer=p.lieTimer; }
      else if(p.state==='wrapped'){ ne.state='wrapped'; ne.wrapPhase=p.wrapPhase; ne.wrapTimer=p.wrapTimer; ne.stuckBuilding=p.stuckBuilding; }
      else if(!p.grounded){ ne.state='falling'; }
    }
    if(p._homeMoto && p._homeMoto.passenger === p) p._homeMoto.passenger = null;
    p.dead = true;
  }

  // ---------- radar propio del grito del pasajero (mismo estilo que el de asaltante.js, version
  // compacta) ----------
  let motoWitnesses = [];
  function addMotoWitness(civil, passenger){
    motoWitnesses = motoWitnesses.filter(w => w.civil !== civil);
    motoWitnesses.push({civil, passenger, timer: 5});
  }
  function isOnScreenMoto(x, y, margin){
    const sx = x-camera.x, sy = y-camera.y;
    return sx>margin && sx<canvas.width-margin && sy>margin && sy<canvas.height-margin;
  }
  function drawEdgeRadarMoto(ctx, x, y, color, glyph){
    const margin = 24;
    if(isOnScreenMoto(x,y,margin)) return;
    const sx=x-camera.x, sy=y-camera.y, cx=canvas.width/2, cy=canvas.height/2;
    const dx=sx-cx, dy=sy-cy, angle=Math.atan2(dy,dx);
    const pad=46, halfW=canvas.width/2-pad, halfH=canvas.height/2-pad;
    const scale = Math.min(halfW/Math.abs(dx||0.0001), halfH/Math.abs(dy||0.0001));
    const ix=cx+dx*scale, iy=cy+dy*scale;
    ctx.save();
    ctx.translate(ix,iy); ctx.rotate(angle);
    ctx.fillStyle='rgba(20,20,25,0.72)'; ctx.beginPath(); ctx.arc(0,0,16,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle=color; ctx.lineWidth=2; ctx.stroke();
    ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(21,0); ctx.lineTo(11,-6); ctx.lineTo(11,6); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.fillStyle='#fff'; ctx.font='bold 13px monospace'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(glyph, ix, iy);
    ctx.restore();
  }
  function drawChasePointerMoto(ctx, civil, target){
    const margin=24;
    if(!isOnScreenMoto(civil.x,civil.y,margin)) return;
    const sx=civil.x-camera.x, sy=civil.y-camera.y-22;
    const tx=target.x-camera.x, ty=target.y-camera.y;
    const angle = Math.atan2(ty-sy, tx-sx);
    ctx.save();
    ctx.translate(sx,sy); ctx.rotate(angle);
    ctx.fillStyle='#ff5b3d';
    ctx.beginPath(); ctx.moveTo(9,0); ctx.lineTo(-4,-4); ctx.lineTo(-4,4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  window.WORLD_UPDATE_LISTENERS.push(function(dt){
    for(let i=motoWitnesses.length-1;i>=0;i--){
      const w = motoWitnesses[i];
      w.timer -= dt;
      if(w.timer<=0 || w.civil.dead) motoWitnesses.splice(i,1);
    }
  });
  window.HUD_DRAW_LISTENERS.push(function(ctx){
    for(const w of motoWitnesses){
      drawEdgeRadarMoto(ctx, w.civil.x, w.civil.y, '#ff5b3d', '!');
      if(w.passenger && !w.passenger.dead) drawChasePointerMoto(ctx, w.civil, w.passenger);
    }
  });
  window.RESET_LISTENERS.push(function(){ motoWitnesses = []; });

  // ================================================================
  //  LA MOTO
  // ================================================================
  function wheelsBothCovered(e){ return !!e.wheelsCovered && e.wheelsCovered.size >= 2; }

  function motoOnSpawn(e){
    e.facing = Math.random() < 0.5 ? -1 : 1;
    e.state = 'patrolling';
    e.vx = e.facing * MOTO_PATROL_SPEED * 0.6;
    e.wheelsCovered = new Set();
    e.hasPassengerAboard = true;
    e.exploded = false;
    e.wheelSpin = 0;

    const conductor = spawnEntity('asaltanteMotoConductor', e.x, e.y, {});
    if(conductor){ conductor._homeMoto = e; e.conductor = conductor; }
    e.wheelFront = spawnWheel(e, 'front', MOTO_WHEEL_OFFSET_X);
    e.wheelBack  = spawnWheel(e, 'back', -MOTO_WHEEL_OFFSET_X);

    // mismo radar generico que usa el boss (entities/bossengine.js lo carga antes, y
    // crazylimemonster.js ya lo usa para su propio icono "MLL") -- asi el jugador la ve venir
    // (o la puede evitar) aunque este lejos, sea cual sea el estado en el que este
    if(typeof registerRadarTarget === 'function'){
      registerRadarTarget(() => (e.dead ? null : e), {label: '🏍️', color: MOTO_BODY_COLOR});
    }

    // el anchor deja de "contar" (devuelve null) apenas queda FULL quieta (stoppedRiderless),
    // ademas de cuando muere -- ya inerte y sin jinetes, no hace falta seguir forzando su chunk
    // cargado: no se va a volver a mover sola, asi que no necesita que el mundo real (edificios/
    // plataformas) siga simulado a su alrededor mientras el jugador anda lejos
    registerForcedChunkAnchor(() => (e.dead || e.state === 'stoppedRiderless') ? null : e);
  }

  // ---------- rueda golpeada por un telarañazo suelto (ver motoAsaltanteRueda.onWebProjectileHit) ----------
  function handleWheelHit(moto, side){
    if(moto.dead || moto.exploded) return;
    if(moto.wheelsCovered.has(side)) return;
    moto.wheelsCovered.add(side);

    const hadRiders = (moto.state==='patrolling' || moto.state==='stopping' || moto.state==='stopped' || moto.state==='fleeing');
    if(hadRiders){
      crashMoto(moto);
    } else if((moto.state==='wildRiderless' || moto.state==='stoppedRiderless') && wheelsBothCovered(moto)){
      moto.vx = 0;
      moto.state = 'stoppedRiderless';
    }
  }

  function spawnFallingIndependent(type, moto, dirSign){
    const e = spawnEntity(type, moto.x, moto.y, {});
    if(!e) return null;
    e.state = 'falling';
    e.vx = dirSign*(MOTO_EJECT_VX_MIN + Math.random()*(MOTO_EJECT_VX_MAX-MOTO_EJECT_VX_MIN));
    e.vy = MOTO_EJECT_VY;
    e.grounded = false;
    e.facing = dirSign;
    if(!e.dying && e.state!=='dead') e.hp -= MOTO_EJECT_DAMAGE;
    return e;
  }

  function crashMoto(moto){
    const dir = moto.facing || 1;
    if(moto.conductor && !moto.conductor.dead){
      spawnFallingIndependent('asaltanteArmado', moto, dir);
      moto.conductor.dead = true;
      moto.conductor = null;
    }
    if(moto.hasPassengerAboard){
      spawnFallingIndependent('asaltante', moto, -dir);
      moto.hasPassengerAboard = false;
    }
    // si el pasajero ya habia bajado y estaba en su mandado a pie (moto.passenger), no lo toca el
    // choque en si -- su propia IA (rama 'returning') detecta solo que la moto ya no esta en
    // 'stopped' y se convierte en independiente (ver updatePassengerAI)
    moto.passenger = null;
    moto.state = 'wildRiderless';
    moto.vx = dir * MOTO_WILD_SPEED;
    window.pushAssailantMessage('Una moto de asaltantes chocó');
  }

  // ---------- explosion ----------
  function explodeMoto(e){
    if(e.exploded) return;
    e.exploded = true;
    e.dead = true;

    for(const other of entities){
      if(other===e || other.dead) continue;
      if(other.type!=='civil' && other.type!=='asaltante' && other.type!=='asaltanteArmado' && other.type!=='asaltanteMotoPasajero') continue;
      const d = Math.hypot(other.x-e.x, other.y-e.y);
      if(d > MOTO_EXPLOSION_RADIUS) continue;
      const dmg = MOTO_EXPLOSION_MAX_DAMAGE * (1 - d/MOTO_EXPLOSION_RADIUS);
      if(dmg > 0) other.hp -= dmg; // directo, bypaseando invulnerable -- mismo criterio que el daño de caida
    }
    if(Math.hypot(player.x-e.x, player.y-e.y) <= MOTO_EXPLOSION_RADIUS){
      damagePlayer(MOTO_EXPLOSION_PLAYER_DAMAGE);
    }

    motoExplosions.push({x: e.x, y: e.y, timer: 0.4});
    window.pushAssailantMessage('Una moto de asaltantes explotó');
  }

  function checkMotoLandingImpact(e, impactSpeed){
    if(e.dead || e.exploded) return;
    if(impactSpeed < MOTO_FALL_EXPLODE_MIN_SPEED) return;
    explodeMoto(e);
  }

  // ---------- fisica propia (calcada de civiles.js/asaltante.js) ----------
  function motoPhysicsStep(e, dt){
    const wasGrounded = e.grounded;
    const prevBottom = e.y + e.hitRadius;
    e.vy += MOTO_GRAVITY*dt;
    if(e.vy > MOTO_TERMINAL_VY) e.vy = MOTO_TERMINAL_VY;
    const impactVy = e.vy;
    e.y += e.vy*dt; e.x += e.vx*dt;
    e.grounded = false; e.standingPlatform = null;
    if(e.vy >= 0){
      for(const plat of platforms){
        const withinX = e.x+e.hitRadius>plat.x && e.x-e.hitRadius<plat.x+plat.w;
        if(withinX && prevBottom<=plat.y+2 && e.y+e.hitRadius>=plat.y){
          e.y=plat.y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=plat; break;
        }
      }
    }
    if(!e.grounded && e.y+e.hitRadius>=STREET_Y){ e.y=STREET_Y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=null; }
    if(e.grounded && !wasGrounded) checkMotoLandingImpact(e, impactVy);
  }

  function motoFindFacadeHit(x,y,r){
    for(const b of buildings){
      if(x+r<=b.x || x-r>=b.x+b.w) continue;
      if(y+r<=b.y+MOTO_FACADE_Y_MARGIN) continue;
      if(y-r>=STREET_Y) continue;
      return b;
    }
    return null;
  }
  function motoStickToBuilding(e,b){ e.wrapPhase='stuck'; e.stuckBuilding=b; e.vx=0; e.vy=0; e.grounded=false; e.standingPlatform=null; e.wrapTimer=MOTO_WRAP_MELT_TIME; }
  function motoEnterWrappedResting(e){ e.wrapPhase='resting'; e.wrapTimer=MOTO_WRAP_MELT_TIME; e.vx=0; }
  function motoUpdateWrappedFlying(e, dt){
    const prevY = e.y;
    e.vy += MOTO_GRAVITY*dt; if(e.vy>MOTO_TERMINAL_VY) e.vy=MOTO_TERMINAL_VY;
    e.x += e.vx*dt; e.y += e.vy*dt;
    const hitB = motoFindFacadeHit(e.x, e.y, e.hitRadius);
    if(hitB){ motoStickToBuilding(e, hitB); return; }
    e.grounded=false; e.standingPlatform=null;
    if(e.vy>=0){
      for(const plat of platforms){
        const withinX = e.x+e.hitRadius>plat.x && e.x-e.hitRadius<plat.x+plat.w;
        if(withinX && prevY+e.hitRadius<=plat.y+2 && e.y+e.hitRadius>=plat.y){
          e.y=plat.y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=plat; break;
        }
      }
    }
    if(!e.grounded && e.y+e.hitRadius>=STREET_Y){ e.y=STREET_Y-e.hitRadius; e.vy=0; e.grounded=true; e.standingPlatform=null; }
    // aterrizo mientras seguia "envuelta": el telarañazo del cuerpo evita la explosion del todo,
    // sea cual sea la velocidad de impacto -- por eso NO llamamos a checkMotoLandingImpact aca
    if(e.grounded){ e.vx=0; if(e.hp>0) motoEnterWrappedResting(e); }
  }
  function motoUpdateWrapped(e, dt){
    if(e.wrapPhase==='stuck'){ e.wrapTimer-=dt; if(e.wrapTimer<=0) motoUnwrap(e); return; }
    if(e.wrapPhase==='resting'){ e.vx=0; e.wrapTimer-=dt; if(e.wrapTimer<=0) motoUnwrap(e); return; }
    motoUpdateWrappedFlying(e, dt);
  }
  function motoUnwrap(e){
    e.wrapPhase=null; e.stuckBuilding=null;
    if(e.grounded){
      e.state = wheelsBothCovered(e) ? 'stoppedRiderless' : 'wildRiderless';
      if(e.state==='wildRiderless') e.vx = (e.facing||1)*MOTO_WILD_SPEED*0.5;
    } else { e.state='falling'; e.vx=0; e.vy=0; }
  }

  // telarañazo suelto que le pega al CUERPO de la moto (no a una rueda): solo reacciona si ya
  // esta sin jinetes -- mientras la manejan, unicamente las ruedas (ver arriba) reaccionan
  function motoOnWebProjectileHit(e, dirX, dirY, speed){
    if(e.dead || e.exploded || e.carried || e.state==='hugging' || e.state==='towed' || e.state==='wrapped') return false;
    if(!(e.state==='wildRiderless' || e.state==='stoppedRiderless')) return false;
    const pushSpeed = speed * 0.3 * 0.5; // amortiguado (0.5): la moto pesa bastante mas que un civil
    e.state = 'wrapped';
    e.wrapPhase = 'flying';
    e.stuckBuilding = null;
    e.vx = dirX*pushSpeed; e.vy = dirY*pushSpeed;
    e.grounded = false; e.standingPlatform = null;
    return true;
  }

  // ---------- a proposito NO hay "cargada abrazada" (hugging) para la moto -- a diferencia de un
  // civil o un asaltante de a pie, no tiene sentido que el jugador la lleve en brazos: es una
  // moto. Por eso, a diferencia de civiles.js/asaltante.js/asaltante-armado.js, ACA NO existe un
  // tryCatchTowedMoto que la "atrape" en hugging apenas el jugador se le acerca sostenida por la
  // telarana -- la moto se queda colgando en 'towed' indefinidamente (podes arrastrarla/jalarla
  // con la soga con total normalidad, incluida la reeleada de boton medio) hasta que sueltes el
  // enganche. huggable:false (ver registerEntityType mas abajo) es lo que le dice al MOTOR que no
  // habilite ese agarre por cercania para esta entidad en particular.
  function updateMotoFalling(e, dt){
    if(e.grounded && !e.exploded){
      e.state = wheelsBothCovered(e) ? 'stoppedRiderless' : 'wildRiderless';
      if(e.state==='wildRiderless') e.vx = (e.facing||1)*MOTO_WILD_SPEED*0.5;
    }
  }

  // ---------- IA de manejo ----------
  function motoAccelerateTo(e, targetVx, dt){
    const diff = targetVx - e.vx;
    const step = Math.sign(diff)*Math.min(Math.abs(diff), MOTO_ACCEL*dt);
    e.vx += step;
  }
  function motoUpdateFacingAndSpin(e, vx, dt){
    if(Math.abs(vx) > 5) e.facing = vx>0?1:-1;
    e.wheelSpin += Math.abs(vx)*dt*0.05;
  }

  function findNearestCivilForMoto(e){
    let best=null, bestD=MOTO_SEARCH_RADIUS;
    for(const other of entities){
      if(other.type!=='civil' || other.dead) continue;
      if(other.carried || other.beingReeled || other.state==='towed') continue;
      if(other.state!=='walking' && other.state!=='chatting' && other.state!=='gathering') continue;
      if(!other.grounded || other.standingPlatform) continue;
      const d = Math.abs(other.x-e.x);
      if(d<bestD){ bestD=d; best=other; }
    }
    return best;
  }

  function fireMotoGun(e, tx, ty){
    if(!e.conductor || e.conductor.dead) return;
    const dx=tx-e.x, dy=ty-e.y, dist=Math.hypot(dx,dy)||1;
    spawnEntity('asaltanteArmadoBala', e.x+dx/dist*24, e.y+dy/dist*24-6, {
      dirX: dx/dist, dirY: dy/dist, targetCivil: null, shooter: e.conductor
    });
    window.pushAssailantMessage('Un asaltante en moto disparó');
    e._gunFlashTimer = 0.15;
    if(isOnScreenMoto(e.x,e.y,0) && typeof spiderSenseOn !== 'undefined' && !spiderSenseOn){
      spiderSenseOn = true;
    }
  }

  function maybeDrivingShot(e, dt){
    if(!e.conductor || e.conductor.dead) return;
    if(e._driveShotCooldown === undefined) e._driveShotCooldown = MOTO_DRIVE_SHOT_COOLDOWN_MIN + Math.random()*(MOTO_DRIVE_SHOT_COOLDOWN_MAX-MOTO_DRIVE_SHOT_COOLDOWN_MIN);
    e._driveShotCooldown -= dt;
    if(e._driveShotCooldown <= 0){
      e._driveShotCooldown = MOTO_DRIVE_SHOT_COOLDOWN_MIN + Math.random()*(MOTO_DRIVE_SHOT_COOLDOWN_MAX-MOTO_DRIVE_SHOT_COOLDOWN_MIN);
      if(Math.hypot(player.x-e.x, player.y-e.y) <= MOTO_DRIVE_SHOT_RANGE) fireMotoGun(e, player.x, player.y);
    }
  }

  function maybeStoppedPanicShot(e){
    if(e._earlyFleeTriggered) return;
    if(!e.conductor || e.conductor.dead) return;
    if(Math.hypot(player.x-e.x, player.y-e.y) > MOTO_STOPPED_PANIC_RADIUS) return;
    fireMotoGun(e, player.x, player.y);
    e._earlyFleeTriggered = true;
    if(e.passenger && !e.passenger.dead){
      convertMotoPassengerToIndependent(e.passenger); // no llego a volver: queda abandonado, ya independiente
      e.passenger = null;
    }
    beginMotoFleeing(e);
  }

  function beginMotoFleeing(e){
    e.state = 'fleeing';
    e._fleeStartX = e.x;
    e._earlyFleeTriggered = false;
  }

  function beginStoppedEncounter(e){
    e.state = 'stopped';
    e._stoppedTimer = 0;
    e._earlyFleeTriggered = false;
    if(e._motoTarget && !e._motoTarget.dead){
      e.hasPassengerAboard = false;
      const p = spawnEntity('asaltanteMotoPasajero', e.x, e.y, {});
      if(p){ p._targetCivil = e._motoTarget; p._homeMoto = e; e.passenger = p; }
      e._motoTarget = null;
      e._noTargetStop = false;
    } else {
      e._motoTarget = null;
      e._noTargetStop = true;
    }
  }

  function updatePatrolling(e, dt){
    maybeDrivingShot(e, dt);
    if(!e._motoTarget){
      const t = findNearestCivilForMoto(e);
      if(t) e._motoTarget = t;
    }
    let dir = e.facing;
    if(e._motoTarget){
      if(e._motoTarget.dead || e._motoTarget.carried || e._motoTarget.state==='towed'){
        e._motoTarget = null;
      } else {
        const dx = e._motoTarget.x - e.x;
        dir = dx>=0?1:-1;
        if(Math.abs(dx) <= MOTO_STOP_TRIGGER_DIST){ e.state = 'stopping'; return; }
      }
    }
    motoAccelerateTo(e, dir*MOTO_PATROL_SPEED, dt);
    motoUpdateFacingAndSpin(e, e.vx, dt);
  }

  function updateStopping(e, dt){
    maybeDrivingShot(e, dt);
    motoAccelerateTo(e, 0, dt);
    motoUpdateFacingAndSpin(e, e.vx, dt);
    if(Math.abs(e.vx) < 8){ e.vx = 0; beginStoppedEncounter(e); }
  }

  function updateStopped(e, dt){
    e._stoppedTimer += dt;
    maybeStoppedPanicShot(e);
    if(e._earlyFleeTriggered) return; // beginMotoFleeing ya se llamo desde maybeStoppedPanicShot

    if(e._noTargetStop){
      if(e._stoppedTimer > 1.2){ e.state = 'patrolling'; }
      return;
    }
    // OJO: el timeout NO debe cortar a un pasajero que ya esta volviendo ('_pState' returning) --
    // ese era el bug: aunque nadie interrumpiera nada, si el mandado completo (ida + golpe +
    // vuelta) se pasaba un poco de MOTO_PASSENGER_TIMEOUT, se lo abandonaba a mitad de camino de
    // vuelta (a veces literal a un paso de remontar). Una vez que ya esta 'returning' la distancia
    // solo se achica (corre, no camina) asi que dejarlo llegar SIEMPRE es seguro, y es justo lo que
    // dice el diseño de arriba: "si nadie interrumpe nada... vuelve caminando, remonta". El
    // timeout sigue sirviendo para el caso que de verdad le importa: un pasajero tardando de mas
    // mientras todavia esta yendo hacia el blanco.
    if(e._stoppedTimer > MOTO_PASSENGER_TIMEOUT && e.passenger && !e.passenger.dead &&
       e.passenger._pState !== 'returning'){
      convertMotoPassengerToIndependent(e.passenger);
      e.passenger = null;
      beginMotoFleeing(e);
    }
  }

  function updateFleeing(e, dt){
    maybeDrivingShot(e, dt);
    motoAccelerateTo(e, e.facing*MOTO_FLEE_SPEED, dt);
    motoUpdateFacingAndSpin(e, e.vx, dt);
    if(Math.abs(e.x - e._fleeStartX) >= (typeof CHUNK_WIDTH !== 'undefined' ? CHUNK_WIDTH : 1400)){
      e.state = 'patrolling';
    }
  }

  function checkRunOverCivils(e){
    for(const other of entities){
      if(other.type!=='civil' || other.dead) continue;
      if(other.carried || other.beingReeled || other.state==='towed') continue;
      if(other.state!=='walking' && other.state!=='chatting' && other.state!=='gathering') continue;
      const d = Math.abs(other.x-e.x);
      if(d > e.hitRadius + (other.hitRadius||14)) continue;
      other.hp -= MOTO_RUNOVER_DAMAGE;
      const side = other.x < e.x ? -1 : 1;
      other.vx = side*(70+Math.random()*40);
      other.vy = -220;
      other.grounded = false; other.facing = side; other.state = 'scaredJump';
    }
  }

  function updateWildRiderless(e, dt){
    if(e.vx === 0) e.vx = (e.facing||1) * MOTO_WILD_SPEED;
    motoUpdateFacingAndSpin(e, e.vx, dt);
    checkRunOverCivils(e);
  }

  // ---------- dispatch principal ----------
  function motoOnUpdate(e, dt){
    if(e.exploded) return;
    if(e._gunFlashTimer > 0) e._gunFlashTimer -= dt;

    // (no hay caso 'hugging' aca -- ver la nota junto a updateMotoFalling: la moto nunca entra en
    // ese estado, huggable:false le impide al motor agarrarla por cercania mientras esta 'towed')

    const towedNow = (webs.left && webs.left.state==='attached' && webs.left.entity===e) ||
                      (webs.right && webs.right.state==='attached' && webs.right.entity===e);
    if(towedNow && e.state!=='towed' &&
       (e.state==='wildRiderless' || e.state==='stoppedRiderless' || e.state==='wrapped')){
      if(e.state==='wrapped'){ e.wrapPhase = null; e.stuckBuilding = null; }
      e.state = 'towed'; e.vx=0; e.vy=0;
    } else if(!towedNow && e.state==='towed'){
      if(e.grounded) e.state = wheelsBothCovered(e) ? 'stoppedRiderless' : 'wildRiderless';
      else e.state = 'falling';
    }

    if(e.state === 'wrapped'){ motoUpdateWrapped(e, dt); return; }

    motoPhysicsStep(e, dt);
    if(e.exploded) return; // motoPhysicsStep puede haber disparado la explosion recien al aterrizar

    // en 'towed' no hay nada mas que hacer aca: se queda colgando de la soga (la arrastra/reelea
    // el motor solo, via applyEntityRopePull/el jalon de boton medio) hasta que la sueltes -- sin
    // el tryCatchTowedMoto que tenian los demas tipos, nunca pasa a 'hugging' (ver nota arriba)
    if(e.state === 'towed'){ return; }
    if(e.state === 'falling'){ updateMotoFalling(e, dt); return; }
    if(e.state === 'patrolling'){ updatePatrolling(e, dt); return; }
    if(e.state === 'stopping'){ updateStopping(e, dt); return; }
    if(e.state === 'stopped'){ updateStopped(e, dt); return; }
    if(e.state === 'fleeing'){ updateFleeing(e, dt); return; }
    if(e.state === 'wildRiderless'){ updateWildRiderless(e, dt); return; }
    if(e.state === 'stoppedRiderless'){ e.vx = 0; return; }
  }

  // ---------- explosiones: efecto visual liviano, en espacio de camara (screen-space) ----------
  let motoExplosions = [];
  window.WORLD_UPDATE_LISTENERS.push(function(dt){
    for(let i=motoExplosions.length-1;i>=0;i--){
      motoExplosions[i].timer -= dt;
      if(motoExplosions[i].timer <= 0) motoExplosions.splice(i,1);
    }
  });
  window.HUD_DRAW_LISTENERS.push(function(ctx){
    for(const ex of motoExplosions){
      const t = 1 - Math.max(0, ex.timer/0.4);
      const sx = ex.x - camera.x, sy = ex.y - camera.y;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1-t);
      ctx.fillStyle = t < 0.5 ? '#ffd27a' : '#ff5b3d';
      ctx.beginPath();
      ctx.arc(sx, sy, 20 + t*90, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }
  });
  window.RESET_LISTENERS.push(function(){ motoExplosions = []; });

  // ---------- registro del tipo ----------
  registerEntityType('motoAsaltante', {
    hp: 1,
    hitRadius: MOTO_HIT_RADIUS,
    moveType: 'custom',
    webAttachable: true,
    huggable: false, // a proposito: se puede enganchar/arrastrar con la telaraña, pero NO cargar
                      // abrazada como a un civil/asaltante de a pie -- es una moto (ver mas abajo,
                      // ya no hay tryCatchTowedMoto para esta entidad)
    pullMass: 4,     // pesada: cuesta bastante frenarla/arrastrarla con una sola telaraña
    carryGroup: 'motoAsaltante',
    carryLimit: 1,
    carryWeight: 320 / (window.PLAYER_REFERENCE_WEIGHT_KG || 75), // ~320kg, moto+algo de inercia
    friendly: false,
    invulnerable: true, // a los puños/patadas no le hacen nada -- solo cuenta el choque (rueda), la caida, y la explosion
    onSpawn: motoOnSpawn,
    onUpdate: motoOnUpdate,
    onWebProjectileHit: motoOnWebProjectileHit,
    draw: drawMoto
  });

  // ---------- dibujo ----------
  function drawWheel(ctx, x, y, covered, spin){
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.fillStyle = MOTO_WHEEL_COLOR;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = '#4a4d54'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-8,0); ctx.lineTo(8,0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(0,8); ctx.stroke();
    ctx.restore();
    if(covered){
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = MOTO_WEB_PATCH;
      ctx.strokeStyle = 'rgba(160,160,160,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  function drawRiderFigure(ctx, dx, dy, facing, shirtColor, pantsColor, skinColor){
    ctx.save();
    ctx.translate(dx, dy);
    ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.strokeStyle = pantsColor;
    ctx.beginPath(); ctx.moveTo(0,2); ctx.lineTo(facing*7, 9); ctx.stroke();
    ctx.strokeStyle = shirtColor;
    ctx.beginPath(); ctx.moveTo(0,-6); ctx.lineTo(0,2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(facing*6,-1); ctx.stroke();
    ctx.fillStyle = skinColor;
    ctx.beginPath(); ctx.arc(0,-10,5,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawMoto(ctx, e){
    ctx.save();
    ctx.translate(e.x, e.y);
    if(e.state === 'wrapped') ctx.rotate(e.rotation || 0);

    // cuerpo
    ctx.fillStyle = MOTO_BODY_DARK;
    ctx.beginPath();
    ctx.ellipse(0, MOTO_WHEEL_Y_OFFSET*0.4, MOTO_WHEEL_OFFSET_X+6, 10, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = MOTO_BODY_COLOR;
    ctx.beginPath();
    ctx.ellipse(0, MOTO_WHEEL_Y_OFFSET*0.4 - 3, MOTO_WHEEL_OFFSET_X, 7, 0, 0, Math.PI*2);
    ctx.fill();

    // manubrio + faro, del lado que mira
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(e.facing*(MOTO_WHEEL_OFFSET_X-2), MOTO_WHEEL_Y_OFFSET*0.2, 4, 0, Math.PI*2);
    ctx.fill();

    // jinetes montados (si sigue en cualquiera de los estados "con jinetes")
    const ridden = (e.state==='patrolling'||e.state==='stopping'||e.state==='stopped'||e.state==='fleeing');
    if(ridden){
      if(e.hasPassengerAboard){
        drawRiderFigure(ctx, -e.facing*6, -6, e.facing, RIDER_SHIRT, RIDER_PANTS, '#c98a5c');
      }
      drawRiderFigure(ctx, e.facing*3, -8, e.facing, RIDER_SHIRT, RIDER_PANTS, '#e8b48c');
      // pistola del conductor, apuntando al frente (o con un flash breve al disparar)
      ctx.save();
      ctx.translate(e.facing*3, -12);
      ctx.rotate(e._gunFlashTimer>0 ? Math.atan2(player.y-e.y, player.x-e.x) : (e.facing>=0?0:Math.PI));
      ctx.fillStyle = e._gunFlashTimer>0 ? '#ffd27a' : '#15171a';
      ctx.fillRect(0,-2,12,4);
      ctx.restore();
    }

    ctx.restore();

    // ruedas: fuera del translate/rotate de arriba a proposito -- solo giran con su propio spin
    // al andar, no con e.rotation (que solo se usa mientras la envuelve la telaraña)
    drawWheel(ctx, e.x+MOTO_WHEEL_OFFSET_X, e.y+MOTO_WHEEL_Y_OFFSET, e.wheelsCovered && e.wheelsCovered.has('front'), e.wheelSpin||0);
    drawWheel(ctx, e.x-MOTO_WHEEL_OFFSET_X, e.y+MOTO_WHEEL_Y_OFFSET, e.wheelsCovered && e.wheelsCovered.has('back'), e.wheelSpin||0);

    // envuelta en telaraña: mismo ovalo que usan civiles/asaltantes
    if(e.state === 'wrapped'){
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.fillStyle = MOTO_WEB_PATCH;
      ctx.strokeStyle = 'rgba(160,160,160,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, MOTO_WHEEL_Y_OFFSET*0.3, MOTO_WHEEL_OFFSET_X+4, 14, 0, 0, Math.PI*2);
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ================================================================
  //  SPAWN POR CHUNK -- CON REROLL
  // ----------------------------------------------------------------
  //  Mismo patron que assailantChunkState/armedChunkState en asaltante.js/
  //  asaltante-armado.js: si el chunk no tiene entrada, o la tiene pero su
  //  moto ya "se resolvio", se vuelve a tirar el dado. La diferencia con esos
  //  dos archivos es que aca "resolverse" NO es que se congele por chunk
  //  descargado (la moto no se congela: usa registerForcedChunkAnchor, ver
  //  motoOnSpawn, para seguir simulandose aunque ande lejos de este chunk) --
  //  es, directamente, que la entidad moto haya muerto de verdad (exploto).
  //  Una moto 'stoppedRiderless' (sin jinetes, ya detenida, pero todavia
  //  entera en el mundo) sigue contando como "sin resolver": mientras exista,
  //  este chunk no vuelve a intentar otra. Recien cuando explota (por caida,
  //  o porque el jugador la agarra y la deja caer de una altura) el chunk
  //  vuelve a tener chance en su proxima carga.
  //
  //  Al igual que en esos archivos, usamos Math.random() en vez del rng
  //  deterministico del chunk (chunkEntityRng) -- ese es perfecto para lo que
  //  fue pensado (edificios, poblacion fija de civiles) pero el mismo
  //  chunkIndex siempre daria la MISMA secuencia de numeros, y el reroll
  //  quedaria pisado: si le toco una vez, le tocaria para siempre; si nunca
  //  le toco, no le tocaria jamas. Math.random() es el unico que necesita
  //  variar de verdad entre visitas.
  // ================================================================
  const motoChunkState = new Map(); // chunkIndex -> {moto: entity|null}

  window.CHUNK_LOAD_LISTENERS.push(function(chunkIndex, startX, endX, rng){
    void rng;
    const st = motoChunkState.get(chunkIndex);
    if(st && st.moto && !st.moto.dead) return; // ya tiene una moto activa (viva en cualquier estado, este donde este)

    if(Math.random() >= MOTO_SPAWN_CHANCE){
      motoChunkState.set(chunkIndex, {moto: null}); // no le toco esta vez -- reroll la proxima carga
      return;
    }

    const x = startX + 120 + Math.random()*(endX - startX - 240);
    const e = spawnEntity('motoAsaltante', x, STREET_Y - MOTO_HIT_RADIUS);
    motoChunkState.set(chunkIndex, {moto: e || null});
  });

  window.RESET_LISTENERS.push(function(){ motoChunkState.clear(); });

  // ---------- captura pasiva al descargar chunk: si la dejas FULL quieta ('stoppedRiderless' --
  // sin jinetes y ya detenida del todo, no rodando sola) cerca de una llamada al 911 hecha antes
  // (misma señal que usan asaltante.js/asaltante-armado.js: window.getAssailant911Chunks), la
  // policia se la lleva mientras no mirabas, igual que a un asaltante tirado/envuelto. Iteramos
  // TODAS las entradas (no solo la del chunk de "origen"/spawn) porque la moto puede terminar
  // FULL quieta lejos de donde nacio -- misma razon que documentan esos dos archivos para su
  // propia version de este mismo chequeo ----------
  window.CHUNK_UNLOAD_LISTENERS.push(function(chunkIndex){
    for(const st of motoChunkState.values()){
      if(!st.moto || st.moto.dead) continue;
      const m = st.moto;
      if(m.state !== 'stoppedRiderless') continue;
      if(Math.floor(m.x / CHUNK_WIDTH) !== chunkIndex) continue;

      const calledChunks = window.getAssailant911Chunks ? window.getAssailant911Chunks() : null;
      const nearby911 = !!calledChunks && (calledChunks.has(chunkIndex-1) || calledChunks.has(chunkIndex) || calledChunks.has(chunkIndex+1));
      if(!nearby911) continue;

      m.dead = true;
      st.moto = null; // libera este chunk para que pueda volver a tocarle un dúo nuevo
      window.pushAssailantMessage('La policía se llevó una moto abandonada');
    }
  });

})();
