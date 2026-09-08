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
//  Estado de avance de esta pasada (10 ago): las fases F1-F4 (aparicion,
//  huida, arrastre, rescate en el aire) ya funcionan de punta a punta con los
//  sistemas de entities/bossengine.js + radar.js + dragsystem.js. Las fases
//  F5-F8 (misil teledirigido, bombardeo en el techo, aerodeslizador, duelo
//  final) todavia NO tienen su logica real: quedan como estados "hover"
//  (floating quieto, invulnerable, sin hacer nada) bien marcados con TODO,
//  solo para que la maquina de estados completa sea transitable y se pueda
//  probar el arranque de la pelea mientras se arman una por una.
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
      // TODO fase 8: ademas de esto, avisar victoria/creditos/lo que corresponda cuando exista
      stopPlayerDrag();
      setAutoBulletTime('jm-rescue', false);
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
  // TODO: patron de embestida/frenado hacia el jugador; si conecta, JM sale volando (pierde una
  // vida) y el jugador -20hp + empujon, el boss tambien rebota. Sale de esta fase subiendo a un
  // edificio alto. Por ahora: hover quieto (placeholder) para que la maquina de estados completa
  // sea transitable end-to-end mientras se arma esta fase de verdad.
  definePhase('MISSILE', {
    enter(e){ e.hoverBaseY = e.y; },
    update(e){ e.y = e.hoverBaseY + Math.sin(e.bobCycle)*4; }
  });

  // ================= FASE 6 -- ROOFTOP_BOMBING (bombardeo en el techo) =================
  // TODO: parar en un techo, lanzar bomba, moverse al otro lado, repetir -- hasta que agarren
  // una bomba con la telaraña (def.reelBehavior) y se la jalen de vuelta (click medio), bajandole
  // a STUNNED. Placeholder por ahora.
  definePhase('ROOFTOP_BOMBING', {
    enter(e){ e.hoverBaseY = e.y; },
    update(e){ e.y = e.hoverBaseY + Math.sin(e.bobCycle)*4; }
  });

  // ================= FASE 7 -- STUNNED / SLED_CHASE (aerodeslizador) =================
  // TODO: cae del aerodeslizador (STUNNED), el aerodeslizador vacio intenta volver solo a el
  // (SLED_CHASE) salvo que lo detengan con telaraña + reelBehavior + combo de golpe/patada para
  // destruirlo. Placeholder por ahora.
  definePhase('STUNNED', {
    enter(e){ e.hoverBaseY = e.y; },
    update(e){ e.y = e.hoverBaseY + Math.sin(e.bobCycle)*2; }
  });

  // ================= FASE 8 -- GROUNDED (duelo final) =================
  // TODO: JM se suelta lejos del boss, sentido aracnido, bullet time manual, agarrar+jalar la
  // bomba que le vuelve a dar al boss -- transiciona a DEFEATED (hp<=0, ver onDeath arriba).
  // Placeholder por ahora.
  definePhase('GROUNDED', {
    enter(e){ e.hoverBaseY = e.y; },
    update(e){ e.y = e.hoverBaseY + Math.sin(e.bobCycle)*2; }
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

    ctx.fillStyle = 'rgba(154,160,168,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 20, 34, 11, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = BOSS_SLED_COLOR;
    ctx.beginPath();
    ctx.ellipse(0, 20, 26, 8, 0, 0, Math.PI*2);
    ctx.fill();

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
