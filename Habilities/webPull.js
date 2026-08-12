// habilities/webPull.js -- habilidad de jalon: boton medio con una telaraña tensada. Movida tal
// cual desde spiderswing.html.

// jala al jugador hacia el punto de anclaje de una telaraña tensada, y de paso la inutiliza
// (la telaraña usada para el impulso se suelta y cae, ya no sirve)
//
// esto ya NO es "sumale WEB_PULL_SPEED a la velocidad que ya traigas": eso fallaba justo en el
// caso que mas importa, cuando venis yendo fuerte en CONTRA del anclaje (sumar el impulso ahi
// apenas te frena un poco, no te llega a mandar hacia el punto). Ahora es un frenazo + impulso:
// primero se cancela del todo la componente de la velocidad actual que va a favor o en contra
// del anclaje (la "radial"), dejando intacta la componente perpendicular a eso (la "tangencial",
// para no perder la sensacion de donde venias), y RECIEN AHI se aplica el impulso completo. Asi
// el empujon siempre pega con la misma fuerza (la fuerza ya la tenia, WEB_PULL_SPEED no cambia),
// venir frenando en seco antes de salir disparado, no solo un frenon a medias
function performWebPull(w){
  const hand = (webs.left === w) ? 'left' : 'right';

  // caso especial (mas especial todavia que "huggable"): una entidad con def.reelBehavior propio
  // (ej. una bomba enganchada, o el aerodeslizador vacio del boss, ver entities/crazylimemonster.js)
  // se hace cargo ELLA MISMA de que significa "click medio con la soga tensa" -- el motor no
  // sabe nada de bombas ni de aerodeslizadores, solo delega y sale. El propio reelBehavior es
  // responsable de soltar la telaraña cuando corresponda (con detachIfAttached(hand), la misma
  // funcion que usa el resto de este archivo) -- si no la suelta, se queda enganchada.
  if(w.entity && w.entity.def.reelBehavior && !w.entity.dead){
    w.entity.def.reelBehavior(w.entity, hand, w);
    return;
  }

  // caso especial: entidad "huggable" (civiles, etc.) enganchada y tensada. Aca se invierte
  // quien recibe el impulso: en vez de jalar al jugador hacia el anclaje, es la entidad la que
  // sale disparada -- pero como jalon REAL de fisica (applyEntityPullImpulse), no como un
  // teletransporte garantizado: puede no alcanzar a llegar, y la telaraña se queda enganchada
  // (no se corta sola) para poder volver a tirar. Si llega lo bastante cerca del jugador, el
  // propio civiles.js (estado 'towed') se encarga de completar el abrazo solo -- aca no se
  // chequea ningun tope de carga, eso tambien es cosa suya
  if(w.entity && w.entity.def.huggable && !w.entity.dead){
    applyEntityPullImpulse(w.entity);
    return;
  }

  const dx = w.anchorX - player.x, dy = w.anchorY - player.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx/dist, uy = dy/dist;

  const radial = player.vx*ux + player.vy*uy;      // cuanto de la velocidad actual va sobre el eje anclaje<->jugador
  const tangX = player.vx - ux*radial;              // resto de la velocidad (perpendicular), se conserva tal cual
  const tangY = player.vy - uy*radial;
  player.vx = tangX + ux*WEB_PULL_SPEED;
  player.vy = tangY + uy*WEB_PULL_SPEED;

  player.grounded = false;
  player.standingOnCar = null;
  detachIfAttached(hand);
}
