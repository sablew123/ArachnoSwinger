// world/structures/buildings.js
// Genera los edificios de la ciudad. Los tres "sabores" que existen hoy comparten el MISMO
// esqueleto de colocacion (ancho, gap minimo garantizado entre uno y el siguiente, corte en el
// borde del chunk para que nunca se combinen dos edificios de chunks vecinos, ver el comentario
// mas abajo) y todos siguen naciendo con type:'building' (asi el resto del motor -- colisiones,
// escalar paredes, telaraña, el array buildings[] que arma chunks.js -- los sigue tratando
// exactamente igual, sin enterarse de nada nuevo). Lo unico que cambia entre uno y otro es su
// `kind`, que es lo que el RENDER necesita mirar para saber COMO dibujar cada uno:
//
//   - 'apartment' -- el edificio original de siempre (ahora con nombre propio): ventanitas
//                    chicas, cada una prendida o apagada al azar, a veces con balcones.
//   - 'office'    -- ventanales grandes tipo cortina de vidrio: en vez de una ventanita por
//                    columna, cada piso es UN panel que ocupa casi todo el ancho del edificio
//                    (b.panels), dividido en "segments" -- la cantidad se mide con la MISMA
//                    formula que ya usabamos para contar columnas de ventanas chicas (WINDOW_W
//                    como unidad), asi la densidad visual queda equivalente. El vidrio de cada
//                    oficina es de un color fijo (b.glassColor) elegido de una paleta "deluxe"
//                    (morados, celestes, verdosos).
//   - 'hospital'  -- siempre alto (nunca nace bajito, a proposito: ver HOSPITAL_H_MIN), blanco
//                    (b.color), con ventanas azuladas (b.windowColor) y una cruz roja grande
//                    arriba (b.cross). Es el mas raro de los tres a proposito (HOSPITAL_CHANCE
//                    bajo), asi no hay uno en cada chunk -- pero como todo sale de
//                    rng(chunkIndex), el que le toca a un chunk le toca SIEMPRE, en el mismo
//                    lugar (mismo chunk = mismo hospital, siempre).
//
// que kind le toca a cada edificio se decide UNA vez por edificio (no por chunk entero), tirando
// un solo rng() cuando el loop de colocacion arranca uno nuevo -- por eso "reemplazar"
// apartamentos por hospitales/oficinas no rompe el determinismo ni el chequeo de "nunca se
// tocan": la posicion y el ancho se siguen calculando exactamente igual sea cual sea el kind que
// le toque, solo cambia la altura y el contenido (ventanas/paneles/cruz).
//
// WINDOW_W/WINDOW_H quedan como constantes GLOBALES (no encerradas en un IIFE) a proposito: el
// render principal tambien las necesita para dibujar tanto las ventanitas de apartamentos/
// hospitales como (con la misma medida, usada para contar segments) los ventanales de oficina.
const WINDOW_W = 14, WINDOW_H = 18; // tamaño de cada ventanita / unidad de medida para segmentos de ventanales

// ancho de los edificios y gap MINIMO garantizado entre uno y el siguiente (incluyendo en el
// borde entre chunks, ver mas abajo): al ser siempre positivo, dos edificios nunca pueden llegar
// a tocarse ni superponerse. Es el mismo rango para los tres kinds -- lo que cambia con el kind
// es la ALTURA, no el ancho ni el gap.
const BUILDING_W_MIN = 320, BUILDING_W_MAX = 480;
const BUILDING_GAP_MIN = 60, BUILDING_GAP_MAX = 140;

// altura: cada kind tiene su propio rango. El del hospital arranca mas arriba que el piso
// MINIMO de los otros dos, para garantizar que "siempre nace alto" (nunca hay un hospital bajito).
const APARTMENT_H_MIN = 900,  APARTMENT_H_MAX = 2800;
const OFFICE_H_MIN    = 1000, OFFICE_H_MAX    = 2700;
const HOSPITAL_H_MIN  = 1700, HOSPITAL_H_MAX  = 2600;

// probabilidad (determinista, sale de rng(chunkIndex)) de que un edificio dado nazca hospital u
// oficina en vez del apartamento de siempre. Se chequean EN ESTE ORDEN (hospital primero, con
// UN solo rng() por edificio): un mismo numero nunca puede activar los dos a la vez, y lo que
// sobra (1 - HOSPITAL_CHANCE - OFFICE_CHANCE) sigue siendo apartamento, el default de la ciudad.
const HOSPITAL_CHANCE = 0.04; // ~1 cada 25 edificios: raro a proposito, no uno por chunk
const OFFICE_CHANCE   = 0.28; // bastante mas comun que el hospital, pero sin opacar al apartamento

