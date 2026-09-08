// world/interiors.js
// Poder ENTRAR a los edificios. Te parás frente a la puerta de un edificio (dibujada a nivel de
// calle, en el centro de su base -- ver drawBuildingDoors mas abajo), apretás DOOR_KEY y la
// pantalla entera pasa a mostrar el interior: una habitacion cerrada, caminable de lado a lado,
// con muebles propios segun el `kind` del edificio (apartment/office/hospital) -- y CON EL MISMO
// PERSONAJE de siempre adentro (el mismo drawPlayer/computePlayerPose que se usa afuera, mismo
// skin elegido y todo: no hay un "muñequito" aparte para el interior, ver drawInsideBuilding).
// Nada de afuera -- ni edificios, ni calle, ni entidades -- queda visible mientras tanto.
// Apretando la misma tecla de nuevo volves a aparecer justo en la puerta por la que entraste.
//
// El mundo de AFUERA (chunks, autos, entidades) NO se pausa mientras estas adentro: solo se
// salta el update de TU propio personaje AFUERA (movimiento/colisiones/telarañas/camara) -- ver
// el corte en update() de spiderswing.html. `player.x`/`player.y` NO se tocan mientras estas
// adentro (siguen siendo la puerta por la que entraste, asi los chunks de afuera se siguen
// cargando alrededor de ese punto con normalidad) -- el caminar adentro se maneja con una
// coordenada propia (ib.walkX, ver updateInsideBuilding) que solo se "presta" a player.x/player.y
// un instante, nada mas que para el dibujado (ver drawInsideBuilding), restaurando los valores
// reales apenas termina de dibujar.
//
// COMO SE ENGANCHA A spiderswing.html (a proposito, lo minimo posible, todo lo demas vive aca):
//   1. en update(dt), justo despues de actualizar chunks/autos/entidades pero ANTES de la fisica
//      del jugador: `if(window.insideBuilding){ updateInsideBuilding(dt); return; }`
//   2. en render(), como primera linea (antes de dibujar cielo/mundo):
//      `if(window.insideBuilding){ drawInsideBuilding(ctx, canvas.width, canvas.height); return; }`
//   3. en el loop de edificios de render() (mundo de AFUERA): `drawBuildingDoors(ctx);` -- dibuja
//      la puerta de cada edificio, en el MISMO punto exacto que ya usa findNearbyDoor (mas abajo)
//      para decidir si estas lo bastante cerca como para entrar, asi lo que se ve dibujado
//      siempre coincide con lo que en verdad te deja interactuar.
//   4. en la seccion de HUD (junto a drawPlayerHpBar()/drawWebAmmoHUD()): `drawDoorPrompt(ctx);`
//   5. en resetWorld(): `window.insideBuilding = null;` (no te podes quedar "adentro" de un
//      edificio que quizas ni se regenere igual tras un reinicio)
// El resto (el propio keydown de entrar/salir, la logica, el dibujo) vive TODO aca.
//
// DISEÑO A FUTURO (todavia NO implementado): que la habitacion no sea siempre UNA sola por
// edificio -- tantas puertas/apartamentos como pisos tenga, cada uno con su propio interior. Por
// eso ya armamos buildingRng() aca abajo (el rng propio de un edificio puntual, reusado tanto
// para elegir la puerta como para generar sus muebles) aunque hoy solo genere una habitacion: el
// dia que haya mas de una por edificio, el enganche puerta<->edificio no va a necesitar tocarse,
// solo la cantidad de puertas que dibuja drawBuildingDoors.

const DOOR_KEY = 'KeyE';       // tecla para entrar/salir
const DOOR_REACH_X = 46;       // que tan cerca (en X) del centro de la fachada hay que estar para poder entrar
const DOOR_REACH_Y = 12;       // margen vertical: solo cuenta si estas mas o menos parado a nivel de calle
const DOOR_W = 40, DOOR_H = 56; // tamaño visual de la puerta dibujada en la fachada (ver drawBuildingDoors)

