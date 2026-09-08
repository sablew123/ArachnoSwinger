// render/hud.js -- capa de HUD en espacio de pantalla: vignette de sentido aracnido, barra de
// vida, contador de telaraña restante y pantalla de GAME OVER. Se carga via render/manifest.js
// (document.write, sincronico), asi que estas funciones ya estan disponibles para el resto del
// juego apenas arranca.

// dibuja el circulo de oscuridad temblorosa centrado en el jugador (en espacio de pantalla).
// la intensidad depende de cuan metido estas en el bullet time; el radio tiembla con tiempo
// real para que se note vivo incluso cuando el resto del juego esta casi congelado
function drawSpiderSenseVignette(){
  const intensity = Math.max(0, Math.min(1, (1 - timeScale) / (1 - SLOWMO_TARGET)));
  if(intensity <= 0.002) return;

  const cx = player.x - camera.x, cy = player.y - camera.y;
  const jitter = Math.sin(realTime*16)*7 + Math.sin(realTime*27 + 1.7)*4 + Math.sin(realTime*41 + 0.5)*2;
  const innerR = Math.max(30, 150 - intensity*40 + jitter);
  const outerR = Math.max(canvas.width, canvas.height) * 0.72;

  ctx.save();
  const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
  grad.addColorStop(0, 'rgba(5,5,15,0)');
  grad.addColorStop(1, `rgba(5,5,15,${0.88*intensity})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // un aro sutil, tambien tembloroso, marcando el borde del "foco" de atencion
  ctx.globalAlpha = intensity*0.5;
  ctx.strokeStyle = '#8fd6ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR + 3, 0, Math.PI*2);
  ctx.stroke();
  ctx.restore();
}

// barra de vida simple: una sola barra larga (nada de vidas/corazones separados), esquina
// superior izquierda, en espacio de pantalla. A proposito poco estilizada: fondo oscuro, marco
// fino, relleno segun el % de vida (verde -> amarillo -> rojo segun baja)
const HP_BAR_X = 16, HP_BAR_Y = 16, HP_BAR_W = 240, HP_BAR_H = 18;
function drawPlayerHpBar(){
  const frac = Math.max(0, Math.min(1, player.hp / player.maxHp));
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(HP_BAR_X-3, HP_BAR_Y-3, HP_BAR_W+6, HP_BAR_H+6);

  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(HP_BAR_X, HP_BAR_Y, HP_BAR_W, HP_BAR_H);

  const color = frac > 0.5 ? '#43b581' : (frac > 0.25 ? '#e6b800' : '#d64545');
  ctx.fillStyle = color;
  ctx.fillRect(HP_BAR_X, HP_BAR_Y, HP_BAR_W*frac, HP_BAR_H);

  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(HP_BAR_X+0.5, HP_BAR_Y+0.5, HP_BAR_W-1, HP_BAR_H-1);
  ctx.restore();
}

// contador de telaraña restante EN METROS, uno por mano (son dos lanzatelarañas
// independientes, cada uno con su propio tanque): dos cuadraditos en la misma fila arriba a
// la derecha -- el de la IZQUIERDA queda a la izquierda del bloque, el de la DERECHA a la
// derecha (asi la posicion ya te dice cual es cual, sin necesidad de escribir "IZQ"/"DER").
// Formato "###.##/###.##" (metros que quedan / capacidad maxima de esa mano), gris clarito
// sobre fondo oscuro semitransparente. Si el webType activo es infinito (Tobey, o si
// controls.json no trajo nada de esto), esta funcion no dibuja absolutamente nada -- las
// telarañas organicas no necesitan contador, son infinitas como siempre.
//
// cada numero se pinta en rojo un ratito (WEB_METERS_FLASH_MS) cada vez que ESA mano gasta
// metros de verdad (ver consumeWebAmmo en webSling.js, que es quien pisa
// webMetersFlashUntil[hand]) -- gastar la derecha no hace flashear el numero de la izquierda
const WEB_METERS_PANEL_W = 96;
const WEB_METERS_PANEL_H = 26;
const WEB_METERS_PANEL_GAP = 6;   // espacio entre el panel izquierdo y el derecho
const WEB_METERS_HUD_MARGIN = 12;
const WEB_METERS_COLOR = '#c9c9c9';       // gris claro, estado normal
const WEB_METERS_FLASH_COLOR = '#e35a5a'; // rojo, el ratito justo despues de gastar
function drawWebAmmoHUD(){
  const cfg = CONTROLS.webTypes && CONTROLS.webTypes[CONTROLS.webType];
  if(!cfg || cfg.infinite) return;

  const blockW = WEB_METERS_PANEL_W*2 + WEB_METERS_PANEL_GAP;
  const y = WEB_METERS_HUD_MARGIN;
  const xLeftPanel = canvas.width - WEB_METERS_HUD_MARGIN - blockW;
  const xRightPanel = xLeftPanel + WEB_METERS_PANEL_W + WEB_METERS_PANEL_GAP;

  ctx.save();
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const now = performance.now();
  const hands = [
    { hand: 'left',  x: xLeftPanel },
    { hand: 'right', x: xRightPanel }
  ];
  for(const {hand, x} of hands){
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x, y, WEB_METERS_PANEL_W, WEB_METERS_PANEL_H);

    const flashing = webMetersFlashUntil && now < webMetersFlashUntil[hand];
    ctx.fillStyle = flashing ? WEB_METERS_FLASH_COLOR : WEB_METERS_COLOR;
    ctx.fillText(webMeters[hand].toFixed(2) + '/' + cfg.maxMeters[hand].toFixed(2), x + WEB_METERS_PANEL_W/2, y + WEB_METERS_PANEL_H/2 + 1);
  }
  ctx.restore();
}

// pantalla simple de GAME OVER: fondo oscuro tapando todo, titulo en rojo y la instruccion de
// reinicio. Nada de esto usa espacio de camara (es HUD, en espacio de pantalla)
function drawGameOverScreen(){
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#d64545';
  ctx.font = 'bold 64px sans-serif';
  ctx.fillText('GAME OVER', canvas.width/2, canvas.height/2 - 24);

  ctx.fillStyle = '#ffffff';
  ctx.font = '22px sans-serif';
  ctx.fillText('Reiniciar pulsando ENTER', canvas.width/2, canvas.height/2 + 28);

  ctx.restore();
}
