// ============================================================================
//  entities/reelredirect.js
// ----------------------------------------------------------------------------
//  NO registra ningun tipo de entidad: fabrica un def.reelBehavior (el hook
//  que agregamos a performWebPull en el motor) para "objetos peligrosos que
//  se jalan con click medio, pero en vez de quedarse pegados al jugador como
//  un civil (huggable), pasan de largo hacia un objetivo" -- la mecanica que
//  la bomba comparte entre F6 (bombardeo en el techo) y F8 (golpe final),
//  escrita una sola vez para no repetirla.
//
//  Como se ve desde afuera (la entidad que lo usa, ver entities/crazybomb.js):
//    1. El jugador la engancha con la telaraña de siempre (fireWeb), normal.
//    2. Toque de click medio -> el motor llama a reelBehavior UNA vez. Arranca
//       la primera pierna del vuelo, apuntando a donde esta el jugador EN ESE
//       INSTANTE (una sola vez, no lo persigue -- por eso hay que esquivarla
//       de verdad moviendose, no alcanza con quedarse ahi parado).
//    3. Si llega a tocar al jugador en esa primera pierna: cfg.onHitPlayer.
//    4. Si lo pasa de largo sin tocarlo: arranca la segunda pierna, apuntando
//       esta vez al objetivo real (cfg.getTarget(e), ej. el boss).
//    5. Si le pega al objetivo: cfg.onHitTarget. Si el objetivo ya no existe
//       o tambien lo pasa de largo sin tocarlo: cfg.onFizzle (no le pego a
//       nadie, se gasto sola).
//
//  updateRedirect(e, dt) hay que llamarlo desde el onUpdate PROPIO de la
//  entidad, un cuadro a la vez, y devuelve true mientras siga en pleno vuelo
//  dirigido (en ese caso la entidad NO debe aplicarle su fisica normal --
//  gravedad, arco balistico, lo que sea -- ese mismo cuadro).
// ============================================================================

function createRedirectReelBehavior(cfg){
  const speed = cfg.speed || 900;
  const extra = cfg.hitRadiusExtra || 0;

  function reelBehavior(e, hand){
    if(e.redirecting) return; // ya en vuelo por un toque anterior -- un segundo toque no hace nada nuevo
    detachIfAttached(hand);
    e.redirecting = true;
    e.redirectLeg = 'toPlayer';
    aimAt(e, player.x, player.y, speed);
  }

  function updateRedirect(e, dt){
    if(!e.redirecting) return false;

    e.x += e.vx*dt; e.y += e.vy*dt;

    if(e.redirectLeg === 'toPlayer'){
      const dx = player.x - e.x, dy = player.y - e.y;
      if(Math.hypot(dx,dy) <= (e.hitRadius||10) + PLAYER_SIZE/2 + extra){
        e.redirecting = false;
        if(cfg.onHitPlayer) cfg.onHitPlayer(e);
        return true;
      }
      if(passedWaypoint(e)){
        const tgt = cfg.getTarget ? cfg.getTarget(e) : null;
        if(!tgt || tgt.dead){
          e.redirecting = false;
          if(cfg.onFizzle) cfg.onFizzle(e);
          return true;
        }
        e.redirectLeg = 'toTarget';
        aimAt(e, tgt.x, tgt.y, speed);
      }
    } else { // 'toTarget'
      const tgt = cfg.getTarget ? cfg.getTarget(e) : null;
      if(!tgt || tgt.dead){
        e.redirecting = false;
        if(cfg.onFizzle) cfg.onFizzle(e);
        return true;
      }
      // homing DE VERDAD en esta pierna: se re-apunta cada cuadro a la posicion ACTUAL del
      // objetivo, a diferencia de la primera pierna (que apunta una sola vez a donde estaba el
      // jugador, a proposito -- ahi si hay que esquivarla moviendose). Sin esto, si el objetivo se
      // mueve despues de que arranca esta pierna (el boss cruzando de un lado al otro del techo en
      // fase 6, por ejemplo), la bomba viaja en linea recta hacia un punto que ya quedo viejo y
      // puede pasar cerca sin llegar a tocarlo de verdad -- "casi pasa de largo" en vez de explotar.
      aimAt(e, tgt.x, tgt.y, speed);
      const dx = tgt.x - e.x, dy = tgt.y - e.y;
      if(Math.hypot(dx,dy) <= (e.hitRadius||10) + (tgt.hitRadius||20) + extra){
        e.redirecting = false;
        if(cfg.onHitTarget) cfg.onHitTarget(e, tgt);
        return true;
      }
      if(passedWaypoint(e)){
        e.redirecting = false;
        if(cfg.onFizzle) cfg.onFizzle(e);
        return true;
      }
    }
    return true;
  }

  return {reelBehavior, updateRedirect};
}
window.createRedirectReelBehavior = createRedirectReelBehavior;

// apunta e hacia (tx,ty) a velocidad constante, y guarda el punto como "waypoint" para poder
// detectar cuando ya lo paso de largo (ver passedWaypoint: producto punto entre la direccion de
// vuelo actual y el vector hacia el waypoint -- negativo o cero significa que ya quedo atras)
function aimAt(e, tx, ty, speed){
  const dx = tx - e.x, dy = ty - e.y;
  const dist = Math.hypot(dx,dy) || 1;
  e.vx = dx/dist*speed;
  e.vy = dy/dist*speed;
  e.redirectWaypointX = tx;
  e.redirectWaypointY = ty;
}
function passedWaypoint(e){
  const toWX = e.redirectWaypointX - e.x, toWY = e.redirectWaypointY - e.y;
  return (e.vx*toWX + e.vy*toWY) <= 0;
}