// rng propio de UN edificio en particular (determinista a partir de su X, que a su vez ya sale
// de rng(chunkIndex) al generarse, y de la seed global) -- se usa tanto para el estilo de la
// puerta (drawBuildingDoors) como para generar los muebles de su interior (enterBuilding): mismo
// edificio, misma puerta, mismos muebles, siempre.
function buildingRng(b){
  const h = (Math.imul(Math.floor(b.x) + 0x27D4EB2F, 2654435761) ^ WORLD_SEED) >>> 0;
  return mulberry32(h);
}

// paletas de puerta por kind -- nomas para que de lejos ya se note que tipo de edificio es antes
// de llegar (apartamento: madera de algun tono calido; oficina: vidrio oscuro a tono con su
// propio glassColor si lo tiene; hospital: blanco con el mismo acento rojo que su cruz)
const DOOR_WOOD_COLORS = ['#6b4a30', '#7a4632', '#5c3b25', '#8a5a35'];

function doorStyleFor(b){
  const rng = buildingRng(b);
  if(b.kind === 'hospital'){
    return {frame: '#c9c3b2', panel: '#eef6fb', accent: '#E23B3B', glass: true};
  }
  if(b.kind === 'office'){
    return {frame: '#20242c', panel: b.glassColor || '#6FB8DE', accent: '#20242c', glass: true};
  }
  return {frame: '#2b1c10', panel: DOOR_WOOD_COLORS[Math.floor(rng()*DOOR_WOOD_COLORS.length)], accent: '#e8c468', glass: false};
}

