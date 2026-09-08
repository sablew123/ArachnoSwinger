// render/player.js -- todo el dibujo del monigote jugador: la pose completa segun estado
// (caminando/colgado/escalando/atacando/en el aire), las rayitas de aviso de caida, y el
// dibujo generico de una soga/telaraña (lo usa tanto el jugador como el HUD de telarañas
// sueltas). Movido tal cual desde spiderswing.html.
//
// ORDEN DE CARGA: este archivo se agrega a RENDER_FILES en render/manifest.js, que lo inyecta
// con document.write ANTES de que arranque el resto del HTML (mismo patron sincronico que
// physics/manifest.js y world/manifest.js) -- no hace falta esperar ninguna promesa para que
// drawPlayer/drawFallWarningMarks/drawRope esten disponibles.
//
// Depende de globales que declara el script principal de spiderswing.html: ctx, player,
// controlState, poseBlend, realTime, y de un par de funciones que tambien viven ahi
// (webHandTarget, localHandPoint, getInputVector). Todas se resuelven recien cuando estas
// funciones se LLAMAN (durante el loop de dibujo), nunca al cargarse este archivo, asi que da
// igual que este archivo se cargue (sincronicamente, vía document.write) antes de que el
// script principal siquiera exista todavia -- para cuando el loop arranca de verdad, todo ya
// esta declarado.
//
// computePlayerPose() calcula la pose (pies/manos) sin tocar el ctx y guarda la posicion en
// MUNDO de cada mano en player.leftHandWorld / player.rightHandWorld. El script principal la
// llama (indirectamente via drawPlayer, o llamandola ella misma antes) para saber de donde
// sale cada telaraña visualmente -- ver el loop de dibujo de telaranas en spiderswing.html.

