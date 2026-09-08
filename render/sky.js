// render/sky.js -- todo lo que dibuja el fondo del mundo: gradiente de cielo, sol, montañas
// (con parallax) y nubes, todo atado a la hora real de la maquina (ver getDaylightInfo). Se
// carga via render/manifest.js (document.write, sincronico), asi que estas funciones ya estan
// disponibles para el resto del juego apenas arranca.

function hexToRgb(hex){
  const n = parseInt(hex.slice(1), 16);
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}
function lerpColor(a, b, t){
  t = Math.max(0, Math.min(1, t));
  const pa = hexToRgb(a), pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r-pa.r)*t);
  const g = Math.round(pa.g + (pb.g-pa.g)*t);
  const bl = Math.round(pa.b + (pb.b-pa.b)*t);
  return `rgb(${r},${g},${bl})`;
}

// calcula, a partir de la hora real de la maquina, donde deberia estar el sol y que tan
// "de dia" esta la luz ambiente (0 = noche cerrada, 1 = pleno dia), con un degradado suave
// alrededor del amanecer y el atardecer (ni el sol ni la luz cambian de golpe)
function getDaylightInfo(){
  const now = new Date();
  const hour = now.getHours() + now.getMinutes()/60 + now.getSeconds()/3600;

  const sunrise = 6.25, sunset = 18.75;  // horario aproximado (sin geolocalizacion)
  const span = 1.1;                      // duracion del degradado de amanecer/atardecer, en horas

  const sunT = (hour - sunrise) / (sunset - sunrise); // 0 al amanecer, 1 al atardecer
  const sunUp = sunT >= 0 && sunT <= 1;
  const sunArc = sunUp ? Math.sin(sunT*Math.PI) : 0;   // 0 en el horizonte, 1 en el cenit

  let dayLight = 0;
  if(hour >= sunrise && hour <= sunset) dayLight = 1;
  else if(hour >= sunrise-span && hour < sunrise) dayLight = (hour-(sunrise-span))/span;
  else if(hour > sunset && hour <= sunset+span) dayLight = 1-(hour-sunset)/span;
  dayLight = Math.max(0, Math.min(1, dayLight));

  // "warm": que tan cerca estamos de un amanecer/atardecer (pico en dayLight ~0.5), para el
  // tono anaranjado tipico de esas horas, tanto en el cielo como en el sol y las montañas
  const warm = Math.max(0, 1 - Math.abs(dayLight-0.5)*2.6);

  return {hour, sunT, sunUp, sunArc, dayLight, warm};
}

function drawSky(sky){
  const topColor = lerpColor('#050912', '#4fa8d8', sky.dayLight);
  let horizonColor = lerpColor('#141a33', '#bfe6f2', sky.dayLight);
  horizonColor = lerpColor(horizonColor, '#ff9a63', sky.warm*0.75);

  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, topColor);
  grad.addColorStop(1, horizonColor);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawSun(sky){
  if(!sky.sunUp) return; // de noche, simplemente no sale

  const sunX = canvas.width * (0.06 + 0.88*sky.sunT);
  const horizonY = canvas.height*0.56, peakY = canvas.height*0.10;
  const sunY = horizonY - sky.sunArc*(horizonY - peakY);
  const sunColor = lerpColor('#ff7b42', '#fff6d6', sky.sunArc);

  ctx.save();
  ctx.shadowColor = sunColor;
  ctx.shadowBlur = 45;
  ctx.fillStyle = sunColor;
  ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

// perfil de montañas simple: combina un par de senos de distinta frecuencia para que no se
// vea un zigzag perfecto, pero tampoco haga falta guardar un array gigante de puntos
function mountainHeight(x, freqScale){
  return Math.sin(x*0.0021*freqScale)*34 + Math.sin(x*0.0007*freqScale + 1.6)*58;
}

function drawMountainLayer(sky, baseYFrac, ampScale, freqScale, parallax, color){
  const baseY = canvas.height*baseYFrac;
  const originX = camera.x*parallax;
  const step = 48;

  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  for(let sx = 0; sx <= canvas.width+step; sx += step){
    const h = Math.max(0, mountainHeight(sx+originX, freqScale))*ampScale;
    ctx.lineTo(sx, baseY - h);
  }
  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawMountains(sky){
  let far  = lerpColor('#141c33', '#7c96ad', sky.dayLight);
  let near = lerpColor('#0c1220', '#5c7a92', sky.dayLight);
  far  = lerpColor(far,  '#8a6b86', sky.warm*0.5);
  near = lerpColor(near, '#6b5468', sky.warm*0.5);

  drawMountainLayer(sky, 0.60, 0.7, 1.0, 0.035, far);
  drawMountainLayer(sky, 0.63, 1.0, 1.6, 0.08,  near);
}

// nubes simples: cada una es un puñado de elipses superpuestas, y se van repitiendo (con
// wraparound) a lo largo de un periodo bastante mas ancho que la pantalla
const CLOUD_LAYER = [
  {ox: 120,  oy: 0.14, s: 1.0},
  {ox: 620,  oy: 0.23, s: 0.7},
  {ox: 1080, oy: 0.10, s: 1.25},
  {ox: 1520, oy: 0.27, s: 0.8},
  {ox: 1980, oy: 0.17, s: 1.05},
];
const CLOUD_PERIOD = 2400;

function drawCloudBlob(x, y, scale){
  ctx.beginPath();
  ctx.ellipse(x,        y,       34*scale, 14*scale, 0, 0, Math.PI*2);
  ctx.ellipse(x+22*scale, y-6*scale, 22*scale, 12*scale, 0, 0, Math.PI*2);
  ctx.ellipse(x-24*scale, y-4*scale, 20*scale, 11*scale, 0, 0, Math.PI*2);
  ctx.fill();
}

function drawClouds(sky){
  const parallax = 0.12;
  const drift = performance.now()*0.0025; // deriva lenta y constante, independiente de la camara
  const scrollX = camera.x*parallax + drift;
  const cloudColor = lerpColor('#3a3f55', '#ffffff', sky.dayLight);

  ctx.save();
  ctx.globalAlpha = 0.82;
  ctx.fillStyle = cloudColor;
  const repeats = Math.ceil(canvas.width/CLOUD_PERIOD) + 2;
  for(const c of CLOUD_LAYER){
    const base = ((c.ox - scrollX) % CLOUD_PERIOD + CLOUD_PERIOD) % CLOUD_PERIOD;
    for(let i=-1; i<repeats; i++){
      const sx = base + i*CLOUD_PERIOD;
      if(sx < -80 || sx > canvas.width+80) continue;
      drawCloudBlob(sx, canvas.height*c.oy, c.s);
    }
  }
  ctx.restore();
}