// dibuja la puerta de CADA edificio cargado, siempre en el mismo punto que findNearbyDoor usa
// para el chequeo de cercania (centro de la base, a nivel de calle) -- se llama desde el loop de
// edificios de render() en spiderswing.html, en coordenadas de MUNDO (ya adentro del
// ctx.translate(-camera.x,-camera.y) de esa seccion)
function drawBuildingDoors(ctx){
  for(const b of buildings){
    const style = doorStyleFor(b);
    const dx = b.x + b.w/2 - DOOR_W/2, dy = STREET_Y - DOOR_H;
    ctx.save();
    // marco
    ctx.fillStyle = style.frame;
    ctx.fillRect(dx-4, dy-4, DOOR_W+8, DOOR_H+4);
    // hoja de la puerta
    ctx.fillStyle = style.panel;
    ctx.fillRect(dx, dy, DOOR_W, DOOR_H);
    if(style.glass){
      // puerta vidriada (oficina/hospital): dos paneles separados por un parante fino
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(dx+DOOR_W/2, dy+4); ctx.lineTo(dx+DOOR_W/2, dy+DOOR_H-4); ctx.stroke();
    } else {
      // puerta de madera: un par de tablones sutiles + picaporte dorado
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(dx+DOOR_W*0.33, dy+3); ctx.lineTo(dx+DOOR_W*0.33, dy+DOOR_H-3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(dx+DOOR_W*0.66, dy+3); ctx.lineTo(dx+DOOR_W*0.66, dy+DOOR_H-3); ctx.stroke();
    }
    // picaporte
    ctx.fillStyle = style.accent;
    ctx.beginPath(); ctx.arc(dx+DOOR_W-9, dy+DOOR_H*0.55, 2.6, 0, Math.PI*2); ctx.fill();
    // umbral (un escaloncito angosto pegado al piso, para que no parezca flotando)
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(dx-6, STREET_Y, DOOR_W+12, 4);
    ctx.restore();
  }
}

// estado actual: null si estamos afuera, o {building, doorX, doorY, kind, decor, walkX} con el
// edificio en el que estamos, la puerta exacta a la que hay que devolver al jugador al salir,
// los muebles generados para esta habitacion (ver genInteriorDecor) y la posicion horizontal
// (en coordenadas de la habitacion, ver ROOM_W) donde esta parado el personaje adentro.
window.insideBuilding = null;

// ---- geometria logica de la habitacion (en las mismas unidades que el resto del mundo -- por
// eso el personaje real se ve del mismo tamaño de siempre al entrar, nada reescalado aparte) ----
const ROOM_W = 380, ROOM_H = 220;
const ROOM_WALL_PAD = 40;              // margen caminable desde cada pared (deja lugar para el ancho del propio personaje)
const ROOM_WALK_MIN = ROOM_WALL_PAD, ROOM_WALK_MAX = ROOM_W - ROOM_WALL_PAD;
const ROOM_FLOOR_STRIP = 16;           // alto del zocalo/piso dibujado abajo de la habitacion
const ROOM_FLOOR_Y = ROOM_H - ROOM_FLOOR_STRIP; // "STREET_Y" local de la habitacion: donde pisa el personaje
const INTERIOR_WALK_SPEED = 150;       // unidades de ROOM_W por segundo (mas lento que correr afuera, a proposito: es un cuarto chico)

// muebles disponibles por kind -- cada uno es {type, x} con x en coordenadas de ROOM_W. Se arma
// UNA vez por edificio (al entrar, ver enterBuilding) con buildingRng(b), asi el mismo edificio
// siempre tiene los mismos muebles en el mismo lugar.
function genInteriorDecor(kind, rng){
  const slots = [0.20, 0.38, 0.56, 0.74, 0.90].map(f => ROOM_WALL_PAD + f*(ROOM_W-2*ROOM_WALL_PAD) + (rng()-0.5)*14);
  const decor = [];
  if(kind === 'hospital'){
    decor.push({type:'hospitalBed', x: slots[0]});
    decor.push({type:'ivStand',     x: slots[1]});
    decor.push({type:'monitor',     x: slots[2]});
    decor.push({type:'curtain',     x: slots[3]});
    if(rng() < 0.6) decor.push({type:'cabinet', x: slots[4]});
  } else if(kind === 'office'){
    decor.push({type:'desk',    x: slots[1]});
    decor.push({type:'chair',   x: slots[1]+22});
    decor.push({type:'cabinet', x: slots[3]});
    decor.push({type:'plant',   x: slots[4]});
    if(rng() < 0.7) decor.push({type:'window', x: slots[0]});
  } else {
    decor.push({type:'bed',   x: slots[0]});
    decor.push({type:'rug',   x: slots[2]});
    decor.push({type:'lamp',  x: slots[1]});
    decor.push({type:'shelf', x: slots[3]});
    if(rng() < 0.7) decor.push({type:'window', x: slots[4]});
  }
  return decor;
}

// busca, entre TODOS los edificios cargados, uno cuya puerta (el centro de su base) este lo
// bastante cerca del jugador como para entrar. Cualquier kind sirve por igual (apartamento,
// oficina, hospital) -- alcanza con estar cerca y mas o menos parado en el piso
function findNearbyDoor(px, py){
  for(const b of buildings){
    const doorX = b.x + b.w/2, doorY = STREET_Y;
    if(Math.abs(px - doorX) <= DOOR_REACH_X && Math.abs(py + PLAYER_SIZE/2 - doorY) <= DOOR_REACH_Y){
      return b;
    }
  }
  return null;
}

function enterBuilding(b){
  const rng = buildingRng(b);
  window.insideBuilding = {
    building: b,
    doorX: b.x + b.w/2,
    doorY: STREET_Y,
    kind: b.kind || 'apartment',
    decor: genInteriorDecor(b.kind || 'apartment', rng),
    walkX: ROOM_WALL_PAD + 8 // arranca pegado a la puerta (pared izquierda de la habitacion)
  };
  // limpiamos cualquier telaraña que hubiera quedado en el aire: adentro no hay de donde
  // engancharlas, y no queremos que quede una soga dibujada apuntando a la nada
  webs.left = null; webs.right = null;
}

function exitBuilding(){
  if(!window.insideBuilding) return;
  const {doorX, doorY} = window.insideBuilding;
  // te devuelve justo a la puerta por la que entraste, parado en el piso, quieto
  player.x = doorX;
  player.y = doorY - PLAYER_SIZE/2;
  player.vx = 0; player.vy = 0;
  player.grounded = true;
  window.insideBuilding = null;
}

// se llama en vez de TODO el update() normal del jugador mientras estamos adentro (ver el punto
// 1 de "COMO SE ENGANCHA" arriba). No tocamos player.x/player.y de verdad aca (esos siguen
// siendo la puerta por la que entraste, ver el comentario grande arriba de todo) -- solo
// movemos ib.walkX, la posicion dentro de la habitacion, con A/D. Sin salto, sin gravedad: no
// hace falta mas que caminar de pared a pared en un cuarto chico y cerrado.
function updateInsideBuilding(dt){
  const ib = window.insideBuilding;
  if(!ib) return;
  webs.left = null; webs.right = null; // por si algun click quedo pendiente de afuera
  let dir = 0;
  if(keys.a) dir -= 1;
  if(keys.d) dir += 1;
  ib.walkX += dir * INTERIOR_WALK_SPEED * dt;
  if(ib.walkX < ROOM_WALK_MIN) ib.walkX = ROOM_WALK_MIN;
  if(ib.walkX > ROOM_WALK_MAX) ib.walkX = ROOM_WALK_MAX;
  ib.dir = dir; // guardado nomas para el dibujo (ver drawInsideBuilding)
}

// dibuja un mueble de la habitacion, en coordenadas LOCALES de la habitacion (0..ROOM_W en x,
// floorY = piso local en y) -- se llama ya adentro del ctx.translate+ctx.scale que arma
// drawInsideBuilding, asi las mismas coordenadas que usa genInteriorDecor sirven tal cual, sin
// reescalar nada a mano aca.
function drawDecorItem(ctx, item, floorY){
  const x = item.x;
  ctx.save();
  switch(item.type){
    case 'bed': {
      const w=70, h=34;
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#e7dfce'; ctx.fillRect(x-w/2+4, floorY-h+6, w-8, h*0.55);
      ctx.fillStyle = '#c94f4f'; ctx.fillRect(x-w/2+4, floorY-h+6, w*0.28, h*0.55);
      break;
    }
    case 'hospitalBed': {
      const w=76, h=30;
      ctx.fillStyle = '#d7dbe0'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x-w/2+4, floorY-h+5, w-8, h*0.6);
      ctx.strokeStyle = '#a9b0ba'; ctx.lineWidth = 2; ctx.strokeRect(x-w/2, floorY-h, w, h);
      break;
    }
    case 'ivStand': {
      ctx.strokeStyle = '#9aa0a8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, floorY-58); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-12, floorY); ctx.lineTo(x+12, floorY); ctx.stroke();
      ctx.fillStyle = 'rgba(190,231,245,0.85)';
      ctx.beginPath(); ctx.ellipse(x, floorY-62, 7, 10, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'monitor': {
      const w=30, h=22;
      ctx.fillStyle = '#20242c'; ctx.fillRect(x-w/2, floorY-h-24, w, h);
      ctx.strokeStyle = '#39ff6a'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(x-w/2+3, floorY-h-24+h*0.6);
      ctx.lineTo(x-w/2+w*0.35, floorY-h-24+h*0.6);
      ctx.lineTo(x-w/2+w*0.5, floorY-h-24+h*0.2);
      ctx.lineTo(x-w/2+w*0.65, floorY-h-24+h*0.9);
      ctx.lineTo(x+w/2-3, floorY-h-24+h*0.6);
      ctx.stroke();
      ctx.fillStyle = '#3a3f48'; ctx.fillRect(x-4, floorY-24, 8, 24);
      break;
    }
    case 'curtain': {
      ctx.fillStyle = 'rgba(210,225,235,0.55)';
      ctx.fillRect(x-24, floorY-90, 48, 90);
      ctx.strokeStyle = 'rgba(150,165,175,0.6)'; ctx.lineWidth = 1;
      for(let i=1;i<4;i++){ const lx=x-24+i*12; ctx.beginPath(); ctx.moveTo(lx, floorY-90); ctx.lineTo(lx, floorY); ctx.stroke(); }
      break;
    }
    case 'desk': {
      const w=64, h=28;
      ctx.fillStyle = '#6b4a30'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#20242c'; ctx.fillRect(x-16, floorY-h-18, 26, 18);
      ctx.fillStyle = '#6FB8DE'; ctx.fillRect(x-14, floorY-h-16, 22, 13);
      break;
    }
    case 'chair': {
      ctx.fillStyle = '#3a3f48';
      ctx.fillRect(x-9, floorY-20, 18, 20);
      ctx.fillRect(x-9, floorY-34, 18, 6);
      break;
    }
    case 'cabinet': {
      const w=30, h=46;
      ctx.fillStyle = '#4b4f57'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x-w/2, floorY-h*0.5); ctx.lineTo(x+w/2, floorY-h*0.5); ctx.stroke();
      break;
    }
    case 'plant': {
      ctx.fillStyle = '#8a5a3c'; ctx.fillRect(x-10, floorY-16, 20, 16);
      ctx.fillStyle = '#3fa15a';
      ctx.beginPath(); ctx.ellipse(x, floorY-30, 16, 20, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'rug': {
      ctx.fillStyle = 'rgba(180,90,90,0.55)';
      ctx.beginPath(); ctx.ellipse(x, floorY-3, 40, 10, 0, 0, Math.PI*2); ctx.fill();
      break;
    }
    case 'lamp': {
      ctx.strokeStyle = '#3a3f48'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, floorY); ctx.lineTo(x, floorY-50); ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath(); ctx.moveTo(x-12, floorY-50); ctx.lineTo(x+12, floorY-50); ctx.lineTo(x+7, floorY-66); ctx.lineTo(x-7, floorY-66); ctx.closePath(); ctx.fill();
      break;
    }
    case 'shelf': {
      const w=54, h=60;
      ctx.fillStyle = '#6b4a30'; ctx.fillRect(x-w/2, floorY-h, w, h);
      ctx.fillStyle = '#2b1c10';
      for(let i=1;i<3;i++) ctx.fillRect(x-w/2, floorY-h+i*(h/3), w, 3);
      const bookColors = ['#c94f4f','#4f8fc9','#e8c468','#3fa15a'];
      for(let i=0;i<6;i++){ ctx.fillStyle = bookColors[i%bookColors.length]; ctx.fillRect(x-w/2+4+i*8, floorY-h+4, 6, h/3-8); }
      break;
    }
    case 'window': {
      const w=50, h=44;
      ctx.fillStyle = '#2b1c10'; ctx.fillRect(x-w/2-4, floorY-90-4, w+8, h+8);
      ctx.fillStyle = '#9fd6ef'; ctx.fillRect(x-w/2, floorY-90, w, h);
      ctx.strokeStyle = '#2b1c10'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, floorY-90); ctx.lineTo(x, floorY-90+h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x-w/2, floorY-90+h/2); ctx.lineTo(x+w/2, floorY-90+h/2); ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

// dibuja la habitacion entera, reemplazando TODA la pantalla -- nada del mundo de afuera queda
// visible mientras estas adentro (ver el punto 2 de "COMO SE ENGANCHA" arriba). El personaje que
// se ve caminando es el MISMO de siempre: se arma un ctx.translate/ctx.scale propio (para que la
// habitacion, chica y en unidades de mundo, entre en cualquier tamaño de canvas) y adentro de esa
// transformacion se llama a computePlayerPose()/drawPlayer(ctx) EXACTAMENTE igual que en render()
// afuera -- solo que "prestandole" player.x/player.y la posicion dentro de la habitacion (ib.walkX
// + el piso local) por la duracion de este dibujado nomas, restaurando los valores reales
// (la puerta) apenas termina, para no pisarle nada a los chunks/HUD de afuera.
function drawInsideBuilding(ctx, width, height){
  const ib = window.insideBuilding;
  const kindLabel = ib.kind === 'hospital' ? 'Habitacion de hospital' : ib.kind === 'office' ? 'Oficina' : 'Apartamento';

  ctx.fillStyle = '#14151b';
  ctx.fillRect(0, 0, width, height);

  const fit = Math.min(1, (width*0.88)/ROOM_W, (height*0.72)/ROOM_H);
  const boxW = ROOM_W*fit, boxH = ROOM_H*fit;
  const bx = (width-boxW)/2, by = (height-boxH)/2;

  const wallColor = ib.kind === 'hospital' ? '#eef3f6' : ib.kind === 'office' ? '#2c2f38' : '#e9e6dd';
  ctx.fillStyle = wallColor;
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.strokeRect(bx, by, boxW, boxH);

  // a partir de aca, todo se dibuja en coordenadas LOCALES de la habitacion (0..ROOM_W, 0..ROOM_H,
  // mismas unidades que el resto del mundo) -- el translate+scale se encarga de ubicarlo bien
  // adentro del recuadro sea cual sea el tamaño real del canvas
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(fit, fit);

  // zocalo/piso
  ctx.fillStyle = ib.kind === 'hospital' ? '#cfd7dc' : ib.kind === 'office' ? '#1c1e24' : '#c9c3b2';
  ctx.fillRect(0, ROOM_FLOOR_Y, ROOM_W, ROOM_FLOOR_STRIP);

  // puerta de entrada, pegada a la pared izquierda (por donde entraste) -- referencia visual de
  // por donde salis, aunque se puede salir apretando E desde cualquier punto de la sala
  const doorW = 34, doorH = 70;
  ctx.fillStyle = '#2b1c10';
  ctx.fillRect(2, ROOM_FLOOR_Y-doorH, doorW, doorH);
  ctx.fillStyle = '#6b4a30';
  ctx.fillRect(6, ROOM_FLOOR_Y-doorH+4, doorW-8, doorH-4);

  // muebles
  for(const item of ib.decor) drawDecorItem(ctx, item, ROOM_FLOOR_Y);

  // el personaje de siempre: le prestamos player.x/player.y la posicion de adentro (ib.walkX,
  // parado sobre ROOM_FLOOR_Y con la misma convencion "y = piso - PLAYER_SIZE/2" que usa afuera),
  // ponemos vx/facing acordes a si se esta moviendo, y llamamos EXACTAMENTE a las mismas
  // funciones de dibujo que afuera -- no hay sprite ni silueta aparte para el interior.
  const realX = player.x, realY = player.y, realVx = player.vx, realGrounded = player.grounded,
        realClinging = player.clinging, realStandingOnCar = player.standingOnCar, realRunning = player.running;
  player.x = ib.walkX;
  player.y = ROOM_FLOOR_Y - PLAYER_SIZE/2;
  player.vx = (ib.dir||0) * INTERIOR_WALK_SPEED;
  player.grounded = true;
  player.clinging = null;
  player.standingOnCar = null;
  player.running = false;
  computePlayerPose();
  drawPlayer(ctx);
  player.x = realX; player.y = realY; player.vx = realVx; player.grounded = realGrounded;
  player.clinging = realClinging; player.standingOnCar = realStandingOnCar; player.running = realRunning;

  ctx.restore(); // fin de las coordenadas locales de la habitacion

  // rotulo + hint (en espacio de pantalla, fuera de la transformacion de la habitacion)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText(kindLabel, width/2, by - 14);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText('A / D para caminar   ·   E para salir', width/2, by + boxH + 20);
}

// letrerito ("Presiona E para entrar") flotando sobre la puerta cuando estas cerca y todavia
// afuera -- se llama explicitamente desde la seccion de HUD de spiderswing.html (ver el punto 4
// de "COMO SE ENGANCHA" arriba), en espacio de pantalla (por eso resta camera.x/camera.y a mano)
function drawDoorPrompt(ctx){
  if(window.insideBuilding) return;
  const b = findNearbyDoor(player.x, player.y);
  if(!b) return;
  const screenX = b.x + b.w/2 - camera.x;
  const screenY = STREET_Y - camera.y - PLAYER_SIZE - 14;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 13px monospace';
  ctx.fillStyle = '#000';
  ctx.fillText('Presiona E para entrar', screenX+1, screenY+1);
  ctx.fillStyle = '#fff700';
  ctx.fillText('Presiona E para entrar', screenX, screenY);
  ctx.restore();
}

// interaccion: E entra si estas cerca de una puerta y afuera, o sale si ya estas adentro. Igual
// que el resto de los ganchos de teclado del juego, no hace nada si el juego esta pausado o en
// GAME OVER (gameOver/paused son variables del script principal, pero como esta funcion recien
// se ejecuta cuando el jugador de verdad aprieta la tecla -- mucho despues de que todo termino
// de cargar -- ya estan definidas para entonces, sin importar que este archivo se cargue antes)
window.addEventListener('keydown', e=>{
  if(e.code !== DOOR_KEY || e.repeat) return;
  if(gameOver || paused) return;
  if(window.insideBuilding){
    exitBuilding();
  } else {
    const b = findNearbyDoor(player.x, player.y);
    if(b) enterBuilding(b);
  }
});
