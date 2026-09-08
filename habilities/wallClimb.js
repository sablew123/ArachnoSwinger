// habilities/wallClimb.js -- habilidad de agarre de pared: doble toque de W contra la fachada
// de un edificio. Movida tal cual desde spiderswing.html. updateWallCling(dt, allowInput) (la
// fisica cuadro a cuadro una vez agarrado) sigue viviendo en el motor porque es parte del loop
// principal, no un disparador de boton -- aca solo esta el disparo de la habilidad en si.
//
// ADENTRO de un edificio (ver world/interiors.js) esta habilidad tambien funciona, pero contra
// las paredes LATERALES del cuarto en vez de contra `buildings` (que es la ciudad de afuera,
// vacia/lejos del bolsillo de coordenadas mientras estas adentro) -- ver tryGrabIndoorWall mas
// abajo, un caso separado del de afuera porque la geometria es bien distinta (una unica linea
// vertical, sin esquinas de las que saltar a otro edificio ni techo del que vaultear).
function tryGrabWall(dt){
  const half = PLAYER_SIZE/2;
  // ademas de donde estas parado AHORA, tambien probamos donde vas a terminar tras el movimiento
  // de este mismo frame: si venis muy rapido, a veces el edificio te queda "entre" un frame y el
  // otro, y con un solo punto de chequeo el agarre se te escapaba
  const predX = player.x + player.vx*dt, predY = player.y + player.vy*dt;
  const points = [{x:player.x, y:player.y}, {x:predX, y:predY}];

  if(window.insideBuilding) return tryGrabIndoorWall(points);

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

// agarre de pared ADENTRO de un edificio: el "fondo" del cuarto (ib.facade, el rectangulo que
// cubre TODO el ancho jugable de la habitacion -- ver world/interiors.js) tratado como una unica
// pared grande, exactamente igual que tryGrabWall trata la fachada de un edificio desde afuera:
// te podes pegar en CUALQUIER punto de su ancho, no solo en un par de bordes puntuales.
//
// ANTES esto enganchaba nada mas las dos paredes LATERALES del cuarto (el limite ROOM_WALL_PAD
// que usa collideRoom para no dejarte caminar mas alla), como si fueran dos lineas verticales
// delgadas de las que colgarte -- pero esas paredes son limites de COLISION (por que no podes
// caminar mas alla), no tienen nada que ver con lo que deberia poder treparse. El fondo del
// cuarto es una superficie continua de punta a punta, asi que el agarre tiene que serlo tambien.
//
// El rango grabable (faceMinX/faceMaxX) sigue siendo el mismo ancho jugable de ROOM_WALL_PAD
// -- eso no cambia, es simplemente ya no el UNICO lugar donde enganchar, sino los dos extremos
// de todo el rango. A diferencia de afuera, no hay "borde lateral" del que saltar a otro
// edificio (no hay overhang tipo WALL_EDGE_OUT: minX/maxX quedan iguales a faceMinX/faceMaxX),
// asi que el player.clinging resultante sigue llevando `indoor:true` -- el keydown de SPACE
// (spiderswing.html) lo chequea para saltarse el vaulteo/salto de borde y simplemente soltarte,
// sea cual sea el punto del fondo en el que estes.
function tryGrabIndoorWall(points){
  const ib = window.insideBuilding;
  const half = PLAYER_SIZE/2;
  const faceMinX = ib.roomX0 + ROOM_WALL_PAD + half;
  const faceMaxX = ib.roomX0 + ib.roomW - ROOM_WALL_PAD - half;
  const topY = (ib.groundY - ib.floors*FLOOR_H) + ROOM_TOP_PAD + half; // mismo techo que collideRoom
  const botY = ib.groundY - half;

  for(const p of points){
    if(p.y < topY - WALL_GRAB_RANGE || p.y > botY + WALL_GRAB_RANGE) continue;
    if(p.x < faceMinX - WALL_GRAB_RANGE || p.x > faceMaxX + WALL_GRAB_RANGE) continue;

    const gx = Math.max(faceMinX, Math.min(faceMaxX, p.x));
    const gy = Math.max(topY, Math.min(botY, p.y));
    grabIndoorWall(gx, gy, faceMinX, faceMaxX, topY, botY);
    return true;
  }
  return false;
}

function grabIndoorWall(x, y, faceMinX, faceMaxX, minY, maxY){
  player.clinging = {
    building: window.insideBuilding.facade, indoor: true,
    faceMinX, faceMaxX, minX: faceMinX, maxX: faceMaxX, minY, maxY,
    slipping: true, atEdge:false, edgeSide:null
  };
  player.x = x; player.y = y;
  player.grounded = false;
  player.standingOnCar = null;
  player.standingOnElevator = null;
  player.running = false;
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
