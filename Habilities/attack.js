// habilities/attack.js -- habilidad de golpe (puñetazo/patada): boton medio mantenido + click
// izq/der. Movida tal cual desde spiderswing.html. updateAttack(dt) (la animacion/hitbox cuadro
// a cuadro) sigue viviendo en el motor (spiderswing.html) porque es parte del loop principal,
// no un disparador de boton -- aca solo esta el disparo de la habilidad en si.
function startAttack(type){
  if(player.clinging || player.vaulting || controlState !== 'normal') return false;

  const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
  const mouseAngle = Math.atan2(worldY - player.y, worldX - player.x);
  const side = worldX >= player.x ? 1 : -1;
  const faceAngle = side === 1 ? 0 : Math.PI;
  const aerial = !player.grounded;

  let aimAngle, impulse, dur, activeAt, reach, radius, damage;

  if(type === 'punch'){
    const dev = Math.max(-PUNCH_CONE, Math.min(PUNCH_CONE, angleDiff(faceAngle, mouseAngle)));
    aimAngle = faceAngle + dev;
    impulse = PUNCH_IMPULSE;
    dur = PUNCH_DURATION; activeAt = PUNCH_ACTIVE_T;
    reach = PUNCH_REACH; radius = PUNCH_RADIUS; damage = PUNCH_DAMAGE;
  } else {
    dur = KICK_DURATION; activeAt = KICK_ACTIVE_T;
    reach = KICK_REACH; radius = KICK_RADIUS; damage = KICK_DAMAGE;
    if(aerial){
      aimAngle = mouseAngle; // en el aire, la patada sigue de lleno al puntero
      impulse = KICK_IMPULSE_AIR;
    } else {
      const dev = Math.max(-KICK_CONE_GROUND, Math.min(KICK_CONE_GROUND, angleDiff(faceAngle, mouseAngle)));
      aimAngle = faceAngle + dev;
      impulse = KICK_IMPULSE_GROUND;
    }
  }

  const dirX = Math.cos(aimAngle), dirY = Math.sin(aimAngle);

  player.attacking = {type, t:0, dur, activeAt, hit:false, dirX, dirY, reach, radius, damage, side};

  // el golpe empuja un poco al jugador en su propia direccion (retroceso/impulso de impacto),
  // pero nunca hacia arriba (ver applyAttackImpulse): asi no se puede usar puños/patadas para
  // ganar altura gratis
  applyAttackImpulse(dirX, dirY, impulse);

  player.running = false;
  return true;
}
