// ============================================================================
//  entities/crazylimemonster.js
// ----------------------------------------------------------------------------
//  Monstruo Loco Lima (CrazyLimeMonster): el primer boss del juego.
//
//  Se invoca llevando a Jary Mane al techo de un edificio CosCorp (evento
//  'jarymane-coscorp-rooftop', disparado por entities/jaryman.js). A partir
//  de ahi, TODO lo que hace el boss vive en una maquina de estados: `e.phase`
//  (string) + BOSS_PHASES[e.phase] = {enter, update, exit}. transitionPhase()
//  es la UNICA forma de cambiar de fase -- llama exit() de la vieja y enter()
//  de la nueva, siempre en ese orden, para que cada fase pueda dejar todo
//  limpio (soltar telaraña, apagar el arrastre, apagar el bullet time
//  automatico, etc.) antes de que la que sigue arranque.
//
//  Estado de avance de esta pasada (10 ago): las 8 fases estan implementadas de punta a punta
//  (F1-F4 aparicion/huida/arrastre/rescate, F5-F8 embestidas/bombardeo en el techo/aerodeslizador/
//  duelo final). Pendiente de pulir (ver comentarios puntuales en cada fase): animaciones propias
//  del boss para embestir/lanzar/caer/levantarse (hoy reusa el mismo dibujo "flotando" de
//  siempre). El remonte al techo (tanto la primera vez, F5->F6, como cuando el aerodeslizador
//  vuelve, F7->F6) ya sube de verdad via REMOUNTING -- no hay ningun salto/teletransporte a la
//  posicion del techo en ningun lado.
// ============================================================================

