// physics/swing.js — balanceo (swing) con una o dos telarañas enganchadas a algo rigido
// (edificio, carro, entidad no cargable): gravedad + resorte de la soga hacia el/los anclajes,
// con bombeo de WASD opcional. Usa carryMassEffective() (ver physics/movement.js) para que
// llevar pasajeros encima haga el pendulo mas pesado, sin que la gravedad cambie con la masa.

// fisica de una o dos telarañas actuando como sogas de verdad:
// solo tiran (tension) cuando estan mas estiradas que su largo natural; si el jugador
// se acerca al ancla, la soga queda floja y no aplica ninguna fuerza (no es una vara rigida).
// con dos ancladas a la vez, cada una tira de forma independiente y se van igualando solas
// por el amortiguamiento, como al balancearse agarrado con las dos manos.
// (si allowInput es false -modo chill- solo actua la fisica de la soga, sin bombeo de WASD:
// te quedas quieto y chill, colgado de las dos manos)
function updateSwingMulti(dt, allowInput){
  player.vy += GRAVITY*dt; // la gravedad no depende de la masa: cargar gente no te hace caer mas lento

  const carryMass = carryMassEffective(); // 1 si no llevas a nadie encima; ver carryMassEffective para la curva de peso real -> masa jugable

  if(allowInput){
    // bombear el pendulo con WASD tambien cuesta mas con pasajeros encima
    if(keys.a) player.vx -= (AIR_CONTROL_ACCEL/carryMass)*dt;
    if(keys.d) player.vx += (AIR_CONTROL_ACCEL/carryMass)*dt;
    if(keys.w) player.vy -= (AIR_CONTROL_ACCEL/carryMass)*dt;
    if(keys.s) player.vy += (AIR_CONTROL_ACCEL/carryMass)*dt;
  }

  // solo las telarañas "rigidas" (edificio, carro, o entidad no cargable) tensan/limitan al
  // jugador durante el swing -- una colgada de un civil no debe sentirse como colgar de un
  // edificio (ver rigidAttachedWebsList); a ese lo arrastra su propio resorte, aparte
  const attached = rigidAttachedWebsList();

  let nx = player.x + player.vx*dt;
  let ny = player.y + player.vy*dt;

  for(const w of attached){
    const dx = nx - w.anchorX, dy = ny - w.anchorY;
    const dist = Math.hypot(dx,dy) || 0.0001;
    const stretch = dist - w.ropeLength;
    if(stretch > 0){ // solo tensa si esta mas estirada que su largo natural (si no, va floja)
      const ux = dx/dist, uy = dy/dist;
      const radialSpeed = player.vx*ux + player.vy*uy;
      // F=m*a: la MISMA tension de siempre, pero con mas masa encima acelera menos (pendulo
      // mas pesadote: mas lento para cambiar de rumbo arriba de la soga)
      const springAccel = (-ROPE_SPRING_STIFFNESS*stretch - ROPE_SPRING_DAMPING*radialSpeed) / carryMass;
      player.vx += ux*springAccel*dt;
      player.vy += uy*springAccel*dt;
    }
  }

  nx = player.x + player.vx*dt;
  ny = player.y + player.vy*dt;

  // tope duro de seguridad (un par de iteraciones para que las dos sogas, si ambas estan tensas,
  // se resuelvan de forma estable entre si)
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

  player.vx = (nx - player.x) / dt;
  player.vy = (ny - player.y) / dt;

  player.x = nx;
  player.y = ny;
}
