// physics/movement.js — motor de movimiento del jugador: piso (correr/caminar/saltar/rodar),
// aire libre (sin telaraña), agarre de pared, resolucion de colisiones contra el mundo, tope
// de velocidad terminal, impacto de caidas fuertes (daño o rodada), y el sistema de "masa
// cargable" (cuanto pesa llevar entidades encima/colgando y como afecta velocidad/salto/trepada).

function updateGroundMovement(dt, allowInput){
  const weightFactor = carrySpeedFactor(); // civiles cargados pesan: menos tope de velocidad, menos aceleracion, menos salto
  const cap = (player.running ? MAX_RUN_SPEED : MAX_GROUND_SPEED) * weightFactor;
  const accel = (player.running ? RUN_ACCEL : GROUND_ACCEL) * weightFactor;

  // mientras dura la rodada (ver applyFallImpact) A/D no responden: rodas de largo con el
  // impulso que traias, sin poder redirigirte, hasta que se acaba sola o hasta que saltas
  // (ver spaceJustPressed mas abajo, que corta la rodada al toque)
  const steeringAllowed = allowInput && !player.rolling;

  // acelerar: si ya vas mas rapido que el tope actual en esa direccion (por ejemplo aterrizaste
  // corriendo desde el aire), no seguis acelerando mas alla, pero tampoco te frena de golpe
  // (si allowInput es false -no hay control- ni A ni D hacen nada, solo actua la friccion)
  if(steeringAllowed && keys.a && player.vx > -cap) player.vx -= accel*dt;
  if(steeringAllowed && keys.d && player.vx <  cap) player.vx += accel*dt;
  if(!(steeringAllowed && keys.a) && !(steeringAllowed && keys.d)){
    const sign = Math.sign(player.vx);
    player.vx -= sign * GROUND_FRICTION*dt;
    if(Math.sign(player.vx) !== sign) player.vx = 0;
  }

  // si la velocidad quedo por encima del tope actual (aterrizaste ya corriendo mas rapido que el
  // tope de correr, por ejemplo), no se pierde de golpe: se va frenando gradualmente mientras
  // segis corriendo, hasta llegar al tope
  if(player.vx > cap) player.vx = Math.max(cap, player.vx - RUN_OVERSPEED_DECAY*dt);
  else if(player.vx < -cap) player.vx = Math.min(-cap, player.vx + RUN_OVERSPEED_DECAY*dt);

  // si se frena casi del todo, deja de correr (el proximo arranque vuelve a ser caminando)
  if(player.running && Math.abs(player.vx) < 20) player.running = false;

  if(allowInput && spaceJustPressed){
    // saltar no se resiente tan brutal como correr o trepar: las piernas pueden dar un empujon
    // del piso incluso cargando peso encima (aunque despues, ya en el aire, cueste mas correr o
    // cambiar de rumbo con eso encima) -- por eso el salto usa una version mas suave del mismo
    // factor de peso (raiz cuadrada: se nota, pero no aplasta) en vez del weightFactor completo
    const jumpFactor = Math.sqrt(weightFactor);
    player.vy = JUMP_VELOCITY * jumpFactor;
    player.grounded = false;
    player.standingOnCar = null;
    // saltar en pleno rodada te saca de ese estado al toque, en vez de esperar a que se acabe sola
    player.rolling = false; player.rollTimer = 0;
  }

  // cuenta regresiva de la rodada: al agotarse, ya quedas de pie corriendo con normalidad
  if(player.rolling){
    player.rollTimer -= dt;
    if(player.rollTimer <= 0){ player.rolling = false; player.rollTimer = 0; }
  }

  let nx = player.x + player.vx*dt;
  let ny = player.y + player.vy*dt;

  // si hay telaraña(s) enganchada(s), tambien se ponen tensas caminando: no te dejan alejarte
  // mas alla de su largo, igual que en el aire (mismo tope duro que usa el balanceo). Las
  // enganchadas a alguien liviano/cargable (civiles) NO cuentan aca (ver rigidAttachedWebsList):
  // a esos los arrastra el resorte de su propia telaraña, no el jugador quedando atado corto
  const attached = rigidAttachedWebsList();
  if(attached.length > 0){
    for(let iter=0; iter<2; iter++){
      for(const w of attached){
        const dx = nx - w.anchorX, dy = ny - w.anchorY;
        const dist = Math.hypot(dx,dy) || 0.0001;
        const maxLen = w.ropeLength * (1 + ROPE_STRETCH_RATIO);
        if(dist > maxLen){
          const scale = maxLen/dist;
          nx = w.anchorX + dx*scale;
          ny = w.anchorY + dy*scale;
        }
      }
    }
    player.vx = (nx - player.x)/dt;
    player.vy = (ny - player.y)/dt;
  }

  player.x = nx;
  player.y = ny;
}