(function(){

  // ---------- apariencia ----------
  const BOSS_HEAD_COLOR  = '#3fae4a';
  const BOSS_LIMB_COLOR  = '#3fae4a';
  const BOSS_TORSO_COLOR = '#6a3fae';
  const BOSS_HAT_COLOR   = '#8a4fd6';
  const BOSS_SLED_COLOR  = '#9aa0a8';

  const BOSS_HIT_RADIUS = 22;
  const BOSS_HP = 500; // placeholder: sigue invulnerable hasta que el combate de bombas (fases 6/8) este armado

  // ---------- velocidades de referencia de la huida (fase 2) ----------
  // MAX_RUN_SPEED es del motor (spiderswing.html): la velocidad tope del jugador corriendo.
  const FLEE_START_SPEED = 1000;               // arranca claramente mas rapido que cualquier cosa que el jugador pueda alcanzar corriendo
  const FLEE_END_SPEED   = MAX_RUN_SPEED * 1.5; // 810: el piso al que decelera -- todavia mas rapido que correr, hace falta swing/telaraña
  const FLEE_DECEL_TIME  = 7;                   // segundos que tarda en pasar de una velocidad a la otra
  const FLEE_GRAB_MARGIN = 1.15;                // por debajo de FLEE_END_SPEED*este numero ya se considera "agarrable"

  const DRAG_DURATION = 6; // segundos de arrastre por el asfalto (fase 3) antes de soltar y frenar

  // velocidad en el suelo durante el arrastre: MUCHO mas rapida que el vuelo de la huida -- es
  // justamente esa velocidad la que hace que aterrizar de golpe no duela nada (ver
  // window.enterDragState en el motor: el estado DETENIENDO nunca pasa por el calculo de daño
  // de caida de siempre, la velocidad en X "salva" al jugador porque no se llega a simular un
  // impacto como tal, es un arrastre desde el primer instante)
  const DRAG_GROUND_SPEED = FLEE_END_SPEED * 2.3; // bastante mas rapido que los 810 "agarrables" del vuelo

  // ---------- fase 5: embestidas (misil teledirigido) ----------
  const MISSILE_PREP_SPEED    = 480;  // velocidad al reposicionarse antes de embestir
  const MISSILE_CHARGE_SPEED  = 1200; // velocidad de la embestida en si
  const MISSILE_BRAKE_DURATION = 0.5;
  const MISSILE_STANDOFF_MIN  = 260;  // radio minimo/maximo del punto de "preparacion" alrededor del jugador
  const MISSILE_STANDOFF_MAX  = 420;
  const MISSILE_HIT_MARGIN    = 6;    // margen extra sumado a los hitRadius para el chequeo de impacto
  const MISSILE_HIT_DAMAGE    = 20;
  const MISSILE_KNOCKBACK     = 520;
  const JM_IMPACT_DAMAGE      = 25;   // "pierde una vida" -- un golpe de verdad a su hp (esta construida sobre civil, ya tiene vida propia)
  const JM_IMPACT_KNOCKBACK   = 300;

  // ---------- fase 6: bombardeo en el techo ----------
  const ROOFTOP_MOVE_SPEED = 380;      // velocidad al desplazarse de un lado del techo al otro
  const ROOFTOP_BOMB_WAIT  = 1.7;      // segundos parado en cada lado antes de lanzar
  const ROOFTOP_EDGE_MARGIN = 46;      // que tan lejos del borde real del techo se para a lanzar
  const ROOFTOP_HOVER_OFFSET = 55;     // cuanto flota arriba del nivel del techo
  const BOMB_AIM_TIME = 1.15;          // "tiempo de vuelo" objetivo usado para calcular el arco hacia el jugador

  // ---------- fase 7: caida + aerodeslizador ----------
  const STUNNED_FALL_DURATION = 1.05; // ya no se usa para la caida en si (ahora es gravedad real,
                                       // ver STUNNED mas abajo) -- queda solo como referencia vieja
  const REMOUNT_SPEED = 900; // que tan rapido "sube" el boss de vuelta al techo cuando el aerodeslizador
                              // lo alcanza (ver REMOUNTING mas abajo) -- rapido, pero no instantaneo

  // ---------- fase 8: duelo final en tierra ----------
  const JM_SAFE_DISTANCE       = 220; // que tan lejos del boss hay que soltar a JM para que quede quieta
  const SENSE_TRIGGER_DIST     = 260; // distancia al boss a la que se dispara el primer aviso SONORO de acercamiento (sin bullet time)
  const FINAL_BOMB_TRIGGER_DIST = 150; // distancia a la que arranca la secuencia de la bomba final
  const FINAL_BOMB_WARNING_TIME = 0.5;  // segundos de zumbido antes de CADA lanzamiento (el primero y cualquier reintento) -- el jugador prende el bullet time a mano con esa ventana
  const FINAL_BOMB_SPEED        = 1300; // recta y veloz a proposito: sin arco, no da tiempo a "leer" una parabola

  registerEntityType('crazylimemonster', {
    hp: BOSS_HP,
    hitRadius: BOSS_HIT_RADIUS,
    moveType: 'custom',    // el motor no le toca x/y/vx/vy: cada fase mueve al boss por su cuenta
    webAttachable: true,   // enganchable con la telaraña (huida, arrastre, y mas adelante el aerodeslizador/bombas)
    pullMass: 6,            // pesado: cuesta bastante frenarlo/arrastrarlo de una sola telaraña (se ajusta cuando probemos la fase 3 de verdad)
    friendly: false,
    invulnerable: true,    // TODO: pasa a false (o a un chequeo puntual) cuando el combate de bombas (fase 6/8) este listo
    color: BOSS_SLED_COLOR,

    onSpawn(e){
      e.bobCycle = Math.random()*Math.PI*2;
      e.hasSled = true; // se dibuja el aerodeslizador debajo suyo (ver drawCrazyLimeMonster) hasta que lo pierda de verdad en STUNNED
      currentBossEntity = e; // ver window.getCrazyLimeMonsterEntity mas abajo -- lo usa entities/crazybomb.js como objetivo del vuelo dirigido
      // el boss fuerza su propio entorno de chunks cargado, ademas del entorno del jugador (ver
      // entities/bossengine.js): asi puede volar/arrastrar lejos sin que el mundo se le desarme
      // debajo, y sin que ademas necesite un sistema de "suspension" como el de jaryman.js -- el
      // esta vivo y simulandose todo el tiempo que dure la pelea, sin importar donde este el jugador
      registerForcedChunkAnchor(() => e);
      registerRadarTarget(() => e, {label: 'MLL', color: BOSS_HAT_COLOR});
      transitionPhase(e, 'EMERGING', {building: e.homeBuilding});
    },

    onUpdate(e, dt){
      e.bobCycle += dt*1.4;
      const phase = BOSS_PHASES[e.phase];
      if(phase && phase.update) phase.update(e, dt);
    },

    onDeath(e){
      // vestigial: el boss nunca pierde hp de verdad en este diseño (ver invulnerable:true mas
      // arriba), asi que este camino no deberia dispararse en la practica -- el "murio" real es
      // la fase DEFEATED (ver mas abajo), disparada directo por el impacto de la bomba final.
      // Se deja esta limpieza igual, como resguardo, por si en algun momento se termina usando hp de verdad.
      stopPlayerDrag();
      setAutoBulletTime('jm-rescue', false);
      setFallWarningSound('boss', false);
      summoned = false;
      currentBossEntity = null;
    },

    draw(ctx, e){ drawCrazyLimeMonster(ctx, e); }
  });

  // ---------- maquina de estados ----------
  // e.phase (string) indexa esta tabla. Nunca se pisa a mano: siempre a traves de
  // transitionPhase(), que llama exit() de la fase vieja y enter() de la nueva, en ese orden.
  const BOSS_PHASES = {};
  function definePhase(name, def){ BOSS_PHASES[name] = def; }

  function transitionPhase(e, newPhase, payload){
    const oldDef = BOSS_PHASES[e.phase];
    if(oldDef && oldDef.exit) oldDef.exit(e);
    e.phase = newPhase;
    e.phaseT = 0; // "tiempo dentro de esta fase": lo pisa cada enter(), lo suman los update() que lo necesiten
    const newDef = BOSS_PHASES[newPhase];
    if(newDef && newDef.enter) newDef.enter(e, payload || {});
  }

  // true si HAY una telaraña (cualquier mano) enganchada de verdad a esta entidad ahora mismo
  function hasWebAttached(e){
    return (webs.left  && webs.left.state  === 'attached' && webs.left.entity  === e) ||
           (webs.right && webs.right.state === 'attached' && webs.right.entity === e);
  }
  // MAS ESTRICTO que hasWebAttached: no alcanza con que este enganchada, tiene que estar TENSA
  // (estirada mas alla de su largo natural -- mismo criterio que getTautAttachedWeb en el motor).
  // Enganchada-pero-floja significa que el jugador ya alcanzo/paso el punto de anclaje: ahi no
  // hay ninguna soga tirando de nada, asi que en el estado DETENIENDO no correspondia darle
  // velocidad igual solo porque sigue "enganchada".
  function tautWebSpeedOn(e){
    for(const hand of ['left','right']){
      const w = webs[hand];
      if(w && w.state === 'attached' && w.entity === e){
        const dist = Math.hypot(player.x - w.anchorX, player.y - w.anchorY);
        if(dist - w.ropeLength > 0) return true;
      }
    }
    return false;
  }
  function detachAnyWebFrom(e){
    for(const hand of ['left','right']){
      const w = webs[hand];
      if(w && w.entity === e) detachIfAttached(hand);
    }
  }

  // placeholder de "el boss te mata": todavia no existe el bombazo real (fases 6/8), asi que por
  // ahora esto simplemente fuerza el game over de siempre. Reemplazar por el lanzamiento real de
  // una bomba (con su propio arco/animacion) cuando se arme el sistema de combate.
  function killPlayerWithBomb(){
    damagePlayer(player.hp);
  }

  // ---------- helpers genericos de movimiento (fases 5 y 6) ----------
  function moveToward(e, tx, ty, speed, dt){
    const dx = tx - e.x, dy = ty - e.y, dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(dist, speed*dt);
    e.x += dx/dist*step; e.y += dy/dist*step;
  }
  function nearPoint(e, tx, ty, tolerance){
    return Math.hypot(tx - e.x, ty - e.y) <= tolerance;
  }

  // ---------- "edificio alto" (condicion de salida de fase 5 / entrada a fase 6) ----------
  // mismo espiritu que isCosCorpRoofPlatform en jaryman.js, pero sin necesitar saber sobre que
  // platform esta parado el jugador (el motor no guarda esa referencia para el jugador como si
  // lo hace para las entidades) -- en cambio, se reconstruye: buscamos un edificio cuyo techo
  // quede justo debajo de los pies del jugador Y que ademas sea "alto" de verdad.
  const TALL_BUILDING_MIN_HEIGHT = 260; // px de techo a calle para contar como "edificio alto"
  function playerTallRoofBuilding(){
    if(!player.grounded) return null;
    const feetY = player.y + PLAYER_SIZE/2;
    for(const b of buildings){
      if(player.x < b.x || player.x > b.x + b.w) continue;
      if(Math.abs(feetY - b.y) > 6) continue;
      if((STREET_Y - b.y) < TALL_BUILDING_MIN_HEIGHT) continue;
      return b;
    }
    return null;
  }

  // ================= FASE 1 -- EMERGING (aparicion) =================
  // Aparece detras del edificio (oculto: ver el chequeo de e.y contra el techo en draw()) y
  // sube en una curva hasta una posicion sobre el techo. Una vez arriba, roba a JM (la saca del
  // mundo como una entidad normal -- mismo truco que jaryman.js usa al suspenderse por chunk
  // descargado, ver e.dead=true de mas abajo, no cuenta como "morir") y pasa a FLEEING.
  definePhase('EMERGING', {
    enter(e, payload){
      const b = payload.building;
      e.homeBuilding = b || null;

      const roofX = b ? (b.x + b.w/2) : e.x;
      const roofY = (b ? b.y : e.y) - 70;
      // arranca escondido detras del edificio, a media altura (dentro del rango vertical de la
      // fachada -- ver draw()), un poco corrido al costado para que la curva se note al salir
      e.emergeFromX = roofX + (Math.random()<0.5 ? -40 : 40);
      e.emergeFromY = b ? (b.y + b.h*0.55) : (STREET_Y - 200);
      e.emergeToX = roofX;
      e.emergeToY = roofY;
      // control point de la curva: bien alto y corrido al costado opuesto al punto de partida,
      // para que el arco se sienta como un envion hacia arriba y no una linea recta
      e.emergeCtrlX = roofX + (e.emergeFromX < roofX ? 120 : -120);
      e.emergeCtrlY = e.emergeFromY - 260;

      e.emergeDuration = 2.2;
      e.x = e.emergeFromX; e.y = e.emergeFromY;
    },
    update(e, dt){
      e.phaseT += dt;
      const t = Math.min(1, e.phaseT / e.emergeDuration);
      const s = t*t*(3 - 2*t); // easeInOut suave (smoothstep), para que no arranque ni frene en seco

      // bezier cuadratica: from -> ctrl -> to
      const u = 1 - s;
      e.x = u*u*e.emergeFromX + 2*u*s*e.emergeCtrlX + s*s*e.emergeToX;
      e.y = u*u*e.emergeFromY + 2*u*s*e.emergeCtrlY + s*s*e.emergeToY;

      if(t >= 1){
        abductJM(e);
        transitionPhase(e, 'FLEEING');
      }
    }
  });

  // se roba a JM: la entidad viva de jaryman.js se saca del mundo (e.dead=true -- el mismo truco
  // que ya usa jaryman.js al suspenderse por chunk descargado, NO dispara onDeath, no cuenta
  // como morir) y el boss se queda cargando su posicion relativa para dibujarla el mismo tiempo
  // que dure secuestrada (ver drawCrazyLimeMonster/drawCaptiveJM mas abajo).
  function abductJM(e){
    const jmE = window.getJaryManeEntity && window.getJaryManeEntity();
    if(!jmE) return; // resguardo: si por lo que sea ya no esta (no deberia pasar), seguimos sin ella
    jmE.dead = true;
    e.hasCaptiveJM = true;
  }

  // ================= FASE 2 -- FLEEING (huida) =================
  // Vuela horizontal, decelerando de FLEE_START_SPEED a FLEE_END_SPEED a lo largo de
  // FLEE_DECEL_TIME. Mientras vaya mas rapido que "agarrable" (FLEE_GRAB_MARGIN), si el jugador
  // la engancha, tiembla y se suelta sola. Apenas esta lo bastante lento Y hay una telaraña
  // enganchada de verdad, pasa a DRAGGING.
  definePhase('FLEEING', {
    enter(e){
      e.fleeDir = Math.sign(e.x - player.x) || 1;
      e.fleeBaseY = e.y; // altura de referencia para el flote (bobCycle ya la mueve un poco arriba/abajo)
      e.fleeShakeT = 0;
    },
    update(e, dt){
      e.phaseT += dt;
      const t = Math.min(1, e.phaseT / FLEE_DECEL_TIME);
      const speed = FLEE_START_SPEED + (FLEE_END_SPEED - FLEE_START_SPEED)*t;

      e.vx = e.fleeDir*speed;
      e.x += e.vx*dt;
      e.y = e.fleeBaseY + Math.sin(e.bobCycle)*4;

      const grabbable = speed <= FLEE_END_SPEED*FLEE_GRAB_MARGIN;
      const attached  = hasWebAttached(e);

      if(attached && !grabbable){
        // todavia va muy rapido para que esto se sostenga: tiembla un toque (ver drawCrazyLimeMonster,
        // usa e.fleeShakeT) y se corta sola -- el jugador va a tener que volver a engancharla
        // mas adelante, cuando ya vaya lo bastante lenta
        e.fleeShakeT += dt;
        if(e.fleeShakeT > 0.35){
          detachAnyWebFrom(e);
          e.fleeShakeT = 0;
        }
      } else {
        e.fleeShakeT = 0;
      }

      if(attached && grabbable){
        transitionPhase(e, 'DESCENDING');
      }
    }
  });

  // ================= FASE 2.5 -- DESCENDING (bajada suave a la calle) =================
  // Transicion corta entre volar y arrastrar por el asfalto: antes esto pasaba de golpe (la
  // altura saltaba directo del cielo al piso en un solo frame, un "pop" bien feo) -- ahora
  // interpola la altura (y la velocidad horizontal, hacia la de arrastre) durante
  // DESCEND_DURATION segundos antes de pasar a DRAGGING de verdad.
  const DESCEND_DURATION = 0.65;
  definePhase('DESCENDING', {
    enter(e){
      e.descendFromY = e.y;
      e.descendToY = STREET_Y - e.hitRadius;
      e.descendFromSpeed = Math.abs(e.vx) || FLEE_END_SPEED;
      e.descendToSpeed = DRAG_GROUND_SPEED; // acelera de la velocidad "agarrable" del vuelo a la del arrastre en el suelo (mucho mas rapida)
      e.dragReleaseT = 0; // arranca a contar aca tambien: soltar del todo durante la bajada mata igual
    },
    update(e, dt){
      e.phaseT += dt;
      const t = Math.min(1, e.phaseT / DESCEND_DURATION);
      const s = t*t*(3 - 2*t); // easeInOut, mismo smoothstep que usa EMERGING

      e.y = e.descendFromY + (e.descendToY - e.descendFromY)*s;
      const speed = e.descendFromSpeed + (e.descendToSpeed - e.descendFromSpeed)*s;
      e.vx = e.fleeDir*speed;
      e.x += e.vx*dt;

      if(hasWebAttached(e)){
        e.dragReleaseT = 0;
      } else {
        e.dragReleaseT += dt;
        if(e.dragReleaseT > DRAG_RELEASE_GRACE){
          killPlayerWithBomb();
          return;
        }
      }

      if(t >= 1){
        transitionPhase(e, 'DRAGGING');
      }
    }
  });

  // ================= FASE 3 -- DRAGGING (arrastre por el asfalto: estado DETENIENDO) =================
  // Apenas toca la calle, el jugador pasa al estado especial "DETENIENDO" (ver
  // window.enterDragState en el motor): va pegado al piso a la MISMA velocidad que el boss,
  // clavando los pies -- de ahi el nombre, intentando frenarlo con friccion, aunque en los
  // numeros el que decide cuando para es el boss, no el jugador. Ahi es donde entities/dragsystem.js
  // hace su trabajo: perdida de vida de a poco (nada mientras estes en pleno saltito, ver
  // DRAG_JUMP_DURATION en el motor) + volcado de buses en el camino. Si el jugador suelta las DOS
  // manos (ninguna telaraña enganchada) por mas de una fraccion de segundo, bomba y game over. A
  // los DRAG_DURATION segundos, frena en seco y suelta todo (ver exit -> RESCUE_WINDOW).
  const DRAG_RELEASE_GRACE = 0.25; // cuanto puede estar sin ninguna mano enganchada antes de matar
  definePhase('DRAGGING', {
    enter(e){
      e.dragReleaseT = 0;
      e.vx = e.fleeDir*DRAG_GROUND_SPEED;
      window.enterDragState(e.vx); // pisa al jugador al estado DETENIENDO, pegado al piso a esta misma velocidad
      startPlayerDrag({dps: 14});
    },
    update(e, dt){
      e.phaseT += dt;
      e.x += e.vx*dt;
      e.y = STREET_Y - e.hitRadius; // pegado al piso mientras dura el arrastre

      // el jugador (estado DETENIENDO) solo recibe la velocidad del boss si la telaraña esta
      // REALMENTE tensa ahora mismo -- enganchada pero floja (ya alcanzaste/pasaste el punto de
      // anclaje) no tira de nada, asi que ahi no corresponde seguir arrastrandolo
      window.setDragTargetVx(tautWebSpeedOn(e) ? e.vx : 0);

      if(hasWebAttached(e)){
        e.dragReleaseT = 0;
      } else {
        e.dragReleaseT += dt;
        if(e.dragReleaseT > DRAG_RELEASE_GRACE){
          killPlayerWithBomb();
          return;
        }
      }

      if(e.phaseT >= DRAG_DURATION){
        transitionPhase(e, 'RESCUE_WINDOW');
      }
    },
    exit(e){
      stopPlayerDrag();
      window.exitDragState();
      detachAnyWebFrom(e); // "la telaraña se rompe" -- si seguia enganchada en este instante, se corta aca
    }
  });

  // ================= FASE 4 -- RESCUE_WINDOW (bullet time + rescate de JM) =================
  // El boss frena en seco (ya lo maneja el exit de DRAGGING). Por inercia el jugador Y JM salen
  // disparados en la misma direccion en la que venian. Se prende el bullet time automatico y hay
  // que alcanzar a JM (huggable/reel-in de siempre, ver civiles.js) antes de que salga de
  // pantalla -- si sale, bomba y game over. Si se la agarra (e.carried), bullet time se apaga y
  // pasa a MISSILE.
  const AUTO_BULLET_TIME_REASON = 'crazylimemonster-jm-rescue';
  const RESCUE_OFFSCREEN_MARGIN = 40;
  definePhase('RESCUE_WINDOW', {
    enter(e){
      // por inercia, tanto JM como el jugador salen disparados en la misma direccion en la que
      // veniamos (ver DRAGGING): la magnitud esta atada a DRAG_GROUND_SPEED a proposito, para
      // que el envion se sienta acorde a lo rapido que iban -- no es un numero suelto
      const throwVx = e.fleeDir * DRAG_GROUND_SPEED*0.42;
      const throwVy = -260;

      window.respawnJaryMane(e.x, e.y - 20, {
        vx: throwVx, vy: throwVy, grounded: false, state: 'falling'
      });
      e.hasCaptiveJM = false;

      // el jugador sale disparado por inercia en la misma direccion (un poco menos brusco que
      // JM, para que sea el jugador el que la tiene que perseguir/alcanzar, no al reves)
      player.vx = throwVx*0.85;
      player.vy = throwVy*0.85;
      player.grounded = false;
      player.standingOnCar = null;

      setAutoBulletTime(AUTO_BULLET_TIME_REASON, true);

      // el boss se queda flotando quieto, lejos de en medio, mientras dura el rescate
      e.rescueHoverY = e.y - 80;
    },
    update(e, dt){
      e.phaseT += dt;
      e.y = e.rescueHoverY + Math.sin(e.bobCycle)*4; // solo flota, no molesta durante el rescate

      const jmE = window.getJaryManeEntity && window.getJaryManeEntity();
      if(!jmE || jmE.dead){
        // no deberia pasar (murio de caida antes de que pudieramos hacer nada) -- tratar como
        // fallo del rescate, mismo desenlace que si hubiera salido de pantalla
        failRescue(e);
        return;
      }
      if(jmE.carried){
        // exito: el jugador ya la esta abrazando (ver e.justCaught/hugging en civiles.js)
        setAutoBulletTime(AUTO_BULLET_TIME_REASON, false);
        transitionPhase(e, 'MISSILE');
        return;
      }

      const sx = jmE.x - camera.x, sy = jmE.y - camera.y;
      const offscreen = sx < -RESCUE_OFFSCREEN_MARGIN || sx > canvas.width + RESCUE_OFFSCREEN_MARGIN ||
                         sy < -RESCUE_OFFSCREEN_MARGIN || sy > canvas.height + RESCUE_OFFSCREEN_MARGIN;
      if(offscreen) failRescue(e);
    },
    exit(){
      setAutoBulletTime(AUTO_BULLET_TIME_REASON, false); // resguardo, por si se sale de esta fase por otro lado
    }
  });

  function failRescue(e){
    setAutoBulletTime(AUTO_BULLET_TIME_REASON, false);
    killPlayerWithBomb();
  }

  // ================= FASE 5 -- MISSILE (embestida teledirigida) =================
  // Ciclo positioning -> charging -> braking -> (de nuevo positioning), en loop, hasta que el
  // jugador queda parado sobre un edificio alto de verdad (chequeado TODOS los cuadros, en
  // cualquier sub-estado -- ver playerTallRoofBuilding). Si conecta una embestida: -20hp +
  // empujon al jugador, el boss tambien rebota (no la ignora fisicamente), y si JM va cargada
  // sale despedida y se lleva un golpe de verdad (dealDamageAt), no solo un susto.
  definePhase('MISSILE', {
    enter(e){
      e.missileSub = 'positioning';
      e.chargeHit = false;
      pickMissilePosition(e);
    },
    update(e, dt){
      if(e.missileSub === 'positioning'){
        moveToward(e, e.missileTargetX, e.missileTargetY, MISSILE_PREP_SPEED, dt);
        if(nearPoint(e, e.missileTargetX, e.missileTargetY, 12)){
          e.missileSub = 'charging';
          e.chargeHit = false;
          aimAt(e, player.x, player.y, MISSILE_CHARGE_SPEED); // aimAt/passedWaypoint son de entities/reelredirect.js
        }
      } else if(e.missileSub === 'charging'){
        e.x += e.vx*dt; e.y += e.vy*dt;
        if(!e.chargeHit){
          const dx = player.x - e.x, dy = player.y - e.y;
          if(Math.hypot(dx,dy) <= e.hitRadius + PLAYER_SIZE/2 + MISSILE_HIT_MARGIN){
            e.chargeHit = true;
            onMissileImpact(e);
            e.missileSub = 'braking';
            e.brakeT = 0;
          }
        }
        if(e.missileSub === 'charging' && passedWaypoint(e)){
          e.missileSub = 'braking';
          e.brakeT = 0;
        }
      } else if(e.missileSub === 'braking'){
        e.brakeT += dt;
        const decay = Math.max(0, 1 - dt*5);
        e.vx *= decay; e.vy *= decay;
        e.x += e.vx*dt; e.y += e.vy*dt;
        if(e.brakeT >= MISSILE_BRAKE_DURATION){
          e.missileSub = 'positioning';
          pickMissilePosition(e);
        }
      }

      // condicion de salida: se chequea TODO el tiempo, sin importar el sub-estado en el que este.
      // pasa por REMOUNTING (sube rapido hasta el techo, no de un salto -- ver esa fase mas abajo,
      // hace el mismo trabajo que necesita el "remonte" de fase 7/6, asi que se reusa tal cual
      // para esta primera subida) en vez de saltar directo a ROOFTOP_BOMBING
      const roof = playerTallRoofBuilding();
      if(roof){
        e.fightBuilding = roof;
        transitionPhase(e, 'REMOUNTING');
      }
    }
  });

  function pickMissilePosition(e){
    const angle = Math.random()*Math.PI*2;
    const radius = MISSILE_STANDOFF_MIN + Math.random()*(MISSILE_STANDOFF_MAX - MISSILE_STANDOFF_MIN);
    e.missileTargetX = player.x + Math.cos(angle)*radius;
    // achatado en Y (el "radio" vertical es mas chico que el horizontal) y corrido un poco para
    // arriba, para que la embestida se sienta como que viene en diagonal, no siempre al ras
    const rawY = player.y + Math.sin(angle)*radius*0.4 - 40;
    e.missileTargetY = Math.max(120, Math.min(STREET_Y - 140, rawY));
  }

  function onMissileImpact(e){
    damagePlayer(MISSILE_HIT_DAMAGE);

    const dx = player.x - e.x, dy = player.y - e.y;
    const dist = Math.hypot(dx,dy) || 1;
    const nx = dx/dist, ny = dy/dist;

    player.vx = nx*MISSILE_KNOCKBACK;
    player.vy = Math.min(ny*MISSILE_KNOCKBACK, -120); // nunca hacia abajo del todo: un golpe asi siempre te saca un poco del piso
    player.grounded = false;
    player.standingOnCar = null;

    // el boss tambien rebota -- no ignora fisicamente el choque
    e.vx = -nx*MISSILE_KNOCKBACK*0.8;
    e.vy = -ny*MISSILE_KNOCKBACK*0.8;

    // si JM va cargada, sale despedida y se lleva un golpe de verdad: reusa la MISMA logica de
    // "soltar" que usa el jugador normalmente (window.dropCivil, expuesta desde civiles.js) y
    // encima le suma daño + empujon con dealDamageAt -- el mismo mecanismo que usa cualquier
    // golpe del juego, no algo inventado aparte
    const jmE = window.getJaryManeEntity && window.getJaryManeEntity();
    if(jmE && jmE.carried){
      window.dropCivil(jmE);
      dealDamageAt(jmE.x, jmE.y, 0, JM_IMPACT_DAMAGE, -nx*JM_IMPACT_KNOCKBACK, -ny*JM_IMPACT_KNOCKBACK - 80);
    }
  }

  // ================= FASE 6 -- ROOFTOP_BOMBING (bombardeo en el techo) =================
  // atSide (parado, cuenta regresiva) -> lanza -> moving (cruza al otro lado) -> atSide -> repite,
  // indefinidamente, hasta que una bomba redirigida (ver entities/crazybomb.js +
  // entities/reelredirect.js) le pegue de verdad -- ahi salta a STUNNED. Enganchar y jalar la
  // bomba funciona haya o no bullet time (el mecanismo no chequea eso para nada), tal como se pidio.
  // UNICA forma de llegar a esta fase: via REMOUNTING (ver esa fase, mas abajo) -- que ya deja al
  // boss parado en rooftopSidePos(e) de verdad (subiendo, no de un salto) y con bombSideSign fijo
  // ANTES de que esta fase arranque, asi que enter() no necesita tocar x/y/bombSideSign para nada.
  definePhase('ROOFTOP_BOMBING', {
    enter(e){
      e.bombSub = 'atSide';
      e.bombWaitT = ROOFTOP_BOMB_WAIT;
    },
    update(e, dt){
      const pos = rooftopSidePos(e);
      if(e.bombSub === 'moving'){
        moveToward(e, pos.x, pos.y, ROOFTOP_MOVE_SPEED, dt);
        if(nearPoint(e, pos.x, pos.y, 10)){
          e.bombSub = 'atSide';
          e.bombWaitT = ROOFTOP_BOMB_WAIT;
        }
      } else { // 'atSide'
        e.y = pos.y + Math.sin(e.bobCycle)*3;
        e.bombWaitT -= dt;
        if(e.bombWaitT <= 0){
          throwRooftopBomb(e);
          e.bombSideSign *= -1;
          e.bombSub = 'moving';
        }
      }
    }
  });

  // el punto de "un lado del techo" segun e.bombSideSign (+1 = derecha, -1 = izquierda), a
  // ROOFTOP_EDGE_MARGIN del borde real y flotando ROOFTOP_HOVER_OFFSET arriba del nivel del techo
  function rooftopSidePos(e){
    const b = e.fightBuilding;
    const x = e.bombSideSign > 0 ? (b.x + b.w - ROOFTOP_EDGE_MARGIN) : (b.x + ROOFTOP_EDGE_MARGIN);
    return {x, y: b.y - ROOFTOP_HOVER_OFFSET};
  }

  // lanza una bomba apuntada a donde esta el jugador AHORA (no predictivo -- se esquiva
  // reaccionando, no adivinando) usando la formula estandar de "tiro para llegar a un punto en
  // un tiempo T dado": con eso sale el arco solo, gravedad incluida (ver entities/crazybomb.js)
  function throwRooftopBomb(e){
    const vx = (player.x - e.x)/BOMB_AIM_TIME;
    const vy = (player.y - e.y)/BOMB_AIM_TIME - 0.5*GRAVITY*BOMB_AIM_TIME;
    window.spawnCrazyLimeBomb(e.x, e.y, vx, vy, {
      groundY: e.fightBuilding.y, // el "piso" de esta bomba es el TECHO, no la calle -- si nadie la reclama, se pierde ahi
      getRedirectTarget: window.getCrazyLimeMonsterEntity,
      onRedirectHitTarget(){ transitionPhase(e, 'STUNNED'); }
    });
  }

  // ================= FASE 7 -- STUNNED (cae + aerodeslizador) =================
  // Cae desde el techo hasta la calle con GRAVEDAD REAL (misma GRAVITY que usa todo el resto del
  // juego, no un tween de duracion fija -- antes tardaba SIEMPRE 1.05s sin importar la altura real
  // del techo, lo que en un edificio bien alto se sentia mas a "teletransporte disfrazado" que a
  // una caida de verdad) mientras el aerodeslizador -- entidad aparte, ver entities/crazysled.js --
  // intenta volver solo hacia el boss. Los dos desenlaces posibles los dispara el propio sled via
  // sus callbacks (no hace falta que STUNNED este mirando nada): si vuelve con el boss, pasa a
  // REMOUNTING (sube de nuevo al techo, tampoco de un salto -- ver mas abajo) y de ahi la fase 6 se
  // reinicia entera; si el jugador lo destruye a golpes (combo de siempre: click medio sostenido +
  // click izq/der, nada nuevo), pasa a GROUNDED.
  definePhase('STUNNED', {
    enter(e){
      e.fallToY = STREET_Y - e.hitRadius;
      e.vx = 0; // cae derecho, sin arrastre horizontal
      e.vy = 0; // arranca la caida desde el reposo -- la acelera GRAVITY cuadro a cuadro, de verdad
      e.hasSled = false; // se acaba de caer: a partir de aca no se dibuja mas el aerodeslizador debajo suyo (ver drawCrazyLimeMonster), salvo que REMOUNTING lo prenda de nuevo

      spawnEntity('crazysled', e.x, e.y - 4, {
        getOwner: window.getCrazyLimeMonsterEntity,
        onReturnedToOwner(){ transitionPhase(e, 'REMOUNTING'); },
        onDestroyedByPlayer(){ transitionPhase(e, 'GROUNDED'); }
      });
    },
    update(e, dt){
      e.vy += GRAVITY*dt;
      e.y += e.vy*dt;
      if(e.y >= e.fallToY){
        e.y = e.fallToY;
        e.vy = 0;
      }
    }
  });

  // ================= FASE 6.5 / 7.5 -- REMOUNTING (sube rapido hasta el techo) =================
  // Sube el resto del camino a REMOUNT_SPEED, rapido pero visible (nunca de un salto), hasta
  // llegar al punto de "un lado del techo" que usa ROOFTOP_BOMBING (rooftopSidePos, misma
  // funcion -- asi al entrar ahi de verdad ya esta pegado al lugar correcto, sin otro salto
  // encima). Se usa en DOS momentos, con el mismo codigo para los dos:
  //   1. la PRIMERA vez que el jugador lleva la pelea a un edificio alto (ver el chequeo de
  //      playerTallRoofBuilding en MISSILE) -- antes esto era un teletransporte directo a
  //      ROOFTOP_BOMBING.enter, ahora sube de verdad.
  //   2. cuando el aerodeslizador vacio consigue volver hasta el boss (ver entities/crazysled.js,
  //      onReturnedToOwner) -- ahi la fase 6 se reinicia entera.
  // e.bombSideSign se fija ANTES de calcular el destino (siempre arranca del mismo lado, el que
  // ROOFTOP_BOMBING.enter espera al entrar -- esa fase ya no vuelve a tocar x/y/bombSideSign).
  definePhase('REMOUNTING', {
    enter(e){
      e.bombSideSign = 1;
      e.remountTarget = rooftopSidePos(e);
      e.hasSled = true; // si ya lo tenia (primera subida desde MISSILE) esto es un no-op; si volvia del aerodeslizador, lo vuelve a dibujar debajo suyo
    },
    update(e, dt){
      moveToward(e, e.remountTarget.x, e.remountTarget.y, REMOUNT_SPEED, dt);
      if(nearPoint(e, e.remountTarget.x, e.remountTarget.y, 12)){
        transitionPhase(e, 'ROOFTOP_BOMBING');
      }
    }
  });

  // ================= FASE 8 -- GROUNDED (duelo final en tierra) =================
  // waitingRelease (esperando que sueltes a JM lejos de verdad) -> approach (caminas hacia el
  // boss; a SENSE_TRIGGER_DIST suena el aviso -- SOLO sonido, el bullet time lo prendes vos con
  // Ctrl -- y a FINAL_BOMB_TRIGGER_DIST tira la ultima bomba) -> finalBomb (la bomba se encarga
  // de todo sola via su reelBehavior/onRedirectHitTarget, que dispara DEFEATED directo).
  definePhase('GROUNDED', {
    enter(e){
      e.groundedSub = 'waitingRelease';
      e.senseTriggered = false;
      e.hasSled = false; // resguardo: a esta fase solo se llega via onDestroyedByPlayer -- el aerodeslizador ya no existe, nunca vuelve
      // aterriza DEL TODO: si el jugador destruyo el aerodeslizador antes de que STUNNED
      // terminara de caer (edificio bien alto + jugador rapido con el combo), el boss quedaba
      // colgado a mitad de camino, a la altura en la que iba cuando se corto la caida real --
      // fase 8 es en tierra siempre, asi que fuerza el aterrizaje completo aca, sin excepcion
      e.y = STREET_Y - e.hitRadius;
      e.vx = 0; e.vy = 0;
    },
    update(e, dt){
      const jmE = window.getJaryManeEntity && window.getJaryManeEntity();

      if(e.groundedSub === 'waitingRelease'){
        if(jmE && !jmE.carried && !jmE.dead){
          const dist = Math.hypot(jmE.x - e.x, jmE.y - e.y);
          if(dist >= JM_SAFE_DISTANCE){
            e.groundedSub = 'approach';
          } else if(jmE.grounded){
            // demasiado cerca del boss: tiembla, no se queda quieta -- mismo espiritu que el
            // temblor de "strandedOnRoof" que ya usa jaryman.js, pero aca alcanza con un jitter
            // de posicion nomas, no hace falta tocar su maquina de estados de civil para nada
            jmE.x += Math.sin(performance.now()*0.05)*0.6;
          }
        }
        return;
      }

      if(e.groundedSub === 'approach'){
        const dist = Math.abs(player.x - e.x);
        if(!e.senseTriggered && dist <= SENSE_TRIGGER_DIST){
          e.senseTriggered = true;
          // primer aviso, UNICAMENTE sonoro (reusa el mismo zumbido de "te vas a estampar" del
          // motor, setFallWarningSound): el bullet time NO se prende solo, el jugador lo activa a
          // mano con Ctrl. Distinto del zumbido de 0.5s de startFinalBombWarning mas abajo -- este
          // es solo "se esta acercando", ese otro es "la tira YA".
          setFallWarningSound('boss', true);
        }
        if(e.senseTriggered && dist <= FINAL_BOMB_TRIGGER_DIST){
          startFinalBombWarning(e);
        }
        return;
      }

      if(e.groundedSub === 'finalBombWarning'){
        e.finalBombWarnT -= dt;
        if(e.finalBombWarnT <= 0){
          setFallWarningSound('boss', false);
          throwFinalBomb(e);
          e.groundedSub = 'finalBomb';
        }
        return;
      }

      // 'finalBomb': no hay nada que hacer aca mientras vuela -- la bomba misma decide todo
      // (instakill si te toca directo, transitionPhase a DEFEATED si el jugador la redirige y le
      // pega de verdad al boss). Si en cambio se pierde sin pegarle a nadie -- la esquivaron sin
      // engancharla, o la redirigieron pero tambien paso de largo del boss -- retryFinalBomb (ver
      // onLost mas abajo) vuelve a 'finalBombWarning' sola: el boss no se queda esperando, tira
      // otra, con su propio zumbido previo, hasta que una conecte.
    },
    exit(){
      setFallWarningSound('boss', false); // resguardo, por si se sale de esta fase por otro lado (reset, etc.)
    }
  });

  // ---- zumbido de "te estas por estampar" (aviso de caida) ----
  // arranca el zumbido y deja corriendo la cuenta regresiva de FINAL_BOMB_WARNING_TIME antes de
  // tirar: se llama tanto para el primer lanzamiento como para cada reintento (ver
  // retryFinalBomb), asi que cada bomba individual tiene su propia ventana de reaccion para que
  // el jugador prenda el bullet time a mano
  function startFinalBombWarning(e){
    e.groundedSub = 'finalBombWarning';
    e.finalBombWarnT = FINAL_BOMB_WARNING_TIME;
    setFallWarningSound('boss', true);
  }

  // recta y veloz (straightFlight: sin gravedad, ver entities/crazybomb.js) apuntada a donde esta
  // el jugador EN ESTE INSTANTE -- a diferencia del arco de fase 6 (throwRooftopBomb), aca no hay
  // tiempo de vuelo que calcular: va directo, por eso el zumbido previo importa tanto
  function throwFinalBomb(e){
    const fromX = e.x, fromY = e.y - 20;
    const dx = player.x - fromX, dy = player.y - fromY;
    const dist = Math.hypot(dx, dy) || 1;
    window.spawnCrazyLimeBomb(fromX, fromY, dx/dist*FINAL_BOMB_SPEED, dy/dist*FINAL_BOMB_SPEED, {
      groundY: STREET_Y,
      straightFlight: true,
      getRedirectTarget: window.getCrazyLimeMonsterEntity,
      onRedirectHitTarget(){ transitionPhase(e, 'DEFEATED'); },
      onLost(){ retryFinalBomb(e); }
    });
  }

  // la bomba final se perdio sin pegarle a nadie (dud por alcance/piso, o redirigida pero
  // pasando de largo del boss tambien) -- el boss tira otra, con su propio aviso previo, hasta
  // que una le pegue de verdad. Resguardo: si para cuando esto se llama el boss ya paso a otra
  // cosa (DEFEATED, reset del juego, etc.) no hace nada -- la bomba vieja es historia
  function retryFinalBomb(e){
    if(e.phase !== 'GROUNDED' || e.groundedSub !== 'finalBomb') return;
    startFinalBombWarning(e);
  }

  // ================= DEFEATED =================
  // el boss nunca pierde hp de verdad (queda invulnerable a golpes toda la pelea, ver
  // registerEntityType mas arriba -- solo lo afectan las bombas redirigidas, y esas llaman
  // transitionPhase directo, sin pasar por hp para nada), asi que esta fase ES el "murio": hace
  // la misma limpieza que haria onDeath, mas marcar e.dead=true a mano.
  definePhase('DEFEATED', {
    enter(e){
      e.dead = true;
      stopPlayerDrag();
      setAutoBulletTime(AUTO_BULLET_TIME_REASON, false);
      setFallWarningSound('boss', false);
      summoned = false;
      currentBossEntity = null;
      // TODO: disparar pantalla de victoria/creditos/lo que corresponda cuando exista ese sistema
    }
  });

  // ---------- dibujo ----------
  function drawCrazyLimeMonster(ctx, e){
    // "detras del edificio": SOLO aplica durante la aparicion (fase EMERGING) -- antes este
    // chequeo corria siempre, y como durante el arrastre el boss esta en la calle (e.y bien por
    // debajo del techo de homeBuilding), quedaba invisible todo el rato que estuvo abajo. Una
    // vez que ya salio volando (cualquier fase despues de EMERGING) nunca vuelve a estar
    // "detras" de ese mismo edificio en este diseño, asi que no hace falta seguir chequeando.
    if(e.phase === 'EMERGING' && e.homeBuilding && e.y > e.homeBuilding.y + 4) return;

    const bob = Math.sin(e.bobCycle)*4;
    // temblor de "vas muy rapido, sueltame" durante la huida (ver FLEEING/e.fleeShakeT)
    const shakeX = e.fleeShakeT ? Math.sin(e.fleeShakeT*90)*3 : 0;

    ctx.save();
    ctx.translate(e.x + shakeX, e.y + bob);
    ctx.lineCap = 'round';

    // el aerodeslizador debajo suyo: SOLO mientras todavia lo tenga (e.hasSled) -- lo pierde de
    // verdad al caer en STUNNED (fase 7) y, si lo destruyen a golpes (onDestroyedByPlayer), nunca
    // vuelve (GROUNDED/DEFEATED en adelante); si en cambio el aerodeslizador logra volver solo,
    // REMOUNTING lo prende de nuevo antes de retomar el bombardeo del techo
    if(e.hasSled){
      ctx.fillStyle = 'rgba(154,160,168,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 20, 34, 11, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = BOSS_SLED_COLOR;
      ctx.beginPath();
      ctx.ellipse(0, 20, 26, 8, 0, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.strokeStyle = BOSS_LIMB_COLOR;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-4, 8);  ctx.lineTo(-6, 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 4, 8);  ctx.lineTo( 6, 18); ctx.stroke();

    ctx.strokeStyle = BOSS_TORSO_COLOR;
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 9); ctx.stroke();

    ctx.strokeStyle = BOSS_LIMB_COLOR;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-2, -6); ctx.lineTo(-13, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 2, -6); ctx.lineTo( 13, 3); ctx.stroke();

    ctx.fillStyle = BOSS_HEAD_COLOR;
    ctx.beginPath();
    ctx.arc(0, -16, 9, 0, Math.PI*2);
    ctx.fill();

    ctx.fillStyle = BOSS_HAT_COLOR;
    ctx.beginPath();
    ctx.moveTo(-9, -21);
    ctx.lineTo(9, -21);
    ctx.lineTo(0, -39);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // JM secuestrada: mientras dure el rapto (fases EMERGING tras el robo, FLEEING, DRAGGING),
    // se dibuja colgando del costado del aerodeslizador -- placeholder simple por ahora, se
    // afina cuando toque pulir la fase 1 en detalle
    if(e.hasCaptiveJM){
      ctx.save();
      ctx.translate(e.x + shakeX + 18, e.y + bob + 14);
      ctx.fillStyle = '#f4d3ae';
      ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#1abc9c';
      ctx.fillRect(-5, 4, 10, 12);
      ctx.restore();
    }
  }

  // ---------- invocacion: Jary Mane llega al techo de un CosCorp (ver entities/jaryman.js) ----------
  let summoned = false; // solo puede haber uno a la vez -- se reactiva cuando el boss muere de verdad (ver onDeath)
  let currentBossEntity = null; // la instancia viva ahora mismo, o null -- ver getCrazyLimeMonsterEntity

  // getter de solo lectura, mismo patron que window.getJaryManeEntity en jaryman.js -- lo usa
  // entities/crazybomb.js (y a futuro el aerodeslizador de la fase 7) para saber a quien apuntar
  window.getCrazyLimeMonsterEntity = function(){
    return (currentBossEntity && !currentBossEntity.dead) ? currentBossEntity : null;
  };

  // ---------- reinicio completo del juego (ver resetWorld() en el motor) ----------
  // el reset del motor ya vacia `entities` solo (la instancia viva del boss, si habia,
  // desaparece con todo lo demas) pero sin esto `summoned` se quedaba en true para siempre, y el
  // boss no se podia volver a invocar nunca mas despues de un reinicio
  window.RESET_LISTENERS = window.RESET_LISTENERS || [];
  window.RESET_LISTENERS.push(function(){
    summoned = false;
    currentBossEntity = null;
    stopPlayerDrag();
    setAutoBulletTime(AUTO_BULLET_TIME_REASON, false);
    setFallWarningSound('boss', false);
  });

  window.addEventListener('jarymane-coscorp-rooftop', function(ev){
    if(summoned) return;

    const detail = ev.detail || {};
    const b = detail.building;
    // arranca "detras" del edificio, a media altura de la fachada (ver homeBuilding en enter de
    // EMERGING, que recalcula el punto de partida real de la curva) -- este x,y solo importa
    // como posicion inicial de spawneo, EMERGING lo pisa enseguida
    const x = b ? (b.x + b.w/2) : detail.x;
    const y = (b ? b.y + b.h*0.55 : detail.y);

    const e = spawnEntity('crazylimemonster', x, y, {homeBuilding: b || null});
    if(e) summoned = true;
  });

})();
