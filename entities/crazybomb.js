// ============================================================================
//  entities/crazybomb.js
// ----------------------------------------------------------------------------
//  La bomba que tira el Monstruo Loco Lima (fases 6 y 8 -- ver
//  entities/crazylimemonster.js, todavia sin conectar a la secuencia real de
//  ninguna de las dos, eso viene despues). Usa entities/reelredirect.js para
//  la parte de "la jalo con click medio y sigue de largo hacia el boss", asi
//  que va DESPUES en el manifest.
//
//  Ciclo de vida de una instancia:
//    1. spawneada con una velocidad inicial (window.spawnCrazyLimeBomb) ->
//       arco balistico normal (gravedad), SIEMPRE armada: tocar al jugador
//       en cualquier momento de este arco es instakill.
//    2. si nadie la engancha y llega a groundY sin que pase nada: se pierde
//       sola, sin lastimar a nadie (una "dud" -- ni el boss se expone, ni el
//       jugador arriesga nada por no reaccionar a tiempo cada vez).
//    3. si el jugador la engancha y tira de click medio: arranca el vuelo
//       dirigido (ver reelredirect.js) -- primera pierna hacia el jugador
//       (instakill si lo toca, hay que esquivarla de verdad), segunda pierna
//       hacia el boss (si le pega, cfg.onHitTarget: por ahora solo la hace
//       desaparecer, el "cae del aerodeslizador" de la fase 7 se conecta mas
//       adelante cuando toque programar esa fase de verdad).
// ============================================================================