// fisica del agarre: primero un resbalon (friccion fuerte pero no instantanea) usando el impulso
// que traias al agarrarte, y una vez que se frena del todo, control directo con WASD en toda la
// fachada, limitado a los bordes del edificio (arriba: techo, abajo: calle, lados: bordes
// laterales, que quedan un poco afuera del edificio en vez de al ras)
function updateWallCling(dt, allowInput){
  const c = player.clinging;

  if(c.slipping){
    const speed = Math.hypot(player.vx, player.vy);
    if(speed > 0){
      const decel = Math.min(speed, WALL_GRAB_FRICTION*dt);
      const scale = (speed - decel)/speed;
      player.vx *= scale; player.vy *= scale;
    }
    player.x += player.vx*dt;
    player.y += player.vy*dt;
    if(Math.hypot(player.vx, player.vy) < WALL_GRAB_STOP_SPEED){
      player.vx = 0; player.vy = 0;
      c.slipping = false;
    }
  } else if(allowInput){
    const input = getInputVector();
    const climbSpeed = WALL_CLIMB_SPEED * carrySpeedFactor(); // cargar civiles tambien pesa trepando, y bastante notorio
    player.vx = input.x*climbSpeed;
    player.vy = input.y*climbSpeed;
    player.x += player.vx*dt;
    player.y += player.vy*dt;
  }

  if(player.x < c.minX){ player.x = c.minX; player.vx = 0; }
  if(player.x > c.maxX){ player.x = c.maxX; player.vx = 0; }
  if(player.y < c.minY){ player.y = c.minY; player.vy = 0; }
  if(player.y > c.maxY){ player.y = c.maxY; player.vy = 0; }

  // si ademas tenes alguna telaraña enganchada, escalar tampoco puede alejarte mas de lo que
  // esa soga da de si (antes, al trepar, se ignoraba el largo maximo de la telaraña por completo).
  // igual que en el piso, una telaraña con un civil colgando no cuenta aca (rigidAttachedWebsList)
  const clingAttached = rigidAttachedWebsList();
  if(clingAttached.length){
    for(let iter=0; iter<2; iter++){
      for(const w of clingAttached){
        const dx = player.x - w.anchorX, dy = player.y - w.anchorY;
        const dist = Math.hypot(dx,dy) || 0.0001;
        const maxLen = w.ropeLength * (1 + ROPE_STRETCH_RATIO);
        if(dist > maxLen){
          const scale = maxLen/dist;
          player.x = w.anchorX + dx*scale;
          player.y = w.anchorY + dy*scale;
        }
      }
    }
  }

  // "en el borde" se define por la fachada al ras (faceMinX/faceMaxX), no por el limite total:
  // asi que apenas te salis de la zona pegada a la pared ya se te ve agarrado de la esquina
  c.edgeSide = player.x <= c.faceMinX ? 'left' : (player.x >= c.faceMaxX ? 'right' : null);
  c.atEdge = c.edgeSide !== null;
  // llego a lo mas alto escalando (a la altura del techo): desde ahi puede saltar-voltereta al techo
  c.atTop = player.y <= c.minY + 0.5;

  // animacion de trepada: solo avanza si ya estas bien agarrado (no durante el resbalon) y
  // te estas moviendo de verdad
  if(!c.slipping){
    const spd = Math.hypot(player.vx, player.vy);
    if(spd > 5) player.climbCycle += spd*dt*0.045;
  }
}

// caida libre / control aereo cuando NO hay ninguna telaraña enganchada (los vectores WASD
// de control aereo SOLO se aplican aca, nunca en tierra, y solo si allowInput es true)
function updateAirFree(dt, allowInput){
  if(allowInput){
    if(keys.a) player.vx -= AIR_CONTROL_ACCEL*dt;
    if(keys.d) player.vx += AIR_CONTROL_ACCEL*dt;
    if(keys.w) player.vy -= AIR_CONTROL_ACCEL*dt;
    if(keys.s) player.vy += AIR_CONTROL_ACCEL*dt;
  }
  player.vy += GRAVITY*dt;

  player.x += player.vx*dt;
  player.y += player.vy*dt;
}

