// ============================================================================
//  entities/civiles.js
// ----------------------------------------------------------------------------
//  Civiles: NPCs que caminan por la calle con comportamiento natural (tramos
//  largos, pausas, ida-y-vuelta, y a veces se paran a conversar entre ellos),
//  se asustan si ArachnoSwinger aterriza fuerte cerca, y se pueden enganchar
//  con la telaraña (y, con un TOQUE de boton medio ya enganchados, "jalarlos"
//  hacia el jugador: caen sobre el y lo abrazan hasta que lo sueltes
//  manteniendo boton medio 3s parado en el piso).
//
//  Si los sueltas sobre un techo/balcon en vez de la calle, no se caen: se
//  quedan ahi parados, temblando del susto, quietos, hasta que los vuelvas a
//  enganchar o hasta que el chunk en el que nacieron se descargue.
//
//  moveType es 'custom': el civil trae su propia fisica (gravedad + choque
//  con plataformas Y calle) en vez de la generica del motor, que solo conoce
//  el piso de la calle. Todo lo demas sigue igual: el motor solo le da tres
//  ganchos genericos, pensados para cualquier entidad futura, no solo civiles:
//    - window.CHUNK_LOAD_LISTENERS / CHUNK_UNLOAD_LISTENERS: para spawnear y
//      despawnear por chunk (ver seccion SPAWN POR CHUNK mas abajo).
//    - window.PLAYER_LAND_LISTENERS: se llama cada vez que el jugador aterriza
//      en la calle viniendo de una caida, con la velocidad de impacto.
//    - def.huggable en registerEntityType: un toque de boton medio con la
//      telaraña tensada enganchada a esta entidad hace que ELLA viaje hacia el
//      jugador (en vez de al reves, como con un edificio). Al llegar, el motor
//      prende e.justCaught por un frame; que hacer con eso es cosa nuestra.
// ============================================================================

