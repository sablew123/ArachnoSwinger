// habilities/wallClimb.js -- habilidad de agarre de pared: doble toque de W contra la fachada
// de un edificio. Movida tal cual desde spiderswing.html. updateWallCling(dt, allowInput) (la
// fisica cuadro a cuadro una vez agarrado) sigue viviendo en el motor porque es parte del loop
// principal, no un disparador de boton -- aca solo esta el disparo de la habilidad en si.
function tryGrabWall(dt){
  const half = PLAYER_SIZE/2;
  // ademas de donde estas parado AHORA, tambien probamos donde vas a terminar tras el movimiento
  // de este mismo frame: si venis muy rapido, a veces el edificio te queda "entre" un frame y el
  // otro, y con un solo punto de chequeo el agarre se te escapaba
  const predX = player.x + player.vx*dt, predY = player.y + player.vy*dt;
  const points = [{x:player.x, y:player.y}, {x:predX, y:predY}];

  for(const b of buildings){
    const topY = b.y + half, botY = STREET_Y - half;
    const faceMinX = b.x + half, faceMaxX = b.x + b.w - half;
    // limite total de movimiento: un poco mas alla de la fachada, para que en el borde
    // quede colgando afuera del edificio en vez de metido adentro
    const outerMinX = b.x - WALL_EDGE_OUT, outerMaxX = b.x + b.w + WALL_EDGE_OUT;

    for(const p of points){
      if(p.y < topY - WALL_GRAB_RANGE || p.y > botY + WALL_GRAB_RANGE) continue;
      if(p.x < outerMinX - WALL_GRAB_RANGE || p.x > outerMaxX + WALL_GRAB_RANGE) continue;

      const gx = Math.max(outerMinX, Math.min(outerMaxX, p.x));
      const gy = Math.max(topY, Math.min(botY, p.y));
      grabWall(b, gx, gy, faceMinX, faceMaxX, outerMinX, outerMaxX, topY, botY);
      return true;
    }
  }
  return false;
}

function grabWall(b, x, y, faceMinX, faceMaxX, outerMinX, outerMaxX, minY, maxY){
  player.clinging = {
    building: b, faceMinX, faceMaxX, minX: outerMinX, maxX: outerMaxX, minY, maxY,
    slipping: true, atEdge:false, edgeSide:null
  };
  player.x = x; player.y = y;
  player.grounded = false;
  player.standingOnCar = null;
  player.running = false;
}
