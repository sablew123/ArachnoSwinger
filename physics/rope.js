// physics/rope.js — fisica de resorte de la telaraña como soga real cuando esta enganchada a
// algo que "tira de vuelta" (carros, entidades): tension proporcional al estiramiento (F=m*a
// de cada lado segun su propia masa en la pulseada, ver physics/constants.js). El resorte de
// la soga contra el jugador MISMO (edificios, swing) vive en physics/swing.js y
// physics/movement.js (agarre de pared / piso), no aca.

// ---------- TELARAÑAS ENGANCHADAS A CARROS: pelea de fuerzas ----------
// nada de resolver "quien gana" a mano: es la MISMA formula de resorte que ya usa cualquier
// telaraña tensa en el juego (ver ROPE_SPRING_STIFFNESS/DAMPING en updateSwingMulti), aplicada
// a los DOS extremos de la soga por igual (una tension tira para los dos lados por igual, como
// cualquier cuerda real), solo que cada lado la siente distinto segun su propia masa (F = m*a).
// De ahi sale todo lo demas solo: si caminas en contra de un carro, la soga se tensa y tira de
// los dos; como el carro pesa mas que un jugador caminando, es al jugador al que mas se nota
// el freno. Corriendo, el jugador pesa mas en la pulseada que el carro, asi que le puede ganar
// y frenarlo o arrastrarlo. Y si enganchas DOS carros yendo en direcciones opuestas, cada soga
// hace exactamente esta misma cuenta por su lado, sin que haya ningun caso especial para eso:
// a medida que las dos se van tensando, las dos van perdiendo velocidad, y listo
const CAR_PULL_MASS          = 2.2; // "masa" de un carro en la pulseada
const PLAYER_PULL_MASS_WALK  = 1;   // caminando, el jugador pesa MENOS que un carro
const PLAYER_PULL_MASS_RUN   = 3.5; // corriendo, pesa MAS que un carro
const CARRIABLE_TOW_PLAYER_MASS = 12; // remolcando algo "abrazable" (liviano, ej. civiles) con la telaraña: el jugador casi ni siente el tironeo (ver applyEntityRopePull)

function applyCarRopePull(w, dt){
  const car = w.car;
  const dx = player.x - w.anchorX, dy = player.y - w.anchorY;
  const dist = Math.hypot(dx,dy) || 0.0001;
  const stretch = dist - w.ropeLength;
  if(stretch <= 0) return; // floja: no tensa, no tira de nada (una soga no empuja)

  const ux = dx/dist, uy = dy/dist;
  const radialSpeed = (player.vx - car.vx)*ux + player.vy*uy; // >0 = se estan separando
  // la misma fuerza de resorte de siempre: cuanto mas se estira, mas tira; el amortiguador
  // evita que oscile como un resorte de juguete
  const tension = ROPE_SPRING_STIFFNESS*stretch + ROPE_SPRING_DAMPING*radialSpeed;
  if(tension <= 0) return;

  const playerMass = player.running ? PLAYER_PULL_MASS_RUN : PLAYER_PULL_MASS_WALK;

  // F = m*a: la MISMA tension, pero cada extremo la convierte en aceleracion segun su propia masa
  const playerAccel = tension/playerMass;
  player.vx -= ux*playerAccel*dt;
  player.vy -= uy*playerAccel*dt;

  const carAccel = tension/CAR_PULL_MASS;
  car.vx += ux*carAccel*dt; // el carro solo se mueve en X
}

function updateCarRopePulls(dt){
  for(const hand of ['left','right']){
    const w = webs[hand];
    if(w && w.state === 'attached' && w.car) applyCarRopePull(w, dt);
  }
}

