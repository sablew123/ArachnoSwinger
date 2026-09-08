// habilities/weave.js -- habilidad de tejer: soltar Shift con las dos manos enganchadas y
// tensas funde ambas telarañas en una red persistente. Movida tal cual desde spiderswing.html.

// funde las dos telarañas enganchadas en una red persistente: dos segmentos rectos, del
// anclaje izquierdo al punto donde estabas parado (el "punto de salida"), y de ahi al anclaje
// derecho. Como el vertice del medio es exactamente donde estaba el jugador, no hace falta
// ningun ajuste de posicion: ya estas parado justo sobre la red recien creada
function weaveNet(){
  const wl = webs.left, wr = webs.right;
  webNets.push({
    points: [
      {x: wl.anchorX, y: wl.anchorY},
      {x: player.x,   y: player.y},
      {x: wr.anchorX, y: wr.anchorY}
    ],
    age: 0
  });

  webs.left = null;
  webs.right = null;

  player.vy = 0;
  player.grounded = true;
  player.standingOnCar = null;
  player.clinging = null;
}