(function(){

  // ---------- apariencia ----------
  const SKIN_COLORS  = ['#e8b48c', '#c98a5c', '#8d5a3c', '#f0c8a0', '#a9673f'];
  const SHIRT_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e'];
  const PANTS_COLORS = ['#2c3e50', '#34495e', '#4a4a4a', '#5d4037', '#1c2833', '#3b3b58'];

  function pick(rng, arr){ return arr[Math.floor(rng()*arr.length)]; }
  function pickRandom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

  // ---------- ajustes ----------
  const CIVIL_HIT_RADIUS = 14;              // PLAYER_SIZE/2: misma altura que el prota
  const CIVIL_WALK_SPEED_MIN = 40;
  const CIVIL_WALK_SPEED_MAX = 95;
  const CIVIL_ACCEL = 220;                  // px/s^2: que tan rapido llegan a su velocidad objetivo (nada de arrancar/frenar de golpe)

  // planes de comportamiento en la calle (ver pickNewPlan): caminar derecho, pararse un rato,
  // o hacer ida-y-vuelta en un tramo — asi no se ven todos haciendo lo mismo todo el tiempo
  const PLAN_WALK_MIN   = 3,   PLAN_WALK_MAX   = 14;  // pueden irse derecho MUCHO rato
  const PLAN_PAUSE_MIN  = 1.5, PLAN_PAUSE_MAX  = 4.5;
  const PLAN_PACE_MIN   = 3,   PLAN_PACE_MAX   = 9;
  const PLAN_PACE_HALF_MIN = 40, PLAN_PACE_HALF_MAX = 110;

  // charla entre dos civiles parados cerca (puro adorno visual, nada de logica de verdad)
  const CHAT_RADIUS         = 50;
  const CHAT_CHANCE_PER_SEC = 0.2;
  const CHAT_DURATION_MIN   = 3,  CHAT_DURATION_MAX   = 6.5;
  const CHAT_COOLDOWN_MIN   = 4,  CHAT_COOLDOWN_MAX   = 10;

  const SCARE_LAND_SPEED  = 950;   // que tan fuerte tiene que venir cayendo el jugador para asustarlos (px/s)
  const SCARE_RADIUS      = 260;   // que tan cerca del impacto tienen que estar para asustarse
  // 385 px/s de impulso, con la gravedad de los civiles (CIVIL_GRAVITY, mas abajo), los sube
  // ~1.5 alturas de bus (bus y medio) antes de volver a bajar -- por debajo del umbral de daño
  // de caida (FALL_DAMAGE_UNIT_PX = 2 buses), asi el saltito del susto en si nunca los lastima
  const SCARE_JUMP_VY     = 385;   // impulso del saltito del susto
  const GATHER_TIME_MIN   = 1.4;   // cuanto se quedan "rodeando" al jugador antes de retomar su camino
  const GATHER_TIME_MAX   = 2.8;
  const GATHER_DIST_MIN   = 34;    // que tan cerca del jugador se paran a rodearlo
  const GATHER_DIST_MAX   = 95;

  const DROP_HOLD_TIME    = 3;     // segundos de boton medio mantenido, quieto y sin tocar nada mas, para soltarlo

  // ---------- salir disparado si el jugador rueda al aterrizar cargandolos (ver applyFallImpact
  // y window.PLAYER_ROLL_LISTENERS en el motor) ----------
  const ROLL_EJECT_VX_MIN     = 260;  // que tan lejos salen disparados, como minimo
  const ROLL_EJECT_VX_MAX     = 380;  // ...y como maximo
  const ROLL_EJECT_VY         = -260; // impulso hacia arriba: salen "volando" un toque antes de caer
  const ROLL_EJECT_DAMAGE     = 1;    // vida fija que pierden por el golpe del despiste, aparte de cualquier daño de caida normal
  const KNOCKED_LIE_DURATION  = 1.1;  // segundos tirados en el piso, boca arriba, antes de levantarse y seguir caminando

  const MAX_CARRIED       = 4;     // como mucho 4 civiles encima al mismo tiempo
  const DROP_SPREAD_X     = 9;     // separacion en X entre los 4 al soltarlos: juntitos, pero no en la misma coordenada

  // ---------- vida: daño de caida ----------
  // cada civil nace con 5 de vida. Al ATERRIZAR (no en el aire: recien al tocar algo) se mide que
  // tan rapido venia cayendo justo antes del impacto (misma idea que el jugador, ver
  // applyFallImpact en spiderswing.html) y de ahi sale el daño. Si la caida es letal, se muere
  // ahi mismo -- ver civilOnDeath/updateDead mas abajo para la animacion.
  //
  // A proposito NO se mide por distancia acumulada desde el punto mas alto (como era antes): esa
  // cuenta se guardaba en la propia entidad (e.fallPeakY) y quedaba "pegada" si en el medio de la
  // caida el jugador la enganchaba con la telaraña y la abrazaba (mientras abraza, physicsStep ni
  // se llama -- ver 'hugging' en onUpdate), asi que si despues la soltaba de vuelta, el aterrizaje
  // cobraba de nuevo la caida VIEJA, de antes del rescate, aunque el golpe real hubiera sido chico
  // -- de ahi el bug de "los salvo de la caida y se mueren igual". Midiendo la velocidad de
  // impacto de este mismo frame en vez de acumular nada entre frames, no hay estado que se pueda
  // quedar pegado: cada aterrizaje se juzga solo por la caida que de verdad acaba de terminar.
  const CIVIL_MAX_HP = 5;
  // 385px/s es el impulso del saltito del susto (SCARE_JUMP_VY, ver mas abajo) y por diseño
  // nunca debe doler -- el umbral queda apenas por encima para dejarlo pasar siempre
  const CIVIL_FALL_DAMAGE_MIN_SPEED = 430;
  // a velocidad terminal (CIVIL_TERMINAL_VY, la maxima posible cayendo) el golpe es letal: una
  // caida larga de verdad los sigue matando, igual que con el sistema viejo por distancia
  const CIVIL_FALL_DAMAGE_MAX_HP = CIVIL_MAX_HP;

  // ---------- animacion de muerte (estilo "bloque de Minecraft"): rojo, se tumba de costado, desaparece ----------
  const DEAD_TIP_DURATION   = 0.45;  // segundos en tumbarse de costado
  const DEAD_FADE_DURATION  = 0.6;   // segundos en desvanecerse una vez tumbado
  const DEAD_TOTAL_DURATION = DEAD_TIP_DURATION + DEAD_FADE_DURATION;

  // ---------- pantalla de alertas de muerte, esquina inferior izquierda ----------
  const DEATH_MSG_LIFETIME = 4;   // segundos visible antes de desvanecerse
  const DEATH_MSG_MAX      = 6;   // como mucho, los ultimos 6 mensajes juntos en pantalla

  // ---------- peso: cada civil pesa lo que pesaria de verdad ----------
  // en vez de un numero de "juego" inventado, cada civil nace con un peso real en kg (rango de
  // adulto), como cualquier persona de carne y hueso. Ese kg se convierte a las unidades de masa
  // que ya usa toda la fisica del motor (PLAYER_REFERENCE_WEIGHT_KG, ver spiderswing.html: el
  // jugador mismo pesa 1 unidad ahi) dividiendo por el peso de referencia del jugador. El motor
  // ya se encarga solo de ahi en mas -- ver carryMassEffective en spiderswing.html para la curva
  // que evita que cargar 4 personas de peso real vuelva el swing injugable.
  const CIVIL_WEIGHT_MIN_KG = 48;  // alguien mas chico/liviano
  const CIVIL_WEIGHT_MAX_KG = 95;  // alguien fornido
  const PLAYER_REF_KG = window.PLAYER_REFERENCE_WEIGHT_KG || 75;

  // 4 lugares fijos para colgarse del torso del jugador (no se superponen entre si): dos mas
  // pegados al frente (slots 0/1, izquierda y derecha) y dos un poco mas atras/abajo (2/3), para
  // cuando hay 3 o 4 civiles enganchados a la vez. "side" tambien se usa para saber hacia que
  // lado hay que mirar los brazos/piernas para que abracen HACIA el jugador y no al reves.
  const HUG_SLOTS = [
    {side:-1, dist:5, y:1},
    {side: 1, dist:5, y:1},
    {side:-1, dist:9, y:5},
    {side: 1, dist:9, y:5},
  ];

  // ---------- "civil envuelto": lo que pasa cuando un telarañazo SUELTO (webProjectiles en
  // spiderswing.html -- una telaraña disparada a la nada, o cortada a mitad de viaje, sin punto
  // de anclaje) atraviesa a un civil en vez de perderse en la pantalla (ver onWebProjectileHit,
  // el gancho generico que llama el motor) ----------
  // al recibir el telarañazo, el civil sale empujado en la MISMA direccion en la que iba
  // viajando ese telarañazo, con una fuerza proporcional a la velocidad que traia en ese
  // instante (WEB_PROJECTILE_SPEED, fija en el motor) -- amortiguada por lo pesado que sea ESTE
  // civil en particular (e.weightKg, ver mas arriba): a uno liviano lo manda mas lejos que a uno
  // fornido, misma idea de siempre con el peso real. De ahi en mas queda 'wrapped' (envuelto),
  // tieso, y pasa por 3 sub-fases (e.wrapPhase):
  //   'flying'  -> volando por el impulso del empujon, con la misma gravedad+colision de calle/
  //                plataformas de cualquier civil en el aire, pero ADEMAS revisando en el camino
  //                si se estampa contra la FACHADA de un edificio (no el techo -- ese ya es un
  //                aterrizaje normal, ver findFacadeHit)
  //   'stuck'   -> se pego a esa fachada: congelado ahi, ignorando la gravedad, durante
  //                WRAP_MELT_TIME segundos (lo que tarda la telaraña en derretirse)
  //   'resting' -> en cambio, si no llego a chocar contra ningun edificio y termino aterrizando
  //                en la calle o una plataforma, se queda tieso ahi mismo (el daño de la caida ya
  //                se cobro fuertemente amortiguado por el envoltorio, ver WRAP_FALL_DAMAGE_DAMPING)
  //                el mismo tiempo WRAP_MELT_TIME antes de volver a la normalidad
  // en cualquiera de las dos (stuck o resting) el jugador puede sacarlo antes de tiempo
  // simplemente engancandole una telaraña nueva y sosteniendola: eso ya lo resuelve solo el
  // chequeo generico de "towedNow" mas abajo en onUpdate (corre para cualquier estado, wrapped
  // incluido), que lo pasa a 'towed' de una — momento en el que soltamos wrapPhase sin mas tramite.
  const WEB_HIT_KNOCKBACK_FACTOR = 0.3;   // que fraccion de la velocidad del telarañazo se convierte en el impulso de empuje
  const WEB_HIT_KNOCKBACK_MIN_SCALE = 0.55; // por mas fornido que sea el civil, nunca amortigua el empujon mas alla de esto
  const WEB_HIT_KNOCKBACK_MAX_SCALE = 1.7;  // por mas liviano que sea, nunca lo manda mas lejos que esto
  const AVG_CIVIL_WEIGHT_KG = (CIVIL_WEIGHT_MIN_KG + CIVIL_WEIGHT_MAX_KG) / 2;
  const WRAP_MELT_TIME = 15;              // segundos hasta que la telaraña se derrite y vuelve a la normalidad
  const WRAP_FALL_DAMAGE_DAMPING = 0.35;  // el envoltorio amortigua MUCHO el golpe de caida: solo esta fraccion de la velocidad de impacto cuenta para el daño
  const FACADE_HIT_Y_MARGIN = 10;         // cuanto tiene que penetrar por debajo del techo de un edificio para contar como choque de fachada (evita confundirlo con un aterrizaje limpio en el techo, que llega raspando ese mismo borde)

  // ---------- tipo de entidad ----------
  registerEntityType('civil', {
    hp: CIVIL_MAX_HP,
    hitRadius: CIVIL_HIT_RADIUS,
    moveType: 'custom',        // fisica propia (ver physicsStep): gravedad + choque con calle Y plataformas
    webAttachable: true,       // se puede enganchar con la telaraña, como un carro
    huggable: true,            // un toque de boton medio ya enganchado lo jala HACIA el jugador
    pullMass: 1,               // liviano: facil de arrastrar/cargar en pleno swing
    carryLimit: MAX_CARRIED,   // el motor no deja enganchar un quinto si ya cargas 4 (ver performWebPull)
    // agrupa el limite de carga por esto en vez de por el tipo exacto (ver performWebPull en el
    // motor): asi cualquier tipo que "sea" un civil para estos efectos -- ahora mismo solo
    // 'jaryman', que clona este def entero con Object.assign (ver jaryman.js) y se lo lleva puesto
    // sin tener que declararlo de nuevo -- cuenta para el mismo tope de 4 en vez de tener uno
    // aparte solo porque su tipo se llama distinto. Sin esto, Jary Mane no contaba como uno de los
    // 4 y terminabas cargando 5 a la vez.
    carryGroup: 'civil',
    // valor de tipo (usado solo como resguardo/flag de "esto se puede cargar" -- ver el chequeo
    // `carriable` en applyEntityRopePull); el peso DE VERDAD de cada civil se fija por instancia
    // en onSpawn (e.weightKg / e.carryWeight), asi que esto casi nunca es lo que termina leyendo
    // getPlayerCarryMass en la practica
    carryWeight: (CIVIL_WEIGHT_MIN_KG + CIVIL_WEIGHT_MAX_KG) / 2 / PLAYER_REF_KG,
    friendly: true,
    invulnerable: true,        // no son combatientes: los puños/patadas/proyectiles nunca les bajan vida (ver dealDamageAt en el motor). El daño de caida NO pasa por ahi: se lo aplicamos nosotros mismos a mano en physicsStep, asi que invulnerable no los protege de una caida mortal
    onDeath: civilOnDeath,
    onWebProjectileHit: onCivilWebProjectileHit, // telarañazo suelto (sin anclaje) que lo atraviesa: lo envuelve en telaraña, ver mas abajo

    onSpawn(e){
      e.skinColor  = e.skinColor  || pickRandom(SKIN_COLORS);
      e.shirtColor = e.shirtColor || pickRandom(SHIRT_COLORS);
      e.pantsColor = e.pantsColor || pickRandom(PANTS_COLORS);

      // todo civil TIENE que nacer con su propio peso real -- no es opcional, ni queda en manos
      // de quien spawnee (spawnEntity no lo pisa porque nunca viene en opts): sin esto el motor
      // caeria al default parejo del tipo y todos pesarian exactamente lo mismo, que es justo lo
      // que no queremos de una fisica de peso de verdad
      e.weightKg    = e.weightKg || (CIVIL_WEIGHT_MIN_KG + Math.random()*(CIVIL_WEIGHT_MAX_KG - CIVIL_WEIGHT_MIN_KG));
      e.carryWeight = e.weightKg / PLAYER_REF_KG;

      e.state = 'walking';
      e.walkCycle = Math.random()*Math.PI*2;
      e.facing = Math.random() < 0.5 ? -1 : 1;
      e.dropHoldTimer = 0;
      e.chatCooldown = Math.random()*3; // que no todos arranquen habilitados a conversar en el mismo instante
      e.plan = null;
      pickNewPlan(e);
    },

    onUpdate(e, dt){
      // ya esta muerto: solo corre su propia animacion (tumbarse de costado + desvanecerse),
      // nada de fisica normal ni IA -- ver civilOnDeath/updateDead mas abajo
      if(e.state === 'dead'){ updateDead(e, dt); return; }

      if(e.state === 'hugging'){ updateHugging(e, dt); return; }

      // la OTRA forma de llevar a alguien: engancharlo con la telaraña como a un carro, sin
      // abrazo (todavia). A diferencia del abrazo, el motor no le avisa nada especial a la
      // entidad enganchada -- asi que si no hacemos nada aca, el civil sigue con su plan de
      // caminata de toda la vida mientras lo llevas colgando, sin enterarse de que esta
      // suspendido en el aire de una soga. Eso es justo lo que hacia que, al soltarlo sobre un
      // balcon, siguiera caminando derecho como si nada y se tirara del borde. Por eso llevamos
      // la cuenta nosotros mismos, cuadro a cuadro, de si HAY una telaraña de mano apuntando a
      // esta entidad en este momento.
      const towedNow = (webs.left  && webs.left.state  === 'attached' && webs.left.entity  === e) ||
                        (webs.right && webs.right.state === 'attached' && webs.right.entity === e);

      if(towedNow && e.state !== 'towed'){
        // lo acaban de enganchar (sin abrazo): que deje de decidir por su cuenta y quede quieto,
        // colgando -- de aca en mas lo mueven applyEntityRopePull (el resorte pasivo de la soga)
        // y cualquier applyEntityPullImpulse (el jalon de boton medio, ver el motor) que le
        // manden, mas su propia gravedad -- no su plan de caminata viejo
        if(e.chatPartner){ e.chatPartner.chatPartner = null; e.chatPartner = null; }
        e.state = 'towed';
        e.vx = 0; e.vy = 0;
      } else if(!towedNow && e.state === 'towed'){
        // la telaraña se soltó (o se cortó) sin haber llegado a completar el abrazo: resolver
        // segun donde haya quedado colgando, igual de cuidadoso que al soltar un abrazo (ver
        // dropCivil) -- si quedo parado sobre un techo o balcon, quietecito y asustado ahi (NO
        // seguir caminando y tirarse); si quedo en el aire, que caiga y updateFalling decida al
        // aterrizar; si ya esta en plena calle, sigue su vida
        if(e.grounded && e.standingPlatform) enterStranded(e);
        else if(e.grounded){ e.state = 'walking'; pickNewPlan(e); }
        else e.state = 'falling';
      }

      // "civil envuelto" (ver bloque de comentarios y constantes mas arriba): usa su PROPIA
      // fisica (vuelo/caida + chequeo de fachada, o quietecito pegado/tirado) en vez de la
      // generica de mas abajo -- por eso corta aca y no llega ni a physicsStep. El chequeo de
      // towedNow ya paso (arriba), asi que si el jugador le engancho una telaraña nueva y la
      // esta sosteniendo, para este punto e.state ya cambio a 'towed' y ni entra aca: es asi
      // como "lo sacan antes de tiempo si lo jalan", sin nada especial que hacer nosotros.
      if(e.state === 'wrapped'){
        updateWrapped(e, dt);
        if(e.chatCooldown > 0) e.chatCooldown -= dt;
        return;
      }

      // todo lo demas SI usa fisica propia (gravedad + calle + plataformas de un solo sentido,
      // igual que el jugador): caminando, conversando, en pleno saltito de susto, cayendo tras
      // soltarlo, colgando de la telaraña, o quietecito arriba de un techo, todos necesitan estar
      // parados en algo (o cayendo hacia eso)
      physicsStep(e, dt);
      if(e.chatCooldown > 0) e.chatCooldown -= dt;

      if(e.state === 'towed'){
        // colgando de la telaraña, sin abrazo todavia (ver applyEntityPullImpulse/
        // applyEntityRopePull en el motor, que son quienes lo mueven de verdad, no una IA propia
        // aca): en cuanto llega lo bastante cerca del jugador, el abrazo se completa solo, sin
        // hacer falta ningun boton mas -- asi que un jalon no garantiza atraparlo de una: si el
        // impulso no alcanza, se queda corto, colgando, y hay que volver a tirar (o afinar la
        // punteria la proxima vez)
        tryCatchTowedCivil(e);
        return;
      }
      if(e.state === 'falling'){ updateFalling(e, dt); return; }
      if(e.state === 'lyingDown'){ updateLyingDown(e, dt); return; }
      if(e.state === 'strandedOnRoof'){ updateStranded(e, dt); return; }
      if(e.state === 'scaredJump'){ updateScaredJump(e, dt); return; }
      if(e.state === 'gathering'){ updateGathering(e, dt); return; }
      if(e.state === 'chatting'){ updateChatting(e, dt); return; }
      updateWalking(e, dt);
    },

    draw(ctx, e){ drawCivil(ctx, e); }
  });

  // que tan cerca del jugador tiene que llegar, colgando de la telaraña (sin abrazo todavia),
  // para que el abrazo se complete solo -- un poco mas generoso que el simple contacto de
  // hitboxes (PLAYER_SIZE/2 + CIVIL_HIT_RADIUS = 28) para que no haga falta una precision de
  // pixel perfecto, pero sin pasarse (si fuera gigante, cualquier jalon mediocre alcanzaria)
  const CATCH_RADIUS = 34;

  // se llama cuadro a cuadro mientras e.state === 'towed': si ya esta lo bastante cerca del
  // jugador, intenta completar el abrazo (si hay lugar -- ver carryLimit); si no hay lugar, se
  // queda colgando tal cual, sigue intentandolo el proximo cuadro por si el jugador suelta a
  // alguien mientras tanto
  function tryCatchTowedCivil(e){
    const dx = player.x - e.x, dy = player.y - e.y;
    if(dx*dx + dy*dy > CATCH_RADIUS*CATCH_RADIUS) return; // todavia no llego lo bastante cerca

    // por carryGroup, no por type==='civil' a secas -- mismo motivo de siempre: si Jary Mane
    // (type 'jaryman') ya esta abrazada y no la contamos aca, un civil nuevo podia terminar
    // heredando el MISMO hugSlot que ella y quedar los dos superpuestos
    const group = e.def.carryGroup || e.type;
    const carriedNow = entities.filter(en => (en.def.carryGroup || en.type) === group && en.carried).length;
    const limit = e.def.carryLimit;
    if(limit !== undefined && carriedNow >= limit) return; // ya cargas el maximo: se queda colgando

    releaseWebsAttachedTo(e); // ya cumplio su funcion -- de aca en mas lo sostiene el abrazo, no la soga
    e.state = 'hugging';
    e.carried = true;
    e.vx = 0; e.vy = 0;
    e.dropHoldTimer = 0;
    e.chatPartner = null;
    e.hugSlot = Math.min(carriedNow, HUG_SLOTS.length - 1); // que lugar del torso le toca (nunca se pisan entre si)
  }

  // suelta cualquier telaraña (de cualquier mano) que siga apuntando a esta entidad -- se usa al
  // completar el abrazo (tryCatchTowedCivil), donde la soga ya cumplio su trabajo y hay que
  // soltarla para que no siga tironeando de un civil que ya esta colgado del cuello del jugador
  function releaseWebsAttachedTo(e){
    for(const hand of ['left','right']){
      const w = webs[hand];
      if(w && w.state === 'attached' && w.entity === e) detachIfAttached(hand);
    }
  }

  // ---------- fisica propia: gravedad + calle + techos/balcones (un solo sentido, como el jugador) ----------
  // los civiles NO caen con la misma gravedad que el jugador (GRAVITY, pensada para un swing
  // rapido y responsivo): a una persona comun cayendo se le nota mucho mas el aire, y en el
  // juego esto importa doble: si algun dia hay que rescatar civiles cayendo, el sentido aracnido
  // (bullet time) tiene que darte tiempo real de reaccionar, no una fraccion de segundo antes de
  // que se pierdan de la pantalla. CIVIL_TERMINAL_VY ademas le pone un techo a la velocidad de
  // caida: por mas alto que sea el edificio del que se cayeron, nunca aceleran mas alla de eso,
  // asi la ventana de reaccion es siempre parecida sin importar la altura.
  const CIVIL_GRAVITY     = GRAVITY * 0.55; // bastante mas floja que la del jugador: cae como una persona, no como un yunque
  const CIVIL_TERMINAL_VY = 620;            // tope de velocidad de caida (px/s)

  function physicsStep(e, dt){
    const wasGrounded = e.grounded;
    const prevBottom = e.y + e.hitRadius;
    e.vy += CIVIL_GRAVITY*dt;
    if(e.vy > CIVIL_TERMINAL_VY) e.vy = CIVIL_TERMINAL_VY;
    // velocidad vertical de ESTE frame: si aterriza ahora mismo, es esta la que lo golpeo. Se
    // recalcula de cero cada frame (nada de guardarla en la entidad) -- ver nota sobre
    // CIVIL_FALL_DAMAGE_MIN_SPEED mas arriba, es justo lo que evita el bug del rescate a mitad
    // de caida.
    const impactVy = e.vy;
    e.y  += e.vy*dt;
    e.x  += e.vx*dt;
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

    // la calle es el piso de emergencia: siempre esta ahi debajo de cualquier plataforma
    if(!e.grounded && e.y + e.hitRadius >= STREET_Y){
      e.y = STREET_Y - e.hitRadius;
      e.vy = 0;
      e.grounded = true;
      e.standingPlatform = null;
    }

    // recien aterrizo este mismo frame (antes no estaba parado en nada, ahora si): momento de
    // cobrar el daño de la caida que acaba de terminar, con la velocidad de impacto que traia
    if(e.grounded && !wasGrounded) applyFallDamage(e, impactVy);
  }

  // ---------- daño de caida: escala segun que tan rapido venia cayendo al tocar el piso, de 0 en
  // CIVIL_FALL_DAMAGE_MIN_SPEED hasta letal (CIVIL_FALL_DAMAGE_MAX_HP) en CIVIL_TERMINAL_VY ----------
  function applyFallDamage(e, impactSpeed){
    if(e.dying || e.state === 'dead') return;   // ya se esta muriendo, no hace falta seguir restando
    if(impactSpeed < CIVIL_FALL_DAMAGE_MIN_SPEED) return; // caida chica (saltito de susto, etc.): sin daño

    const t = Math.min(1, (impactSpeed - CIVIL_FALL_DAMAGE_MIN_SPEED) / (CIVIL_TERMINAL_VY - CIVIL_FALL_DAMAGE_MIN_SPEED));
    const dmg = t * CIVIL_FALL_DAMAGE_MAX_HP;
    if(dmg <= 0) return;

    e.hp -= dmg;
    // si hp llega a <=0 aca, el motor (updateEntities) lo detecta solo un poco mas abajo en este
    // mismo frame y llama a civilOnDeath -- no hace falta que nosotros disparemos nada mas
  }

  // ---------- "civil envuelto" en telaraña (ver bloque de comentarios grande junto a las
  // constantes WEB_HIT_KNOCKBACK_*/WRAP_* mas arriba) ----------

  // llamado por el motor (onWebProjectileHit) el frame exacto en el que un telarañazo SUELTO
  // atraviesa a este civil
  function onCivilWebProjectileHit(e, dirX, dirY, speed){
    // no envolver a alguien que ya esta fuera de circulacion de alguna otra forma (muerto,
    // colgando/abrazado del jugador, o ya envuelto de antes -- un segundo telarañazo mientras
    // sigue envuelto no hace nada nuevo, no se "suma" el empujon). Devolver false/undefined aca
    // le dice al motor (ver el loop de webProjectiles en spiderswing.html) que el telarañazo NO
    // se considere consumido por esta entidad -- asi sigue de largo en vez de "morir" contra
    // alguien que ya estabas cargando/abrazando (por ej. el mismo civil que colgaba de tu propio
    // origen al tirar un telarañazo suelto desde donde estas parado)
    if(e.dead || e.state === 'dead' || e.carried || e.state === 'hugging' ||
       e.state === 'towed' || e.state === 'wrapped') return false;

    if(e.chatPartner){ e.chatPartner.chatPartner = null; e.chatPartner = null; }
    releaseWebsAttachedTo(e); // por si alguna soga vieja (de un enganche previo) seguia apuntandole

    const weightScale = Math.min(WEB_HIT_KNOCKBACK_MAX_SCALE,
      Math.max(WEB_HIT_KNOCKBACK_MIN_SCALE, AVG_CIVIL_WEIGHT_KG / (e.weightKg || AVG_CIVIL_WEIGHT_KG)));
    const pushSpeed = speed * WEB_HIT_KNOCKBACK_FACTOR * weightScale;

    e.state = 'wrapped';
    e.wrapPhase = 'flying';
    e.stuckBuilding = null;
    e.vx = dirX * pushSpeed;
    e.vy = dirY * pushSpeed;
    e.grounded = false;
    e.standingPlatform = null;
    e.dropHoldTimer = 0;
    return true; // esta vez si reacciono: el motor da el telarañazo por consumido
  }

  // se llama cuadro a cuadro mientras e.state === 'wrapped': reparte segun la sub-fase actual
  function updateWrapped(e, dt){
    if(e.wrapPhase === 'stuck'){ updateWrappedStuck(e, dt); return; }
    if(e.wrapPhase === 'resting'){ updateWrappedResting(e, dt); return; }
    updateWrappedFlying(e, dt);
  }

  // volando por el impulso del telarañazo: misma gravedad+colision de calle/plataformas que
  // cualquier civil en el aire (ver physicsStep), pero chequeando ADEMAS si en el camino se
  // estampa contra la fachada de un edificio antes de llegar a tocar el piso
  function updateWrappedFlying(e, dt){
    const prevY = e.y;
    e.vy += CIVIL_GRAVITY*dt;
    if(e.vy > CIVIL_TERMINAL_VY) e.vy = CIVIL_TERMINAL_VY;
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
      // no aterrizo contra una fachada sino en el piso: el envoltorio amortigua MUCHO el golpe
      applyFallDamage(e, impactVy * WRAP_FALL_DAMAGE_DAMPING);
      if(e.hp > 0) enterWrappedResting(e); // si el golpe (ya amortiguado) lo mato, que muera normal, no quedar "resting" con hp<=0
    }
  }

  // busca un edificio cuya FACHADA (no el techo: ver FACADE_HIT_Y_MARGIN) este en este punto --
  // pensado para un civil volando por el impulso de un telarañazo, no para el agarre de pared
  // del jugador (esa es tryGrabWall, en spiderswing.html, con su propia logica de bordes)
  function findFacadeHit(x, y, r){
    for(const b of buildings){
      if(x + r <= b.x || x - r >= b.x + b.w) continue;
      if(y + r <= b.y + FACADE_HIT_Y_MARGIN) continue; // apenas raspando el techo: eso es un aterrizaje normal, no un choque de fachada
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
    e.wrapTimer = WRAP_MELT_TIME;
  }

  // pegado a una fachada, congelado, ignorando la gravedad -- hasta que se derrita la telaraña
  // (o lo saquen antes de tiempo con un jalon, ver la nota junto al dispatch de 'wrapped' en onUpdate)
  function updateWrappedStuck(e, dt){
    e.wrapTimer -= dt;
    if(e.wrapTimer <= 0) unwrapEntity(e);
  }

  function enterWrappedResting(e){
    e.wrapPhase = 'resting';
    e.wrapTimer = WRAP_MELT_TIME;
    e.vx = 0;
  }

  // tirado/parado tieso donde aterrizo (no contra una fachada), quieto hasta que se derrita la
  // telaraña -- misma idea que updateWrappedStuck, pero sin edificio de por medio
  function updateWrappedResting(e, dt){
    e.vx = 0;
    e.wrapTimer -= dt;
    if(e.wrapTimer <= 0) unwrapEntity(e);
  }

  // se derritio la telaraña (se le acabo el timer, en cualquiera de las dos sub-fases): vuelve a
  // la normalidad. Si quedaba pegado en el aire a media fachada, ahora que ya no hay nada que lo
  // sostenga cae con fisica normal de caida (updateFalling se encarga, ya SIN amortiguar: el
  // envoltorio que la dañaba ya se derritio); si ya estaba en el piso, retoma su vida de siempre.
  function unwrapEntity(e){
    e.wrapPhase = null;
    e.stuckBuilding = null;
    if(e.grounded){
      // igual que en updateFalling: si quedo parado sobre un techo/balcon (no en plena calle), que
      // se quede quietecito temblando ahi (enterStranded) en vez de retomar la caminata normal --
      // antes esto se pisaba siempre a 'walking' sin mirar standingPlatform, asi que un civil
      // envuelto que se derretia arriba de un techo se ponia a caminar como si nada y se tiraba
      // del borde
      if(e.standingPlatform) enterStranded(e);
      else { e.state = 'walking'; pickNewPlan(e); }
    } else {
      e.state = 'falling';
      e.vx = 0; e.vy = 0;
    }
  }

  // ---------- IA de calle: planes de comportamiento (caminar derecho / pausar / ida-y-vuelta) ----------
  function pickNewPlan(e){
    const r = Math.random();
    if(r < 0.45){
      e.plan = 'walk';
      e.planDir = Math.random() < 0.5 ? -1 : 1;
      e.planSpeed = CIVIL_WALK_SPEED_MIN + Math.random()*(CIVIL_WALK_SPEED_MAX - CIVIL_WALK_SPEED_MIN);
      e.planTimer = PLAN_WALK_MIN + Math.random()*(PLAN_WALK_MAX - PLAN_WALK_MIN);
    } else if(r < 0.72){
      e.plan = 'pause';
      e.planTimer = PLAN_PAUSE_MIN + Math.random()*(PLAN_PAUSE_MAX - PLAN_PAUSE_MIN);
    } else {
      e.plan = 'pace'; // se queda yendo de un lado a otro en un tramo, en vez de perderse derecho
      e.planCenter = e.x;
      e.planHalf = PLAN_PACE_HALF_MIN + Math.random()*(PLAN_PACE_HALF_MAX - PLAN_PACE_HALF_MIN);
      e.planDir = Math.random() < 0.5 ? -1 : 1;
      e.planSpeed = (CIVIL_WALK_SPEED_MIN + Math.random()*(CIVIL_WALK_SPEED_MAX - CIVIL_WALK_SPEED_MIN)) * 0.8;
      e.planTimer = PLAN_PACE_MIN + Math.random()*(PLAN_PACE_MAX - PLAN_PACE_MIN);
    }
  }

  function updateWalking(e, dt){
    if(!e.plan) pickNewPlan(e);

    let targetVx = 0;
    if(e.plan === 'walk'){
      targetVx = e.planDir * e.planSpeed;
    } else if(e.plan === 'pace'){
      if(e.x <= e.planCenter - e.planHalf) e.planDir = 1;
      else if(e.x >= e.planCenter + e.planHalf) e.planDir = -1;
      targetVx = e.planDir * e.planSpeed;
    }
    // 'pause' deja targetVx en 0

    // aceleracion suave hacia la velocidad objetivo: nada de arrancar/frenar de golpe
    const diff = targetVx - e.vx;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), CIVIL_ACCEL*dt);
    e.vx += step;

    if(Math.abs(e.vx) > 5) e.facing = e.vx > 0 ? 1 : -1;
    if(e.grounded && Math.abs(e.vx) > 5) e.walkCycle += Math.abs(e.vx)*dt*0.08;

    // parado y sin nada mas que hacer: a veces se le da por conversar con algun vecino cercano
    if(e.plan === 'pause' && e.chatCooldown <= 0 && Math.random() < CHAT_CHANCE_PER_SEC*dt){
      tryStartChat(e);
    }

    e.planTimer -= dt;
    if(e.planTimer <= 0) pickNewPlan(e);
  }

  // ---------- charla entre dos civiles parados cerca ----------
  function tryStartChat(e){
    if(!e.grounded || e.standingPlatform) return; // de charla solo abajo, en la calle
    for(const other of entities){
      if(other === e || other.type !== 'civil' || other.dead) continue;
      if(other.state !== 'walking' || other.plan !== 'pause' || other.chatCooldown > 0) continue;
      if(!other.grounded || other.standingPlatform) continue;
      if(Math.abs(other.x - e.x) > CHAT_RADIUS) continue;

      const dur = CHAT_DURATION_MIN + Math.random()*(CHAT_DURATION_MAX - CHAT_DURATION_MIN);
      e.state = 'chatting'; other.state = 'chatting';
      e.chatPartner = other; other.chatPartner = e;
      e.chatTimer = dur; other.chatTimer = dur;
      e.vx = 0; other.vx = 0;
      e.facing = e.x < other.x ? 1 : -1;
      other.facing = other.x < e.x ? 1 : -1;
      e.gestureCycle = Math.random()*Math.PI*2;
      other.gestureCycle = Math.random()*Math.PI*2 + Math.PI; // desfasado, para que no muevan las manos igual
      return;
    }
  }

  function updateChatting(e, dt){
    const partner = e.chatPartner;
    if(!partner || partner.dead || partner.state !== 'chatting'){ endChat(e); return; }

    e.vx = 0;
    e.facing = e.x < partner.x ? 1 : -1;
    e.gestureCycle += dt*3;
    e.chatTimer -= dt;
    if(e.chatTimer <= 0) endChat(e);
  }

  function endChat(e){
    e.state = 'walking';
    e.chatPartner = null;
    e.chatCooldown = CHAT_COOLDOWN_MIN + Math.random()*(CHAT_COOLDOWN_MAX - CHAT_COOLDOWN_MIN);
    pickNewPlan(e);
  }

  // ---------- susto por aterrizaje fuerte cerca ----------
  window.PLAYER_LAND_LISTENERS.push(function(impactSpeed, x, y){
    if(impactSpeed < SCARE_LAND_SPEED) return;
    for(const e of entities){
      if(e.type !== 'civil' || e.dead) continue;
      if(e.carried || e.beingReeled) continue;
      if(e.state !== 'walking' && e.state !== 'chatting') continue; // no interrumpe susto/reunion/abrazo/techo en curso
      if(e.standingPlatform) continue; // arriba de un techo no le llega el ruido de la calle
      if(Math.abs(e.x - x) > SCARE_RADIUS) continue;

      if(e.chatPartner){ e.chatPartner.chatPartner = null; e.chatPartner = null; } // que el otro no quede esperando a alguien que ya se fue

      e.state = 'scaredJump';
      // el salto del susto lo tira un poco lejos del punto de impacto antes de que vaya a rodearlo
      e.vx = (e.x < x ? -1 : 1) * (70 + Math.random()*50);
      e.vy = -SCARE_JUMP_VY;
      e.grounded = false;
      e.facing = e.vx > 0 ? 1 : -1;
    }
  });

  function updateScaredJump(e, dt){
    if(e.walkCycle !== undefined) e.walkCycle += Math.abs(e.vx)*dt*0.08;
    if(e.grounded){
      e.state = 'gathering';
      e.gatherTimer = GATHER_TIME_MIN + Math.random()*(GATHER_TIME_MAX - GATHER_TIME_MIN);
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = GATHER_DIST_MIN + Math.random()*(GATHER_DIST_MAX - GATHER_DIST_MIN);
      e.gatherTargetX = player.x + side*dist;
    }
  }

  function updateGathering(e, dt){
    const dx = e.gatherTargetX - e.x;
    if(Math.abs(dx) > 6){
      e.vx = Math.sign(dx) * (e.planSpeed || CIVIL_WALK_SPEED_MAX) * 1.4;
      e.facing = Math.sign(dx);
      if(e.grounded) e.walkCycle += Math.abs(e.vx)*dt*0.08;
    } else {
      e.vx = 0;
    }
    e.gatherTimer -= dt;
    if(e.gatherTimer <= 0){ e.state = 'walking'; pickNewPlan(e); }
  }

  // ---------- cayendo tras soltarlo (dropCivil) y quietecito-asustado si cae en un techo ----------
  function updateFalling(e, dt){
    if(e.grounded){
      if(e.standingPlatform) enterStranded(e);
      else if(e.knockedOnLand){ e.knockedOnLand = false; enterLyingDown(e); }
      else { e.state = 'walking'; pickNewPlan(e); }
    }
  }

  // ---------- tirado en el piso tras salir disparado (ver ejectFromRoll mas abajo) ----------
  function enterLyingDown(e){
    e.state = 'lyingDown';
    e.vx = 0;
    e.lieTimer = KNOCKED_LIE_DURATION;
    e.chatPartner = null;
  }

  function updateLyingDown(e, dt){
    e.lieTimer -= dt;
    if(e.lieTimer <= 0){ e.state = 'walking'; pickNewPlan(e); }
  }

  // ---------- el jugador aterrizo RODANDO cargandolos encima: salen disparados hacia el mismo
  // lado, pierden un poco de vida por el golpe, y quedan tirados en el piso hasta que se levantan
  // solos y siguen caminando (ver enterLyingDown/updateLyingDown arriba) ----------
  window.PLAYER_ROLL_LISTENERS.push(function(dirSign, x, y){
    // por carryGroup (con el tipo exacto como resguardo), no por type==='civil' a secas -- para
    // que Jary Mane (type 'jaryman', pero carryGroup 'civil' heredado del clon en jaryman.js)
    // tambien salga disparada y pierda vida como cualquier otro civil al aterrizar rodando con
    // ella encima, en vez de quedarse pegada al jugador como si nada
    const carried = entities.filter(en => (en.def.carryGroup || en.type) === 'civil' && en.carried && !en.dead);
    if(!carried.length) return;
    for(let i = 0; i < carried.length; i++){
      ejectFromRoll(carried[i], dirSign, i, carried.length);
    }
  });

  function ejectFromRoll(e, dirSign, index, total){
    e.carried = false;
    e.dropHoldTimer = 0;
    e.state = 'falling';
    e.knockedOnLand = true; // que al aterrizar, en vez de levantarse de una, quede tirado un rato
    e.vx = dirSign * (ROLL_EJECT_VX_MIN + Math.random()*(ROLL_EJECT_VX_MAX - ROLL_EJECT_VX_MIN));
    e.vy = ROLL_EJECT_VY;
    e.grounded = false;
    e.facing = dirSign;
    // mientras abrazaba, e.rotation seguia al player.rotation cuadro a cuadro (ver drawCivil,
    // rama 'hugging') -- y en pleno rodada el jugador gira rapido (ROLL_SPIN_RATE), asi que sin
    // este reseteo el civil quedaba pegado para siempre al angulo exacto en el que lo agarro la
    // rodada (a veces cabeza abajo), arrastrandolo hasta en la caminata de despues
    e.rotation = 0;
    // si van varios juntos, que no salgan los 4 exactamente superpuestos: un empujoncito chiquito
    // en X segun el orden en el que estaban (quedan bien juntitos, pero no en la misma coordenada)
    e.x += (index - (total-1)/2) * DROP_SPREAD_X;
    if(!e.dying && e.state !== 'dead') e.hp -= ROLL_EJECT_DAMAGE;

    // salir disparado en pleno rodada NUNCA es decision del jugador -- avisamos por si a alguien
    // le interesa reaccionar a un desprendimiento forzado en particular (ver 'civil-involuntary-drop'
    // mas abajo en dropCivil, y quien lo escucha en jaryman.js)
    window.dispatchEvent(new CustomEvent('civil-involuntary-drop', {detail: {entity: e}}));
  }

  function enterStranded(e){
    e.state = 'strandedOnRoof';
    e.vx = 0;
    e.trembleCycle = Math.random()*Math.PI*2;
    e.chatPartner = null;
  }

  function updateStranded(e, dt){
    // quietecito del todo: ni camina ni se acerca a la cornisa, solo tiembla del susto, hasta
    // que lo vuelvas a enganchar (justCaught lo saca de este estado) o se descargue el chunk
    e.vx = 0;
    e.trembleCycle += dt*14;
  }

  // ---------- muerte por caida: se pone rojo, se tumba de costado y desaparece ----------
  // el motor (updateEntities, en spiderswing.html) llama esto solo, la primera vez que hp llega
  // a <=0, y pone e.dead=true JUSTO ANTES de llamarlo -- si lo dejaramos asi, al frame siguiente
  // lo borraria de la lista de entidades sin darnos tiempo de animar nada. Por eso aca lo
  // "revivimos" (e.dead = false) y le damos un estado propio, 'dead', que se encarga de la
  // animacion cuadro a cuadro; solo al terminar (ver updateDead) lo dejamos morir de verdad.
  // Como su vida se queda en <=0 durante toda la animacion, el motor vuelve a llamar a esta
  // funcion en cada uno de esos frames (misma condicion, sigue "muriendo" recien ahora) -- por
  // eso el primer chequeo (e.dying) hace que las veces de mas no reinicien nada, solo mantengan
  // viva la entidad un frame mas.
  function civilOnDeath(e){
    if(e.dying){ e.dead = false; return; }

    e.dying = true;
    e.dead = false;
    if(e.chatPartner){ e.chatPartner.chatPartner = null; e.chatPartner = null; }
    e.carried = false;
    e.state = 'dead';
    e.deadTimer = 0;
    e.deadSide = Math.random() < 0.5 ? -1 : 1; // hacia que lado se tumba
    e.vx = e.deadSide * (30 + Math.random()*25);
    e.vy = 0;

    pushDeathMessage('Un civil ha muerto');
  }

  function updateDead(e, dt){
    e.deadTimer += dt;
    if(e.deadTimer >= DEAD_TOTAL_DURATION){
      e.dead = true; // reciEN aca lo dejamos morir de verdad: el motor lo borra al empezar el proximo frame
      return;
    }
    // pequeño deslizamiento hacia el lado en el que se tumba, que se va frenando solo
    e.x += e.vx*dt;
    e.vx *= 0.9;
  }

  // ---------- contador de muertes, esquina superior izquierda ----------
  // numerito chiquito en rojo oscuro, debajo de la barra de vida del jugador (que vive en
  // HP_BAR_X/Y/H, en spiderswing.html -- pero esas const son de OTRO <script>, no llegan hasta
  // aca, asi que directamente repetimos las mismas coordenadas a mano). Se alimenta de
  // window.deathCount, que subimos arriba en pushDeathMessage cada vez que el texto dice
  // "ha muerto" -- asaltante.js hace lo mismo en su propio pushAssailantMessage, asi que este
  // contador suma civiles Y asaltantes (normales y armados) por igual, sin duplicar logica de
  // deteccion de muerte en ningun otro lugar del motor.
  window.HUD_DRAW_LISTENERS = window.HUD_DRAW_LISTENERS || [];
  window.HUD_DRAW_LISTENERS.push(function(ctx){
    const count = window.deathCount || 0;
    ctx.save();
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#5c0f0f'; // rojo oscuro, chiquito, discreto
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Muertes: ' + count, 16, 40);
    ctx.restore();
  });

  // ---------- pantalla de alertas de muerte, esquina inferior izquierda ----------
  // capa de HTML aparte (no en el canvas): mas simple para el efecto de "apilarse y subir" de
  // toda la vida en juegos con kill-feed. column-reverse hace que el mensaje mas nuevo entre
  // siempre pegado abajo y los anteriores se vean empujados hacia arriba, sin tener que mover
  // a mano ninguno de los que ya estaban.
  let deathMsgLayer = null;
  function ensureDeathMsgLayer(){
    if(deathMsgLayer) return deathMsgLayer;
    deathMsgLayer = document.createElement('div');
    deathMsgLayer.style.cssText = [
      'position:fixed', 'left:14px', 'bottom:14px',
      'display:flex', 'flex-direction:column-reverse', 'gap:4px',
      'pointer-events:none', 'z-index:9999', 'font-family:monospace'
    ].join(';');
    document.body.appendChild(deathMsgLayer);
    return deathMsgLayer;
  }

  function pushDeathMessage(text){
    if(text.indexOf('ha muerto') !== -1) window.deathCount = (window.deathCount || 0) + 1;
    const layer = ensureDeathMsgLayer();
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = [
      'background:rgba(0,0,0,0.55)', 'color:#f2f2ec', 'font-size:14px',
      'padding:5px 10px', 'border-radius:6px', 'border-left:3px solid #c92c2c',
      'box-shadow:0 2px 6px rgba(0,0,0,0.35)',
      'opacity:0', 'transform:translateY(6px)',
      'transition:opacity .25s ease, transform .25s ease'
    ].join(';');
    layer.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });

    // que no se acumulen infinitos: si hay mas de los que caben en pantalla, el mas viejo (el
    // de mas arriba del todo) se saca sin ceremonia
    while(layer.children.length > DEATH_MSG_MAX) layer.removeChild(layer.firstChild);

    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(-6px)';
      setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 300);
    }, DEATH_MSG_LIFETIME*1000);
  }

  // ---------- abrazo (cargado por el jugador) ----------
  function updateHugging(e, dt){
    // la POSICION mientras abraza se recalcula en drawCivil, no aca: onUpdate de las entidades
    // corre ANTES de mover al jugador este mismo frame (ver updateEntities en el motor), asi que
    // si lo hicieramos aca el civil siempre quedaria un frame atras, notandose sobre todo en
    // pleno swing rapido. En el dibujo (que corre DESPUES de mover al jugador) ya no hay atraso.

    // se suelta manteniendo boton medio 3 segundos SEGUIDOS, parado (grounded) y sin tocar
    // nada mas — cualquier otra tecla o click reinicia el conteo
    const touchingSomethingElse = keys.a || keys.d || keys.w || keys.s || pressed.left || pressed.right;
    if(player.grounded && keys.midMouse && !touchingSomethingElse){
      e.dropHoldTimer += dt;
    } else {
      e.dropHoldTimer = 0;
    }

    if(e.dropHoldTimer >= DROP_HOLD_TIME) dropCivil(e, {voluntary: true});
  }

  function dropCivil(e, opts = {}){
    // reubicarlo ANTES que nada, con la posicion definitiva del jugador de este mismo frame (no
    // la que quedo pintada la vez pasada en drawCivil, que va un frame atrasada -- ver nota en
    // updateHugging). Sin esto, un civil en un slot "de atras" (2/3, con mas y) podia arrancar la
    // caida ya hundido por debajo de la superficie del techo donde estabas parado: la colision de
    // physicsStep solo atrapa aterrizajes que vienen CAYENDO DESDE ARRIBA (con un margen de apenas
    // 2px), asi que si ya nacia mas abajo que eso, se colaba de largo y se iba directo al vacio.
    const slot = HUG_SLOTS[e.hugSlot] || HUG_SLOTS[0];
    const cosT = Math.cos(player.rotation || 0), sinT = Math.sin(player.rotation || 0);
    const localX = slot.side * slot.dist, localY = slot.y;
    e.x = player.x + localX*cosT - localY*sinT;
    e.y = player.y + localX*sinT + localY*cosT;
    // y, pase lo que pase con el slot, nunca arrancar mas abajo que los propios pies del jugador:
    // si el jugador esta parado en algo, ahi mismo hay superficie tambien para el civil
    e.y = Math.min(e.y, player.y);

    e.dropHoldTimer = 0;
    e.vy = 0;
    e.vx = (player.vx || 0) * 0.3; // un poco del impulso del jugador, se siente mas natural que soltarlo en seco
    e.grounded = false;
    // si van varios juntos, que no caigan los 4 exactamente en la misma coordenada: un empujoncito
    // chiquito en X segun el slot que tenian (quedan bien juntitos, pero no superpuestos)
    const slotIndex = e.hugSlot || 0;
    e.x += (slotIndex - (HUG_SLOTS.length-1)/2) * DROP_SPREAD_X;
    e.carried = false;
    e.rotation = 0; // mismo motivo que en ejectFromRoll: no dejarlo pegado al angulo que tenia abrazado
    // cae con fisica propia (physicsStep) y updateFalling decide, al tocar algo, si aterrizo en
    // la calle (sigue su vida normal) o en un techo/balcon (se queda quietecito y asustado ahi)
    e.state = 'falling';

    // opts.voluntary=true es SOLO el toque manual de arriba (boton medio 3s quieto): la unica
    // forma en la que soltar a alguien es una decision real del jugador. Cualquier otro llamado
    // -- sin opts, como hace crazylimemonster.js al soltarlo de un golpe -- se toma como forzado,
    // y avisamos por si a alguien le interesa reaccionar a eso en particular (ver jaryman.js)
    if(!opts.voluntary){
      window.dispatchEvent(new CustomEvent('civil-involuntary-drop', {detail: {entity: e}}));
    }
  }
  // expuesta para que otras entidades puedan soltar a alguien cargado sin duplicar esta logica
  // (ver entities/crazylimemonster.js, onMissileImpact en la fase MISSILE: sin esto, window.dropCivil
  // era undefined y llamarla tiraba un TypeError sin capturar dentro del loop principal -- eso
  // era lo que congelaba el juego entero cada vez que el boss golpeaba al jugador con JM cargada)
  window.dropCivil = dropCivil;

  // ---------- dibujo: monigote igual de alto que el prota, piel/camisa/pantalon por separado ----------
  function drawCivil(ctx, e){
    if(e.state === 'dead'){ drawDeadCivil(ctx, e); return; }
    if(e.state === 'lyingDown'){ drawLyingCivil(ctx, e); return; }

    // el abrazo se reposiciona ACA, con la posicion ya definitiva del jugador para este frame
    // (ver nota en updateHugging): asi no se nota ni un frame de atraso
    if(e.state === 'hugging'){
      const slot = HUG_SLOTS[e.hugSlot] || HUG_SLOTS[0];
      const cosT = Math.cos(player.rotation), sinT = Math.sin(player.rotation);
      const localX = slot.side * slot.dist, localY = slot.y;
      e.x = player.x + localX*cosT - localY*sinT;
      e.y = player.y + localX*sinT + localY*cosT;
      e.rotation = player.rotation;
      e.hugSide = slot.side; // lo usan las piernas/brazos de mas abajo para saber hacia donde abrazar
      e.hugDist = slot.dist;
    }

    const walking = e.state === 'walking' && e.grounded && Math.abs(e.vx) > 15;

    ctx.save();
    let tx = e.x, ty = e.y;
    if(e.state === 'strandedOnRoof'){
      // temblorcito nervioso, bien sutil
      tx += Math.sin(e.trembleCycle*1.7)*1.2;
      ty += Math.cos(e.trembleCycle*2.3)*0.6;
    }
    ctx.translate(tx, ty);
    ctx.rotate(e.rotation || 0);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    const hip = {x:0, y:4};
    let leftFoot, rightFoot;
    if(walking){
      const amp = 8;
      leftFoot  = {x: Math.sin(e.walkCycle)*amp,        y:14};
      rightFoot = {x: Math.sin(e.walkCycle+Math.PI)*amp, y:14};
    } else if(e.state === 'hugging'){
      // piernas envolviendo al jugador, apuntando hacia su centro (como un abrazo tipo koala):
      // la pierna del lado de "adentro" llega justo hasta el centro del jugador, sea cual sea
      // el lado/slot en el que haya quedado enganchado este civil en particular
      const d = e.hugDist || 5;
      leftFoot  = {x: e.hugSide*d,  y: 7};
      rightFoot = {x:-e.hugSide*d,  y: 7};
    } else if(e.state === 'strandedOnRoof'){
      // encogido, piernas juntas, postura de "quietecito del miedo"
      leftFoot  = {x:-3, y:12};
      rightFoot = {x: 3, y:12};
    } else if(e.state === 'wrapped'){
      // envuelto: piernas rectas y bien juntas, tiesas -- ni caminando ni encogidas del susto
      leftFoot  = {x:-2, y:14};
      rightFoot = {x: 2, y:14};
    } else if(!e.grounded){
      // saltando del susto o cayendo: piernas encogidas
      leftFoot  = {x:-5, y:10};
      rightFoot = {x: 5, y:10};
    } else {
      leftFoot  = {x:-4, y:14};
      rightFoot = {x: 4, y:14};
    }

    // piernas: color pantalon
    ctx.strokeStyle = e.pantsColor;
    ctx.beginPath(); ctx.moveTo(hip.x,hip.y); ctx.lineTo(leftFoot.x,leftFoot.y);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hip.x,hip.y); ctx.lineTo(rightFoot.x,rightFoot.y); ctx.stroke();

    // torso + brazos: color camisa
    ctx.strokeStyle = e.shirtColor;
    ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(0,4); ctx.stroke();

    const leftShoulder  = {x:-2, y:-6};
    const rightShoulder = {x: 2, y:-6};
    if(e.state === 'hugging'){
      // brazos envolviendo el torso del jugador: el que "cruza" hacia el centro tiene que
      // apuntar hacia donde de verdad esta el jugador (-hugSide), no siempre al mismo lado fijo
      const armX = -e.hugSide*6;
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y);  ctx.lineTo(armX,-2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(-armX,-2); ctx.stroke();
    } else if(e.state === 'strandedOnRoof'){
      // brazos cruzados, abrazandose a si mismo del susto
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y);  ctx.lineTo(4,-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(-4,-3); ctx.stroke();
    } else if(e.state === 'chatting'){
      // manos que se mueven como quien conversa, cada uno con su propio ritmo
      const g = Math.sin(e.gestureCycle)*7;
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y);  ctx.lineTo(-8, -9+g*0.4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(8+g, -3); ctx.stroke();
    } else if(e.state === 'wrapped'){
      // envuelto: brazos pegados y rectos contra el torso, tiesos -- la telaraña no deja mover nada
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y);  ctx.lineTo(-3, 1); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(3, 1); ctx.stroke();
    } else if(walking){
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y); ctx.lineTo(Math.sin(e.walkCycle+Math.PI)*6, -2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(Math.sin(e.walkCycle)*6, -2);        ctx.stroke();
    } else if(!e.grounded){
      // brazos arriba, tipico gesto de susto
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y);  ctx.lineTo(-7,-13); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(7,-13);  ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(leftShoulder.x,leftShoulder.y); ctx.lineTo(-5,3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rightShoulder.x,rightShoulder.y); ctx.lineTo(5,3);  ctx.stroke();
    }

    // envuelto: ovalo de telaraña gris claro sobre el cuerpo (torso+piernas), dibujado ANTES de
    // la cabeza para que la cara siga viendose por encima del envoltorio
    if(e.state === 'wrapped'){
      ctx.fillStyle = 'rgba(214,214,214,0.88)';
      ctx.strokeStyle = 'rgba(160,160,160,0.9)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -1, 7.5, 12, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
    }

    // cabeza: color piel (un toque mas chica que antes, se veian muy cabezones)
    ctx.fillStyle = e.skinColor;
    ctx.beginPath();
    ctx.arc(0, -10, 5, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- dibujo de "tirado en el piso" tras salir disparado por una rodada (ver
  // ejectFromRoll/enterLyingDown): a diferencia del muerto, con sus colores normales, boca
  // arriba mirando al cielo, sin desvanecerse -- se queda asi hasta que se levanta solo ----------
  function drawLyingCivil(ctx, e){
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate((e.facing || 1) * (Math.PI/2));
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    const hip = {x:0, y:4};
    const leftFoot  = {x:-6, y:13};
    const rightFoot = {x: 6, y:13};
    ctx.strokeStyle = e.pantsColor;
    ctx.beginPath(); ctx.moveTo(hip.x,hip.y); ctx.lineTo(leftFoot.x,leftFoot.y);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hip.x,hip.y); ctx.lineTo(rightFoot.x,rightFoot.y); ctx.stroke();

    ctx.strokeStyle = e.shirtColor;
    ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(0,4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2,-6); ctx.lineTo(-7,-2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2,-6);  ctx.lineTo(7,-2);  ctx.stroke();

    ctx.fillStyle = e.skinColor;
    ctx.beginPath();
    ctx.arc(0, -10, 5, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- dibujo del muerto: todo en rojo, tumbandose de costado, desvaneciendose ----------
  function drawDeadCivil(ctx, e){
    const tipT  = Math.min(1, e.deadTimer / DEAD_TIP_DURATION);
    const fadeT = Math.max(0, Math.min(1, (e.deadTimer - DEAD_TIP_DURATION) / DEAD_FADE_DURATION));
    const alpha = 1 - fadeT;
    if(alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.x, e.y);
    ctx.rotate((e.deadSide||1) * (Math.PI/2) * tipT); // se va tumbando de costado, no de golpe
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    const RED_LEGS = '#7a1010', RED_BODY = '#a51c1c', RED_HEAD = '#c92c2c';

    const hip = {x:0, y:4};
    const leftFoot  = {x:-6, y:13};
    const rightFoot = {x: 6, y:13};
    ctx.strokeStyle = RED_LEGS;
    ctx.beginPath(); ctx.moveTo(hip.x,hip.y); ctx.lineTo(leftFoot.x,leftFoot.y);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hip.x,hip.y); ctx.lineTo(rightFoot.x,rightFoot.y); ctx.stroke();

    ctx.strokeStyle = RED_BODY;
    ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(0,4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2,-6); ctx.lineTo(-7,-2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2,-6);  ctx.lineTo(7,-2);  ctx.stroke();

    ctx.fillStyle = RED_HEAD;
    ctx.beginPath();
    ctx.arc(0, -10, 5, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  // ---------- spawn por chunk (bastantes por chunk, desaparecen al dejarlos atras) ----------
  const chunkCivils = new Map(); // indice de chunk -> lista de entidades spawneadas ahi

  window.CHUNK_LOAD_LISTENERS.push(function(chunkIndex, startX, endX, rng){
    const count = 10 + Math.floor(rng()*11); // 10..20 inclusive: que se vea una ciudad viva
    const list = [];
    for(let i = 0; i < count; i++){
      const x = startX + 60 + rng()*(endX - startX - 120);
      const e = spawnEntity('civil', x, STREET_Y - CIVIL_HIT_RADIUS, {
        skinColor:  pick(rng, SKIN_COLORS),
        shirtColor: pick(rng, SHIRT_COLORS),
        pantsColor: pick(rng, PANTS_COLORS)
      });
      if(e) list.push(e);
    }
    chunkCivils.set(chunkIndex, list);
  });

  window.CHUNK_UNLOAD_LISTENERS.push(function(chunkIndex){
    const list = chunkCivils.get(chunkIndex);
    if(!list) return;
    for(const e of list){
      // si el jugador se lo llevo cargado (o lo esta jalando/remolcando en este mismo instante),
      // no lo borramos aunque su chunk de origen haya quedado atras: sigue vivo pegado al jugador.
      // uno quietecito arriba de un techo (strandedOnRoof) SI se borra normalmente: es la forma
      // en la que "se resuelve" si te vas del chunk sin volver a bajarlo. Uno 'wrapped' (pegado a
      // una fachada o tirado tieso en el piso, ver mas arriba) tampoco se borra: es un efecto
      // temporal en curso, no un estado de reposo -- se resuelve solo cuando se derrita la telaraña
      if(!e.carried && !e.beingReeled && e.state !== 'towed' && e.state !== 'wrapped') e.dead = true;
    }
    chunkCivils.delete(chunkIndex);
  });

})();