// cuanto "pesa" el jugador ahora mismo, contando lo que lleve encima: 1 de base (el jugador
// mismo), mas el peso REAL de cada cosa cargada, convertido a estas mismas unidades de masa
// (ver PLAYER_REFERENCE_WEIGHT_KG). Cada entidad puede dar su propio peso de instancia en
// e.carryWeight (ej. civiles.js: cada civil pesa lo que pesaria de verdad, en kg, dividido por
// PLAYER_REFERENCE_WEIGHT_KG) — si no lo trae, cae al default generico de su tipo (def.carryWeight),
// para que cualquier entidad futura que no se moleste en variar su peso individuo a individuo
// siga funcionando sin tocar este archivo. De ahi sale todo lo demas solo, F=m*a: con mas masa,
// la MISMA tension de la telaraña acelera menos (pendulo mas pesadote, mas lento para cambiar
// de rumbo arriba), pero la gravedad no cambia con la masa (como en la vida real), asi que en
// la bajada, donde manda mas la gravedad que la correccion de la soga, hasta puede sentirse mas
// veloz.
// cuanto de su peso real se siente mientras vas ARRASTRANDO/colgando a alguien de una telaraña
// (sin haberlo jalado hasta abrazarlo todavia): mucho menos que abrazado. Tiene sentido fisico
// -- la telaraña reparte la carga en su propio anclaje/tension en vez de que todo el peso caiga
// de una sobre el cuerpo del jugador como al cargarlo encima -- y de paso soluciona que colgar
// gente con la telaraña se sintiera como arrastrar un yunque: con el abrazo (e.carried) el peso
// sigue siendo el real, completo.
const TOWED_WEIGHT_FRACTION = 0.22;

function getPlayerCarryMass(){
  let m = 1;
  for(const e of entities){
    const w = (e.carryWeight != null) ? e.carryWeight : e.def.carryWeight;
    if(e.dead || !w) continue;
    if(e.carried){
      m += w; // abrazado, encima tuyo: pesa lo que pesa de verdad
    } else {
      // colgando de una telaraña (remolcado, sin abrazo): pesa MUCHO menos que abrazado (ver
      // TOWED_WEIGHT_FRACTION) -- el tironeo en si ya lo suaviza applyEntityRopePull, esto es
      // solo la parte "constante" del peso (correr, saltar, trepar, el pendulo del swing)
      const towed = (webs.left && webs.left.state === 'attached' && webs.left.entity === e) ||
                    (webs.right && webs.right.state === 'attached' && webs.right.entity === e);
      if(towed) m += w * TOWED_WEIGHT_FRACTION;
    }
  }
  return m;
}

// el peso real de una persona (o varias) es bastante mas alto que el numero chiquito y arbitrario
// que se usaba antes -- y si esa masa real entrara LINEAL en las formulas de abajo, el primer
// pasajero ya se sentiria pesado y el cuarto directamente arruinaria el control (justo el "se
// siente horrible" que queremos evitar). En la vida real tambien pasa lo contrario: cargar una
// mochila mas nunca duele proporcionalmente igual que la primera. Por eso el peso EXTRA (todo lo
// que no sea el propio cuerpo del jugador) pasa por esta curva antes de tocar cualquier formula:
// comprime los extremos (un civil solo pesa un poco MAS de lo que su kg diria, cuatro pesan bastante
// MENOS que la suma lineal) sin dejar de crecer con el peso real. Es el unico numero que hace
// falta retocar para recalibrar que tan pesado se siente cargar gente en todo el motor a la vez.
const WEIGHT_RESPONSE_EXPONENT = 0.7;
function carryMassEffective(){
  const raw = getPlayerCarryMass();
  const extra = raw - 1;
  if(extra <= 0) return 1;
  return 1 + Math.pow(extra, WEIGHT_RESPONSE_EXPONENT);
}

// cuanto se resiente MOVERSE por el peso extra de lo que llevas encima (ver carryMassEffective):
// antes esto solo se sentia en pleno swing (el pendulo se hace mas lento para cambiar de rumbo),
// pero cargar gente tambien deberia notarse corriendo, saltando y trepando una fachada. Cada
// unidad de masa extra (ya pasada por la curva de arriba) le resta una fraccion de velocidad.
const CARRY_SPEED_PENALTY = 0.16;
function carrySpeedFactor(){
  const extraMass = carryMassEffective() - 1;
  return 1 / (1 + extraMass*CARRY_SPEED_PENALTY);
}

