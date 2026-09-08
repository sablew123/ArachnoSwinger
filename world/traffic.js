// world/traffic.js -- TRAFICO: carros continuos, sin rebotar en ningun limite. Cada carro, una
// vez aparece yendo en una direccion, sigue de largo por siempre en ESA misma direccion (nunca
// se da vuelta ni rebota en el borde de un chunk ni de nada). Aparecen cerca del jugador (justo
// afuera de camara, entrando en cuadro como si vinieran manejando desde mas alla) y desaparecen
// solos cuando ya quedaron demasiado lejos de el.
//
// IMPORTANTE: este archivo necesita CHUNK_WIDTH y STREET_Y (world/constants.js) ya definidas,
// asi que en world/manifest.js tiene que listarse DESPUES de 'constants.js'. Se carga via
// world/manifest.js (document.write, sincronico), asi que cars/spawnCar/etc. ya estan
// disponibles como globales para el resto del juego apenas arranca -- igual que antes.
//
// los carros NO viven dentro de los chunks: van y vienen de forma continua, independiente de
// que chunk este cargado, asi que este array no se vacia ni se reconstruye cuando cambian los
// chunks (si se vacia entero en resetWorld(), en spiderswing.html, via cars.length = 0)
const cars = [];

const CAR_DESPAWN_DIST      = CHUNK_WIDTH * 2; // a 2 "chunks" de distancia del jugador, desaparecen
const CAR_SPAWN_MARGIN      = 500;  // que tan lejos del borde de camara aparecen (para que "entren" en cuadro, no popeen de la nada)
const CAR_SPAWN_INTERVAL_MIN = 1.1; // segundos entre apariciones nuevas
const CAR_SPAWN_INTERVAL_MAX = 2.4;
let carSpawnTimer = 0.6;

// tres colores de bus, cada uno con su propia maña para manejar: los azules siempre van para la
// derecha, los rojos siempre para la izquierda, y los amarillos van para cualquier lado pero de
// vez en cuando (ver reversal de amarillos en update(), en spiderswing.html) se arrepienten y se
// devuelven
const CAR_COLORS = {
  blue:   {body: '#3b6fd6', dir: 1},
  red:    {body: '#d64545', dir: -1},
  yellow: {body: '#e0c23c', dir: 0} // 0 = cualquiera de los dos, se decide al spawnear
};
const CAR_WHEEL_RADIUS = 64*0.2; // fijo (h siempre 64): asi la carroceria se puede levantar justo lo que hace falta

function spawnCar(x, vx, color){
  const w = 170, h = 64;
  // la carroceria se sube un toque (el radio de la rueda) para que las ruedas queden apoyadas
  // JUSTO en la calle en vez de enterradas en ella
  cars.push({x, y: STREET_Y - h - CAR_WHEEL_RADIUS, w, h, vx, color, turnCooldown: color === 'yellow' ? 3 + Math.random()*4 : 0});
}

// aparece uno nuevo cada tanto, justo afuera de uno de los dos bordes de camara, manejando
// hacia dentro de cuadro (para que se sienta que viene "de la calle", no que aparece de la nada)
function trySpawnCars(dt){
  carSpawnTimer -= dt;
  if(carSpawnTimer > 0) return;
  carSpawnTimer = CAR_SPAWN_INTERVAL_MIN + Math.random()*(CAR_SPAWN_INTERVAL_MAX - CAR_SPAWN_INTERVAL_MIN);

  const colorNames = Object.keys(CAR_COLORS);
  const color = colorNames[Math.floor(Math.random()*colorNames.length)];
  const forcedDir = CAR_COLORS[color].dir;
  const dir = forcedDir !== 0 ? forcedDir : (Math.random() < 0.5 ? -1 : 1);
  const speed = dir * (60 + Math.random()*80);
  const x = dir > 0
    ? camera.x - CAR_SPAWN_MARGIN - 170   // viene desde la izquierda, manejando hacia la derecha
    : camera.x + canvas.width + CAR_SPAWN_MARGIN; // viene desde la derecha, manejando hacia la izquierda
  spawnCar(x, speed, color);
}

// se van solos (sin rebotar en nada) cuando quedan demasiado lejos del jugador
function despawnFarCars(){
  for(let i = cars.length-1; i>=0; i--){
    if(Math.abs(cars[i].x - player.x) > CAR_DESPAWN_DIST) cars.splice(i,1);
  }
}

// arranca la partida con algo de trafico ya circulando cerca del spawn, no con la calle vacia.
// no depende de player/camera (usa el mismo 150 hardcodeado que el spawn del jugador), asi que
// es seguro que corra ya mismo, sincronico, apenas se carga este archivo -- antes de que el
// resto del juego (player, camera) exista siquiera
(function seedInitialTraffic(){
  const colorNames = Object.keys(CAR_COLORS);
  for(let i=0;i<8;i++){
    const color = colorNames[Math.floor(Math.random()*colorNames.length)];
    const forcedDir = CAR_COLORS[color].dir;
    const dir = forcedDir !== 0 ? forcedDir : (Math.random()<0.5 ? -1 : 1);
    const x = 150 + (Math.random()*1800 - 900); // 150 = x de spawn del jugador
    spawnCar(x, dir*(60+Math.random()*80), color);
  }
})();

// dibuja todos los carros (carroceria + parabrisas + ruedas + faros): diseño minimo. Se llama
// desde render(), en spiderswing.html, justo despues de dibujar la calle y antes de las
// entidades modulares -- mismo lugar exacto que ocupaba este bloque cuando estaba inline ahi.
function drawCars(ctx){
  for(const car of cars){
    ctx.save();
    // car.tipped/tipRotation/tipYOffset: SOLO existen durante el arrastre del boss (ver
    // entities/dragsystem.js) -- un auto normal jamas los tiene, asi que en cualquier otro
    // momento del juego este bloque no hace nada (rotation 0, offset 0 sobre su propio pivote)
    if(car.tipped){
      const px = car.x + car.w/2, py = car.y + car.h;
      ctx.translate(px, py + (car.tipYOffset || 0));
      ctx.rotate(car.tipRotation || 0);
      ctx.translate(-px, -py);
    }

    ctx.fillStyle = (CAR_COLORS[car.color] && CAR_COLORS[car.color].body) || '#d64545';
    ctx.fillRect(car.x, car.y, car.w, car.h);

    // parabrisas/ventanas
    ctx.fillStyle = '#2a2d35';
    ctx.fillRect(car.x + car.w*0.14, car.y + 6, car.w*0.72, car.h*0.34);

    // ruedas
    ctx.fillStyle = '#111';
    const wheelR = CAR_WHEEL_RADIUS;
    ctx.beginPath(); ctx.arc(car.x + car.w*0.22, car.y + car.h, wheelR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(car.x + car.w*0.78, car.y + car.h, wheelR, 0, Math.PI*2); ctx.fill();

    // faros
    ctx.fillStyle = '#ffe9a8';
    const headlightX = car.vx >= 0 ? car.x + car.w - 5 : car.x;
    ctx.fillRect(headlightX, car.y + car.h*0.55, 5, 6);
    ctx.restore();
  }
}