(function(){

  const BOMB_HIT_RADIUS = 11;
  const BOMB_REDIRECT_SPEED = 950;
  const BOMB_COLOR = '#2f7a3a';
  const BOMB_FUSE_COLOR = '#e8b23a';

  function killPlayerFromBomb(){
    damagePlayer(player.hp);
  }

  const redirect = createRedirectReelBehavior({
    speed: BOMB_REDIRECT_SPEED,
    getTarget(e){ return e.getRedirectTarget ? e.getRedirectTarget() : null; },
    onHitPlayer(e){
      killPlayerFromBomb();
      e.dead = true;
    },
    onHitTarget(e, tgt){
      e.dead = true;
      if(e.onRedirectHitTarget) e.onRedirectHitTarget(tgt);
    },
    onFizzle(e){
      e.dead = true; // no le pego a nadie (el boss ya no existe, o tambien se la esquivo) -- se pierde sola
      if(e.onLost) e.onLost(); // avisa a quien la tiro (ver crazylimemonster.js/GROUNDED): puede querer tirar otra
    }
  });

  registerEntityType('crazylimebomb', {
    hp: 1,
    hitRadius: BOMB_HIT_RADIUS,
    moveType: 'custom',   // fisica 100% propia (arco balistico + vuelo dirigido), el motor no la toca
    webAttachable: true,
    friendly: false,
    invulnerable: true,   // no se "mata" a golpes -- la unica forma de neutralizarla es la de siempre: jalarla
    color: BOMB_COLOR,
    reelBehavior: redirect.reelBehavior,

    onSpawn(e){
      // OJO: el motor llama a este hook como def.onSpawn(e) -- UN SOLO ARGUMENTO (ver spawnEntity
      // en spiderswing.html), nunca un "opts" aparte. Los opts que le paso window.spawnCrazyLimeBomb
      // ya quedaron mezclados directo sobre "e" (Object.assign dentro de spawnEntity, ANTES de
      // llamar a onSpawn), asi que hay que leerlos de e.* -- no de un segundo parametro que nunca
      // llega. Antes esta funcion tomaba (e, opts) y opts SIEMPRE era undefined aca dentro, asi que
      // pisaba e.groundY/e.getRedirectTarget/e.onRedirectHitTarget (que ya venian bien puestos)
      // con sus defaults -- en particular e.getRedirectTarget quedaba en ()=>null PARA SIEMPRE, sin
      // importar lo que mandara throwRooftopBomb/throwFinalBomb: la bomba nunca encontraba al boss
      // como objetivo de la segunda pierna, y se perdia sola (onFizzle) apenas pasaba al jugador --
      // por eso jamas llegaba a "explotarle" al Monstruo Loco Lima.
      //
      // groundY: la altura a la que, si nadie hizo nada, se considera "aterrizo" y se pierde sola
      // (el techo de un edificio en fase 6, la calle en fase 8 -- lo decide quien la tira)
      if(e.groundY == null) e.groundY = STREET_Y;
      if(!e.getRedirectTarget) e.getRedirectTarget = () => null;
      // straightFlight: recta y veloz, SIN el arco balistico normal (sin gravedad) -- la usa la
      // bomba final de fase 8 (ver throwFinalBomb en crazylimemonster.js): al ir tan rapido, un
      // arco de verdad le daria demasiado tiempo de "leerla" en el aire antes de que llegue.
      // default false: todo lo demas (fase 6, etc.) sigue con el arco de siempre.
      if(e.straightFlight == null) e.straightFlight = false;
      e.straightFlightSpawnX = e.x; e.straightFlightSpawnY = e.y;
      if(e.straightFlightRange == null) e.straightFlightRange = 1600; // px: si nadie la agarra y sigue de largo esta distancia, se da por perdida (ver dud mas abajo)
      // onLost(): opcional -- se llama cuando la bomba se pierde SIN pegarle a nadie (dud contra
      // el piso, o redirigida pero pasando de largo del objetivo tambien). Quien la tiro decide
      // que hacer (ej. tirar otra).
      e.spinCycle = Math.random()*Math.PI*2;
    },

    onUpdate(e, dt){
      e.spinCycle += dt*6;

      if(redirect.updateRedirect(e, dt)) return; // en pleno vuelo dirigido este cuadro: nada mas que hacer

      // arco balistico normal (nadie la engancho todavia, o la engancharon pero no la jalaron) --
      // salvo que sea straightFlight, en cuyo caso NO acumula gravedad y viaja en linea recta a
      // velocidad constante (ver e.straightFlight en onSpawn)
      if(!e.straightFlight) e.vy += GRAVITY*dt;
      e.x += e.vx*dt;
      e.y += e.vy*dt;

      // SIEMPRE armada mientras cae sola: tocar al jugador en cualquier momento de este arco es
      // instakill, igual que en la primera pierna del vuelo dirigido
      const dx = player.x - e.x, dy = player.y - e.y;
      if(Math.hypot(dx,dy) <= e.hitRadius + PLAYER_SIZE/2){
        killPlayerFromBomb();
        e.dead = true;
        return;
      }

      if(e.y >= e.groundY){
        e.dead = true; // dud: nadie hizo nada, se pierde sola sin lastimar a nadie
        if(e.onLost) e.onLost();
        return;
      }

      // vuelo recto: no hay arco que la traiga de vuelta al nivel de groundY sola (va derecho,
      // sin gravedad) -- si la esquivaron y sigue de largo sin que nadie la enganche, se pierde
      // por alcance maximo en vez de volar para siempre fuera de pantalla
      if(e.straightFlight){
        const traveled = Math.hypot(e.x - e.straightFlightSpawnX, e.y - e.straightFlightSpawnY);
        if(traveled >= e.straightFlightRange){
          e.dead = true;
          if(e.onLost) e.onLost();
        }
      }
    },

    draw(ctx, e){ drawCrazyLimeBomb(ctx, e); }
  });

  function drawCrazyLimeBomb(ctx, e){
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.spinCycle);

    ctx.fillStyle = BOMB_COLOR;
    ctx.beginPath();
    ctx.arc(0, 0, e.hitRadius, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = BOMB_FUSE_COLOR;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, -e.hitRadius);
    ctx.lineTo(3, -e.hitRadius-6);
    ctx.stroke();

    ctx.fillStyle = BOMB_FUSE_COLOR;
    ctx.beginPath();
    ctx.arc(3, -e.hitRadius-7, 1.6, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  // spawnea una bomba con velocidad inicial (vx,vy) desde (x,y).
  // opts:
  //   groundY            -> altura a la que se pierde sola si nadie la reclama (default STREET_Y)
  //   getRedirectTarget()-> devuelve el objetivo de la segunda pierna del vuelo dirigido (ej. el boss)
  //   onRedirectHitTarget(tgt) -> se llama si de verdad le pega al objetivo
  window.spawnCrazyLimeBomb = function(x, y, vx, vy, opts = {}){
    const e = spawnEntity('crazylimebomb', x, y, opts);
    if(e){ e.vx = vx; e.vy = vy; }
    return e;
  };

})();