// tope de velocidad general: rapido, tipo heroe, pero sin volverse ridiculo (nada de mas de
// mil kilometros por hora). Se aplica sobre la velocidad ya calculada del frame, asi que en
// caidas largas o tirones de telaraña muy fuertes se nota como el aire "frena" un poco
function clampTerminalSpeed(){
  const spd = Math.hypot(player.vx, player.vy);
  if(spd > MAX_SPEED){
    const scale = MAX_SPEED/spd;
    player.vx *= scale;
    player.vy *= scale;
  }
}

// se llama justo al aterrizar de una caida real (mismo momento que window.PLAYER_LAND_LISTENERS,
// ver update()), con impactSpeed = la velocidad vertical justo antes del impacto (px/s, positiva).
// Decide si esa caida fue lo bastante fuerte como para importar, y si veniamos ya rapido en
// horizontal (cerca del tope de correr) rodamos en vez de trabarnos de golpe:
//   - caida fuerte SIN correr casi -> golpe seco, pierde vida segun que tan rapido venia cayendo
//     (hasta FALL_DAMAGE_MAX a velocidad terminal), y si venias cargando a alguien encima, 10 de
//     vida extra (el golpe le pega a los dos)
//   - caida fuerte CORRIENDO casi al tope -> rueda un ratito (ROLL_DURATION) en vez de frenar en
//     seco: eso te salva de CASI TODO el golpe (solo duele, y poquito, pasando ROLL_DAMAGE_MIN_SPEED,
//     bien cerca de la velocidad terminal). Si venias cargando gente, salen disparados hacia el
//     mismo lado que estas rodando (ver window.PLAYER_ROLL_LISTENERS)
//   - caida floja (por debajo de FALL_DAMAGE_MIN_SPEED) -> aterrizaje normal, sin nada de esto
function applyFallImpact(impactSpeed){
  // los aterrizajes de la caida pasiva post-chill ya tienen su propio rebote+recovering (ver mas
  // abajo en update()), asi que esos quedan afuera de este calculo de daño/rodada
  if(controlState !== 'normal') return;
  if(impactSpeed < FALL_DAMAGE_MIN_SPEED) return;

  if(Math.abs(player.vx) >= ROLL_MIN_VX){
    const rollDir = player.vx < 0 ? -1 : 1;
    player.rolling = true;
    player.rollTimer = ROLL_DURATION;
    player.running = true;
    if(impactSpeed >= ROLL_DAMAGE_MIN_SPEED){
      const rt = Math.min(1, (impactSpeed - ROLL_DAMAGE_MIN_SPEED) / (MAX_SPEED - ROLL_DAMAGE_MIN_SPEED));
      damagePlayer(rt * ROLL_FALL_DAMAGE_MAX);
    }
    for(const fn of window.PLAYER_ROLL_LISTENERS) fn(rollDir, player.x, player.y);
  } else {
    const t = Math.min(1, (impactSpeed - FALL_DAMAGE_MIN_SPEED) / (MAX_SPEED - FALL_DAMAGE_MIN_SPEED));
    let dmg = t * FALL_DAMAGE_MAX;
    if(isCarryingAnything()) dmg += 10;
    damagePlayer(dmg);
  }
}

// true si hay algo (civiles, o cualquier entidad futura) abrazado/cargado encima del jugador en
// este mismo instante (ver e.carried, lo pone civiles.js al enganchar con un toque de boton
// medio). Generico a proposito -- no sabe nada de civiles en particular -- para que cualquier
// tipo de entidad futura que use el mismo sistema de carga entre gratis a este chequeo
function isCarryingAnything(){
  for(const e of entities){
    if(!e.dead && e.carried) return true;
  }
  return false;
}