const AD_TEXTS = ['CosCorp', 'Vertex Capital', 'Nébula Systems', 'Banco Aurum', 'Órbita Legal', 'Zenith & Asoc.', 'Kronos Digital'];

// estilos de letrero disponibles -- el render (spiderswing.html) sabe dibujar cada uno con su
// propia tipografia/color/efecto, sin cuadrado de fondo: algunos con contorno prolijo tipo
// corporativo, otros en plan neon con resplandor. Se elige uno al azar por letrero (no por
// empresa: el mismo "CosCorp" puede salir neon en un edificio y con contorno dorado en otro)
const BILLBOARD_STYLES = ['neon-pink', 'neon-cyan', 'neon-green', 'outline-gold', 'outline-white', 'corporate-clean'];

// paleta de vidrio "deluxe" para las oficinas: UN color fijo por edificio (no por panel/ventana),
// asi cada torre de oficinas se lee como una sola fachada de vidrio de un solo tono.
const OFFICE_GLASS_COLORS = ['#8E7CC3', '#6FB8DE', '#6FCF97', '#B39DDB', '#4FC3F7', '#5FD3C4'];

// paleta fija (no varia por rng) de los hospitales: asi cualquier hospital se reconoce de lejos
// por su propia combinacion de colores, ademas de la cruz.
const HOSPITAL_WINDOW_COLOR = '#BEE7F5';
const HOSPITAL_COLOR = '#F5F7FA'; // blanco (ligeramente off-white) del cuerpo del edificio