// calcula la pose completa del jugador (pies, manos, hombros) en coordenadas LOCALES
// (relativas al monigote, antes de rotar/trasladar) segun el estado actual, y de paso guarda
// la posicion en MUNDO de cada mano en player.leftHandWorld / player.rightHandWorld. Es una
// funcion "pura" (no toca el ctx ni dibuja nada), asi que se puede llamar en cualquier momento
// del loop -- por ejemplo ANTES del dibujo de las telaranas, que necesita saber de donde sale
// cada mano -- sin depender de que drawPlayer ya se haya ejecutado ese frame. drawPlayer llama
// a esta misma funcion internamente para dibujar, asi que la pose usada para el render y la
// posicion de mano que ven las telaranas siempre estan sincronizadas (mismo calculo, una sola
// vez por lugar donde se necesite, ambos deterministas a partir del estado actual de player)
function computePlayerPose(){
  const walking = player.grounded && Math.abs(player.vx) > 15;
  const bracing = controlState === 'dragging'; // DETENIENDO: clavando los pies, nada que ver con caminar -- por eso se chequea ANTES que "walking" mas abajo, para ganarle
  const clinging = !!player.clinging;
  const leftTarget = webHandTarget('left');
  const rightTarget = webHandTarget('right');
  const swinging = !clinging && (leftTarget || rightTarget);

  const hip = {x:0, y:4};
  let leftFoot, rightFoot;
  if(clinging){
    if(player.clinging.atEdge){
      // en el borde: una mano y un pie bien agarrados de la esquina del edificio (hacia adentro),
      // el resto suelto colgando hacia afuera
      const s = player.clinging.edgeSide === 'left' ? 1 : -1;
      leftFoot  = {x: s*11, y: 12};
      rightFoot = {x: -s*4, y: 17};
    } else {
      // escalando en medio de la fachada: pies alternandose como en una trepada de verdad
      const cyc = player.climbCycle;
      leftFoot  = {x:-7, y: 13 + Math.sin(cyc)*3};
      rightFoot = {x: 7, y: 13 + Math.sin(cyc+Math.PI)*3};
    }
  } else if(player.attacking && player.attacking.type === 'kick'){
    // patada: la pierna derecha se estira hacia la direccion del golpe (adentro-afuera, como
    // un latigazo), mientras la izquierda queda de apoyo
    const atk = player.attacking;
    const phase = Math.min(1, atk.t/atk.dur);
    const extend = Math.sin(phase*Math.PI); // 0 -> 1 -> 0 a lo largo de toda la animacion
    const kp = localHandPoint(player.x+atk.dirX, player.y+atk.dirY, 9 + extend*11);
    rightFoot = {x: kp.x, y: kp.y};
    leftFoot  = {x: -4, y: 15};
  } else if(bracing){
    // DETENIENDO: piernas tensas, bien plantadas y corridas hacia ATRAS de la direccion del
    // arrastre (clavando los talones), nada de alternar como al caminar -- solo un temblor
    // sutil de la tension, no un ciclo de paso real
    const dragDir = player.dragTargetVx >= 0 ? 1 : -1;
    const brace = 12 + Math.sin(performance.now()*0.045)*1.5;
    leftFoot  = {x: -dragDir*brace - 3, y: 15};
    rightFoot = {x: -dragDir*brace + 5, y: 16};
  } else if(walking){
    const amp = 8;
    leftFoot  = {x: Math.sin(player.walkCycle)*amp,        y:14};
    rightFoot = {x: Math.sin(player.walkCycle+Math.PI)*amp, y:14};
  } else if(swinging){
    // los pies apuntan hacia el vector total que estas generando con WASD mientras te balanceas
    const input = getInputVector();
    let footX = 0, footY = 13;
    if(input.active){
      const cosT = Math.cos(player.rotation), sinT = Math.sin(player.rotation);
      const lx =  input.x*cosT + input.y*sinT;
      const ly = -input.x*sinT + input.y*cosT;
      const n = Math.hypot(lx,ly) || 1;
      const reach = 13;
      footX = (lx/n)*reach;
      footY = 4 + (ly/n)*reach;
    }
    leftFoot  = {x: footX-4, y: footY};
    rightFoot = {x: footX+4, y: footY};
    // al recostarse tipo hamaca (modo chill, poseBlend > 0), las piernas se cruzan una sobre
    // la otra en vez de quedar colgando sueltas: se interpola gradual, igual que el resto de la pose
    if(poseBlend > 0.001){
      const chillLeft  = {x: 9, y: 15}; // pierna de "abajo", estirada
      const chillRight = {x: 3, y: 10}; // pierna de "arriba", cruzada por encima
      leftFoot  = { x: leftFoot.x  + (chillLeft.x  - leftFoot.x)*poseBlend,  y: leftFoot.y  + (chillLeft.y  - leftFoot.y)*poseBlend };
      rightFoot = { x: rightFoot.x + (chillRight.x - rightFoot.x)*poseBlend, y: rightFoot.y + (chillRight.y - rightFoot.y)*poseBlend };
    }
  } else {
    // parado/en el aire normal: pies apenas separados, un poco mas si esta dando volteretas
    const spread = 4 + Math.min(7, Math.abs(player.angularVelocity)*1.2);
    leftFoot  = {x:-spread, y:14};
    rightFoot = {x: spread, y:14};
  }

  // brazos: cada mano apunta a SU telaraña (si tiene), o a la pose relajada si esa mano esta libre
  const leftShoulder  = {x:-2, y:-6};
  const rightShoulder = {x: 2, y:-6};
  const reach = 20;
  let leftHand, rightHand;
  if(clinging){
    if(player.clinging.atEdge){
      // en el borde: la mano que agarra estira HACIA la esquina del edificio (adentro), la otra
      // queda suelta colgando hacia afuera
      if(player.clinging.edgeSide === 'left'){
        rightHand = {x:11, y:-2}; // mano der agarrada (hacia el edificio)
        leftHand  = {x:-5, y:3};  // mano izq suelta
      } else {
        leftHand  = {x:-11, y:-2}; // mano izq agarrada (hacia el edificio)
        rightHand = {x:5, y:3};    // mano der suelta
      }
    } else {
      // escalando en medio: las dos manos arriba agarradas a la pared, alternando como al trepar
      const cyc = player.climbCycle;
      leftHand  = {x:-7, y: -11 + Math.sin(cyc)*3};
      rightHand = {x: 7, y: -11 + Math.sin(cyc+Math.PI)*3};
    }
  } else if(player.attacking && player.attacking.type === 'punch'){
    // puñetazo: la mano izquierda se dispara hacia la direccion del golpe, la derecha se queda relajada
    const atk = player.attacking;
    const phase = Math.min(1, atk.t/atk.dur);
    const extend = Math.sin(phase*Math.PI);
    leftHand  = localHandPoint(player.x+atk.dirX, player.y+atk.dirY, 10 + extend*13);
    rightHand = {x:5, y:3};
  } else if(swinging){
    // cada mano apunta a su telaraña (o cuelga relajada si esa mano esta libre); al recostarse
    // tipo hamaca (poseBlend > 0) se van curvando hacia atras de la cabeza en vez de quedar
    // estiradas sosteniendo la soga, como quien se acomoda para descansar
    let lx, ly, rx, ry;
    if(leftTarget){
      const hp = localHandPoint(leftTarget.x, leftTarget.y, reach);
      lx = hp.x; ly = hp.y;
    } else {
      lx = -5; ly = 3;
    }
    if(rightTarget){
      const hp = localHandPoint(rightTarget.x, rightTarget.y, reach);
      rx = hp.x; ry = hp.y;
    } else {
      rx = 5; ry = 3;
    }
    if(poseBlend > 0.001){
      const chillHandL = {x:-7, y:-16};
      const chillHandR = {x: 7, y:-16};
      lx += (chillHandL.x - lx)*poseBlend; ly += (chillHandL.y - ly)*poseBlend;
      rx += (chillHandR.x - rx)*poseBlend; ry += (chillHandR.y - ry)*poseBlend;
    }
    leftHand  = {x:lx, y:ly};
    rightHand = {x:rx, y:ry};
  } else if(walking){
    leftHand  = {x: Math.sin(player.walkCycle+Math.PI)*6, y:-2};
    rightHand = {x: Math.sin(player.walkCycle)*6, y:-2};
  } else {
    // pose normal de pie: brazos hacia abajo, pegados al cuerpo
    leftHand  = {x:-5, y:3};
    rightHand = {x:5, y:3};
  }

  // posicion en MUNDO de cada mano (rotando el punto local segun player.rotation y sumando la
  // posicion del cuerpo) -- esto es lo que usa el dibujo de telaranas para salir de la mano
  // real en vez de salir del centro del cuerpo
  const cosT = Math.cos(player.rotation), sinT = Math.sin(player.rotation);
  const toWorld = (p) => ({x: player.x + p.x*cosT - p.y*sinT, y: player.y + p.x*sinT + p.y*cosT});
  player.leftHandWorld  = toWorld(leftHand);
  player.rightHandWorld = toWorld(rightHand);

  return {hip, leftFoot, rightFoot, leftShoulder, rightShoulder, leftHand, rightHand};
}

