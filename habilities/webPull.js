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
// misma nocion de "tensa" que usa getTautAttachedWeb (spiderswing.html): estirada mas alla de
// su largo natural. Hace falta este chequeo aca porque el disparo del boton medio solo garantiza
// que LA telarana que dispara este taut -- la OTRA mano puede estar enganchada pero floja, y ahi
// no corresponde el jalon doble (ver performWebPull mas abajo).
function isWebTaut(w){
  if(!w || w.state !== 'attached') return false;
  const dist = Math.hypot(player.x - w.anchorX, player.y - w.anchorY);
  return (dist - w.ropeLength) > 0;
}

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

  // caso doble, tipo resortera: hace falta que la OTRA telarana este enganchada a estructura
  // solida (sin w.entity) Y ADEMAS tensa (isWebTaut) -- no alcanza con que este enganchada:
  // colgando floja no tiene sentido combinarla, ahi el jalon simple de la que si esta tensa (w)
  // es lo correcto. Si las dos estan tensas a la vez, da lo mismo cual de las dos dispare el
  // click medio -- el resultado es el mismo, asi que no importa cual llego primero aca.
  const otherHand = hand === 'left' ? 'right' : 'left';
  const other = webs[otherHand];
  if(other && !other.entity && isWebTaut(other)){
    performDoubleWebPull(w, other, hand, otherHand);
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

// jalon doble (resortera): las dos telaranas estan ancladas a estructura solida a la vez, asi
// que el impulso final combina ambas direcciones en vez de tirar hacia un solo punto -- y pega
// mucho mas fuerte que el jalon simple (ver WEB_PULL_DOUBLE_MULT aca abajo: es un multiplicador
// sobre el mismo WEB_PULL_SPEED de siempre, asi no hace falta ir a tocar el archivo de constantes
// aparte -- ajusta el numero ahi nomas si lo queres mas o menos fuerte). Misma logica de
// "frenazo + impulso" que performWebPull: primero se cancela la componente de la velocidad
// actual sobre el eje del jalon, y recien ahi se aplica el impulso completo, para que siempre
// pegue con la misma fuerza sin importar de donde venias.
const WEB_PULL_DOUBLE_MULT = 2.2; // que tan mas fuerte que el jalon simple -- ajustar a ojo
function performDoubleWebPull(wA, wB, handA, handB){
  // direccion combinada = PROMEDIO de las direcciones unitarias hacia cada anclaje, no la suma
  // de los vectores crudos (dx,dy) -- asi un anclaje mucho mas lejos no le termina ganando todo
  // el peso a la direccion final. Cada telarana aporta lo mismo a hacia-donde-apunta el jalon;
  // la magnitud del impulso es aparte y fija (WEB_PULL_SPEED*WEB_PULL_DOUBLE_MULT).
  const dxA = wA.anchorX - player.x, dyA = wA.anchorY - player.y;
  const distA = Math.hypot(dxA, dyA) || 1;
  const uxA = dxA/distA, uyA = dyA/distA;

  const dxB = wB.anchorX - player.x, dyB = wB.anchorY - player.y;
  const distB = Math.hypot(dxB, dyB) || 1;
  const uxB = dxB/distB, uyB = dyB/distB;

  let ux = uxA + uxB, uy = uyA + uyB;
  const mag = Math.hypot(ux, uy);
  if(mag < 0.0001){
    // caso limite: los dos anclajes tiran en direcciones practicamente opuestas y se cancelan
    // -- ahi no hay "promedio" que valga, usamos la direccion de la telarana A nomas en vez de
    // mandar un impulso de magnitud cero
    ux = uxA; uy = uyA;
  } else {
    ux /= mag; uy /= mag;
  }

  const radial = player.vx*ux + player.vy*uy;
  const tangX = player.vx - ux*radial;
  const tangY = player.vy - uy*radial;
  player.vx = tangX + ux*WEB_PULL_SPEED*WEB_PULL_DOUBLE_MULT;
  player.vy = tangY + uy*WEB_PULL_SPEED*WEB_PULL_DOUBLE_MULT;

  player.grounded = false;
  player.standingOnCar = null;
  detachIfAttached(handA);
  detachIfAttached(handB);
}