registerWorldStructureGenerator(function generateBuildings(ctx){
  const {index, startX, endX, rng, structures, platforms} = ctx;

  const chunkBuildings = []; // solo para el chequeo de "al menos un CosCorp" al final de esta funcion
  let hasCosCorp = false;

  // el primer chunk (0) arranca en x=50 igual que la ciudad original, para no tapar el spawn.
  // en los demas, arrancamos con el MISMO gap minimo que usamos entre edificios (en vez de
  // pegado justo al borde startX): asi el ultimo edificio del chunk anterior y el primero de
  // este quedan separados igual que cualquier otro par, nunca pegados.
  let x = (index === 0) ? 50 : startX + BUILDING_GAP_MIN + rng()*(BUILDING_GAP_MAX-BUILDING_GAP_MIN);
  while(x < endX - 50){
    const w = BUILDING_W_MIN + rng()*(BUILDING_W_MAX-BUILDING_W_MIN);
    // si este edificio, con su ancho completo, se pasaria del borde del chunk (endX), lo
    // cortamos aca: no lo generamos, y que nazca en el chunk siguiente (que ya arranca con su
    // propio gap, ver arriba). ESTE era el origen del bug de "edificios combinados": antes se
    // dejaba nacer un edificio que cruzaba el limite del chunk, y el chunk vecino generaba otro
    // edificio pisandole ese mismo espacio sin saber que ya estaba ocupado.
    if(x + w > endX - 40) break;

    // que kind le toca a ESTE edificio -- un solo rng(), siempre en el mismo orden de chequeo
    // (hospital, despues oficina, si no ninguno de los dos entonces apartamento).
    const kindRoll = rng();
    const kind = kindRoll < HOSPITAL_CHANCE ? 'hospital'
               : kindRoll < HOSPITAL_CHANCE + OFFICE_CHANCE ? 'office'
               : 'apartment';

    const h = kind === 'hospital' ? HOSPITAL_H_MIN  + rng()*(HOSPITAL_H_MAX-HOSPITAL_H_MIN)
            : kind === 'office'   ? OFFICE_H_MIN    + rng()*(OFFICE_H_MAX-OFFICE_H_MIN)
            :                       APARTMENT_H_MIN + rng()*(APARTMENT_H_MAX-APARTMENT_H_MIN);

    const b = {type: 'building', kind, x, y: STREET_Y - h, w, h};

    if(kind === 'office'){
      // ventanales grandes tipo cortina de vidrio: UN panel por piso (en vez de una ventanita
      // por columna), que ocupa casi todo el ancho del edificio, dividido en "segments". La
      // cantidad de segmentos se mide con la MISMA formula que usabamos para contar columnas de
      // ventanas chicas (WINDOW_W como unidad), asi la densidad visual queda equivalente.
      const padX = 20, padY = 24, gapY = 22;
      const panelH = WINDOW_H * 2.4; // un panel de piso a techo, mas alto que una ventanita comun
      b.glassColor = OFFICE_GLASS_COLORS[Math.floor(rng()*OFFICE_GLASS_COLORS.length)];
      b.panels = [];
      const rows = Math.max(1, Math.floor((h - padY*2 + gapY) / (panelH+gapY)));
      const segments = Math.max(2, Math.floor((w - padX*2) / WINDOW_W));
      b.windowRows = rows; // filas de "ventanas" (paneles) en Y -- usado por world/interiors.js
                            // para que la cantidad de pisos del interior sea windowRows+1
      for(let r=0;r<rows;r++){
        b.panels.push({x: padX, y: padY + r*(panelH+gapY), w: w - padX*2, h: panelH, segments});
      }
    } else {
      // apartamento u hospital: la misma grilla de ventanitas chicas de siempre. La diferencia
      // entre los dos es solo de color -- el hospital fuerza un azulado fijo (b.windowColor) y
      // un cuerpo blanco (b.color); el apartamento se deja sin color explicito (el render usa su
      // default de siempre: prendida/apagada al azar).
      b.windows = [];
      const padX = 16, padY = 24, gapX = 12, gapY = 20;
      const cols = Math.max(1, Math.floor((w - padX*2 + gapX) / (WINDOW_W+gapX)));
      const rows = Math.max(1, Math.floor((h - padY*2 + gapY) / (WINDOW_H+gapY)));
      b.windowRows = rows; // filas de ventanas en Y -- usado por world/interiors.js para que la
                            // cantidad de pisos del interior sea windowRows+1
      for(let r=0;r<rows;r++){
        for(let c=0;c<cols;c++){
          b.windows.push({x: padX + c*(WINDOW_W+gapX), y: padY + r*(WINDOW_H+gapY), lit: rng() < 0.25});
        }
      }
      if(kind === 'hospital'){
        b.windowColor = HOSPITAL_WINDOW_COLOR;
        b.color = HOSPITAL_COLOR;
        // cruz roja grande arriba del edificio: tamaño proporcional al ancho (nunca mas ancha
        // que el edificio), centrada horizontalmente, pegada cerca de la punta del techo.
        const crossSize = Math.min(70, w*0.32);
        b.cross = {cx: x + w/2, cy: b.y + crossSize*0.9, size: crossSize, color: '#E23B3B'};
      }
    }

    // publicidad: SOLO en oficinas (apartamentos y hospitales no llevan letrero -- el hospital
    // ya tiene su cruz). Cada letrero guarda su texto Y su estilo (b.billboard = {text, style}),
    // asi el mismo edificio no siempre se dibuja igual: ver BILLBOARD_STYLES arriba y el render
    // en spiderswing.html
    if(kind === 'office' && rng() < 0.12){
      const text = AD_TEXTS[Math.floor(rng()*AD_TEXTS.length)];
      const style = BILLBOARD_STYLES[Math.floor(rng()*BILLBOARD_STYLES.length)];
      b.billboard = {text, style};
      if(text === 'CosCorp') hasCosCorp = true;
    }

    structures.push(b);
    chunkBuildings.push(b);
    platforms.push({x: b.x, y: b.y, w: b.w});

    // balcones: solo los apartamentos los tienen (ni oficinas -- vidrio corrido -- ni
    // hospitales tiene mucho sentido que lleven uno colgando)
    if(kind === 'apartment'){
      const numBalconies = 1 + Math.floor(rng()*3);
      for(let i=0;i<numBalconies;i++){
        const frac = 0.2 + rng()*0.6;
        const by = b.y + b.h*frac;
        const bw = 55;
        const side = rng()<0.5 ? -1 : 1;
        const bx = side < 0 ? (b.x - bw*0.6) : (b.x + b.w - bw*0.4);
        platforms.push({x: bx, y: by, w: bw, balcony: true});
      }
    }

    x += w + BUILDING_GAP_MIN + rng()*(BUILDING_GAP_MAX-BUILDING_GAP_MIN);
  }

  // que cada chunk tenga si o si al menos un CosCorp en algun lado -- ahora SOLO entre las
  // oficinas del chunk (los letreros son exclusivos de ese kind); si el chunk no genero ninguna
  // oficina, no hay donde forzarlo y ese chunk se queda sin CosCorp esta vez, nomas
  if(!hasCosCorp && chunkBuildings.length){
    const offices = chunkBuildings.filter(b => b.kind === 'office');
    const pick = offices.length ? offices[Math.floor(rng()*offices.length)] : null;
    if(pick) pick.billboard = {text: 'CosCorp', style: BILLBOARD_STYLES[Math.floor(rng()*BILLBOARD_STYLES.length)]};
  }
});