// dibuja al monigote rojo, ya rotado y con la pose segun el estado (caminando/colgado/en el aire)
function drawPlayer(ctx){
  const pose = computePlayerPose();

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.rotation);
  ctx.strokeStyle = '#8f0d0d';
  ctx.fillStyle = '#c0392b';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';

  ctx.beginPath(); ctx.moveTo(pose.hip.x,pose.hip.y); ctx.lineTo(pose.leftFoot.x,pose.leftFoot.y);  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pose.hip.x,pose.hip.y); ctx.lineTo(pose.rightFoot.x,pose.rightFoot.y); ctx.stroke();

  // torso
  ctx.beginPath(); ctx.moveTo(0,-7); ctx.lineTo(0,4); ctx.stroke();

  ctx.beginPath(); ctx.moveTo(pose.leftShoulder.x,pose.leftShoulder.y);  ctx.lineTo(pose.leftHand.x,pose.leftHand.y);  ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pose.rightShoulder.x,pose.rightShoulder.y); ctx.lineTo(pose.rightHand.x,pose.rightHand.y); ctx.stroke();

  // cabeza
  ctx.beginPath(); ctx.arc(0,-11,5,0,Math.PI*2); ctx.fill();

  if(player.fallWarning) drawFallWarningMarks(ctx);

  ctx.restore();
}

// rayitas onduladas cerca de la cabeza cuando el aviso de caida esta activo (ver
// updateFallWarning): un par de garabatos tipo "vibracion" a los costados, animados rapido con
// el tiempo real (no ralentizado por el slowmo del sentido arácnido, para que el aviso siga
// sintiendose urgente aunque el resto del mundo este en camara lenta). Se dibujan DESPUES de
// rotar de vuelta -player.rotation, asi quedan siempre derechitas aunque el cuerpo este girando
// en pleno aire (como cualquier marca de HUD pegada a un personaje que gira)
function drawFallWarningMarks(ctx){
  ctx.save();
  ctx.translate(0, -11);
  ctx.rotate(-player.rotation);
  const phase = realTime*30;
  ctx.globalAlpha = 0.6 + 0.4*Math.sin(phase*1.6);
  ctx.strokeStyle = '#fff176';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  const drawSquiggle = (baseX, dir) => {
    ctx.beginPath();
    const segs = 5;
    for(let i=0;i<=segs;i++){
      const t = i/segs;
      const x = baseX + dir*t*8;
      const y = -9 - t*2 + Math.sin(phase + t*10)*2.2;
      if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  };
  drawSquiggle(-8, -1);
  drawSquiggle(8, 1);
  ctx.restore();
}

// dibuja una telaraña entre dos puntos; si "slack" (floja) es mayor a 0, la curva un poco (sag),
// como una soga real que no esta perfectamente tensa
function drawRope(x1,y1,x2,y2, slack, alpha, color){
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if(slack > 1){
    const mx = (x1+x2)/2, my = (y1+y2)/2;
    const sag = Math.min(slack*0.6, 90);
    ctx.moveTo(x1,y1);
    ctx.quadraticCurveTo(mx, my+sag, x2, y2);
  } else {
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
  }
  ctx.stroke();
  ctx.restore();
}