// misma idea que applyCarRopePull (misma formula de resorte, F=m*a de cada lado segun su propia
// "masa" en la pulseada), pero para una entidad enganchada: a diferencia de un carro (que solo
// se mueve en X), una entidad se puede tirar/arrastrar libremente en X e Y, como corresponde a
// algo que no esta atado a una calle
function applyEntityRopePull(w, dt){
  const entity = w.entity;
  if(entity.dead) return;
  // mientras dura la voltereta hacia el techo (updateVault), un civil colgando de la telaraña
  // ya se mueve a mano en lockstep con el jugador (ver ahi el porque) -- si ADEMAS dejamos que
  // el resorte de aca tire este mismo cuadro, se pisan entre si
  if(player.vaulting && entity.def.carryWeight) return;
  const dx = player.x - w.anchorX, dy = player.y - w.anchorY;
  const dist = Math.hypot(dx,dy) || 0.0001;
  const stretch = dist - w.ropeLength;
  if(stretch <= 0) return;

  const ux = dx/dist, uy = dy/dist;
  const radialSpeed = (player.vx - entity.vx)*ux + (player.vy - entity.vy)*uy;
  const tension = ROPE_SPRING_STIFFNESS*stretch + ROPE_SPRING_DAMPING*radialSpeed;
  if(tension <= 0) return;

  // si es de las livianitas que tambien se pueden abrazar (def.carryWeight, ej. civiles),
  // remolcarla con la telaraña NO tiene por que sentirse como forcejear con un auto: casi toda
  // la tension la absorbe ELLA (masa chica, se deja arrastrar facil) y el jugador casi ni la
  // nota tironeando de vuelta. El "peso" real de llevarla puesta (correr/saltar/trepar mas lento)
  // ya lo pone carrySpeedFactor/getPlayerCarryMass -- el mismo sistema que usa el abrazo -- asi
  // que aca no hace falta que ADEMAS el tiron en si sea brutal: con uno solo alcanza y sobra.
  const carriable = !!entity.def.carryWeight;
  const playerMass = carriable ? CARRIABLE_TOW_PLAYER_MASS
                                : (player.running ? PLAYER_PULL_MASS_RUN : PLAYER_PULL_MASS_WALK);

  const playerAccel = tension/playerMass;
  player.vx -= ux*playerAccel*dt;
  player.vy -= uy*playerAccel*dt;

  const entityMass = entity.def.pullMass || 1.5;
  const entityAccel = tension/entityMass;
  entity.vx += ux*entityAccel*dt;
  entity.vy += uy*entityAccel*dt;
}

// jalon real (boton medio con la telaraña de una entidad "abrazable" ya tensada): a diferencia
// del jalon contra un edificio/carro (que impulsa AL JUGADOR hacia el anclaje, ver mas abajo en
// performWebPull), aca es la ENTIDAD la que recibe el impulso -- frena en seco lo que traiga (no
// se le suma el empujon a su inercia vieja: se cancela y arranca de cero en la nueva direccion,
// asi cada tiron pega parejo, no cada vez mas fuerte) y sale disparada en linea recta hacia donde
// este el jugador EN ESE INSTANTE (no lo persigue: es un tiro puntual, no un homing). De ahi en
// mas la maneja su fisica normal (gravedad + colisiones, ver physicsStep en civiles.js): puede
// no alcanzar a llegar, pasarse de largo, lo que sea, como cualquier objeto real que jalas de una
// soga. La telaraña sigue enganchada despues del tiron (no se corta sola): si no llega lo
// bastante cerca como para que el abrazo se complete solo (ver el estado 'towed' en civiles.js),
// se le puede volver a tirar cuantas veces haga falta.
const ENTITY_PULL_IMPULSE_SPEED = 780;
function applyEntityPullImpulse(entity){
  const dx = player.x - entity.x, dy = player.y - entity.y;
  const dist = Math.hypot(dx,dy) || 1;
  const ux = dx/dist, uy = dy/dist;
  entity.vx = ux * ENTITY_PULL_IMPULSE_SPEED;
  entity.vy = uy * ENTITY_PULL_IMPULSE_SPEED;
}

function updateEntityRopePulls(dt){
  for(const hand of ['left','right']){
    const w = webs[hand];
    if(w && w.state === 'attached' && w.entity) applyEntityRopePull(w, dt);
  }
}