function collideWorld(prevBottom){
  const half = PLAYER_SIZE/2;

  // mientras esta agarrado de una fachada, esa fisica ya maneja sus propios limites (techo,
  // calle y bordes laterales del edificio): no hace falta ni conviene que el resto de las
  // colisiones (calle, carros, techos) lo interrumpan o lo "aterricen" de golpe
  if(player.clinging){ player.onNet = null; return; }

  // manteniendo pulsado el boton de abajo (S) se desactiva la colision con carros, techos y
  // balcones (podes atravesarlos, como soltarte de un agarre o dejarte caer por un "puente" a
  // lo Mario) - pero la calle (el suelo de verdad) SIEMPRE colisiona, con o sin S
  const passThrough = keys.s;
  if(passThrough) player.onNet = null; // soltando S te dejas caer, no seguis pegado a la red

  player.grounded = false;
  player.standingOnCar = null;

  if(!passThrough){
    // 1) aterrizar ENCIMA de un carro (cayendo) - aplica aunque estes balanceandote
    if(player.vy >= 0){
      for(const car of cars){
        const withinX = player.x + half > car.x && player.x - half < car.x + car.w;
        if(withinX && prevBottom <= car.y + 2 && player.y + half >= car.y){
          player.y = car.y - half;
          player.vy = 0;
          player.grounded = true;
          player.standingOnCar = car;
          break;
        }
      }
    }

    // los carros ya NO empujan por el costado: son pura plataforma de aterrizaje (como techos y
    // balcones), asi que en X se pueden atravesar sin problema, solo colisionan en Y al caer encima

    // 3) techos y balcones: plataformas de un solo sentido (aterrizas solo si venias cayendo
    // desde arriba), tambien aplica en pleno balanceo
    if(player.vy >= 0){
      for(const plat of platforms){
        const withinX = player.x + half > plat.x && player.x - half < plat.x + plat.w;
        if(withinX && prevBottom <= plat.y + 2 && player.y + half >= plat.y){
          player.y = plat.y - half;
          player.vy = 0;
          player.grounded = true;
          break;
        }
      }
    }

    // 3.5) redes tejidas (ver weaveNet): igual de un solo sentido que techos/balcones al CAER
    // sobre ellas, solo que en vez de un segmento horizontal fijo son dos segmentos rectos
    // (anclaje-vertice-anclaje) que pueden ir inclinados. Con solo la regla de "aterrizas cayendo
    // desde arriba" no alcanza: caminando CUESTA ARRIBA por un tramo inclinado, tu propia altura
    // (congelada del frame anterior) queda por DEBAJO de la superficie nueva, no por encima, asi
    // que ese chequeo solo la fallaria a cada paso. Por eso ademas, si el frame pasado ya estabas
    // parado sobre un tramo de red (player.onNet) y seguis casi sin velocidad vertical (no es un
    // salto ni una caida real), lo mantenemos pegado a la superficie sin importar si quedo arriba
    // o abajo, mientras el x siga cayendo dentro del mismo tramo
    if(player.vy >= 0){
      let landed = false;
      netLoop:
      for(const net of webNets){
        for(let i = 0; i < net.points.length-1; i++){
          const p1 = net.points[i], p2 = net.points[i+1];
          const minX = Math.min(p1.x, p2.x), maxX = Math.max(p1.x, p2.x);
          if(Math.abs(p2.x - p1.x) < 0.0001) continue; // segmento casi vertical: no se puede parar ahi
          const withinX = player.x + half > minX && player.x - half < maxX;
          if(!withinX) continue;
          const t = Math.max(0, Math.min(1, (player.x - p1.x) / (p2.x - p1.x)));
          const landY = p1.y + (p2.y - p1.y)*t;
          const fallingOnto = prevBottom <= landY + 2 && player.y + half >= landY;
          const stillWalkingOnIt = player.onNet && player.onNet.p1 === p1 && player.onNet.p2 === p2
                                    && Math.abs(player.vy) < 5;
          if(fallingOnto || stillWalkingOnIt){
            player.y = landY - half;
            player.vy = 0;
            player.grounded = true;
            player.onNet = {p1, p2};
            landed = true;
            break netLoop;
          }
        }
      }
      if(!landed) player.onNet = null;
    } else {
      player.onNet = null;
    }
  }

  // 4) la calle (suelo firme): SIEMPRE colisiona, tengas o no telarañas enganchadas, y aunque
  // estes pulsando S. Ya no suelta las telarañas al tocarla: es una soga, sigue enganchada con
  // normalidad mientras caminas y hasta que vuelvas a saltar/balancearte
  if(player.y + half >= STREET_Y){
    player.y = STREET_Y - half;
    player.vy = 0;
    player.grounded = true;
    player.standingOnCar = null;
  }
}
