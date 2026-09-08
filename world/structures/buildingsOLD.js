// world/structures/buildings.js
// genera los edificios (con ventanas y cartel opcional) + sus plataformas de techo/balcon, y
// las registra como estructuras de type:'building' (ver world/registry.js). Es el primer
// generador de estructuras del juego, pero el mecanismo esta pensado para que no sea el unico:
// cualquier archivo nuevo en world/structures/ que llame a registerWorldStructureGenerator hace
// exactamente lo mismo que este, con su propio `type`.
//
// WINDOW_W/WINDOW_H quedan como constantes GLOBALES (no encerradas en un IIFE) a proposito: el
// render principal (ver el <script> inline del HTML, donde se dibujan las ventanitas de cada
// edificio) tambien las necesita.
const WINDOW_W = 14, WINDOW_H = 18; // tamaño de cada ventanita de los edificios

// ancho de los edificios y gap MINIMO garantizado entre uno y el siguiente (incluyendo en el
// borde entre chunks, ver mas abajo): al ser siempre positivo, dos edificios nunca pueden llegar
// a tocarse ni superponerse.
const BUILDING_W_MIN = 320, BUILDING_W_MAX = 480;
const BUILDING_GAP_MIN = 60, BUILDING_GAP_MAX = 140;
const AD_TEXTS = ['CosCorp', 'Café Central', 'SuperJabón', 'Lentes 2x1', 'Pizza del Barrio', 'Gimnasio Titán'];

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
    const h = 900 + rng()*1900; // edificios altos de base (antes arrancaban muy bajitos): ahora el piso normal ya es un rascacielos
    const b = {type: 'building', x, y: STREET_Y - h, w, h};

    b.windows = [];
    const padX = 16, padY = 24, gapX = 12, gapY = 20;
    const cols = Math.max(1, Math.floor((w - padX*2 + gapX) / (WINDOW_W+gapX)));
    const rows = Math.max(1, Math.floor((h - padY*2 + gapY) / (WINDOW_H+gapY)));
    for(let r=0;r<rows;r++){
      for(let c=0;c<cols;c++){
        b.windows.push({
          x: padX + c*(WINDOW_W+gapX),
          y: padY + r*(WINDOW_H+gapY),
          lit: rng() < 0.25
        });
      }
    }

    if(h > 650 && rng() < 0.12){
      const text = AD_TEXTS[Math.floor(rng()*AD_TEXTS.length)];
      b.billboard = text;
      if(text === 'CosCorp') hasCosCorp = true;
    }

    structures.push(b);
    chunkBuildings.push(b);
    platforms.push({x: b.x, y: b.y, w: b.w});

    const numBalconies = 1 + Math.floor(rng()*3);
    for(let i=0;i<numBalconies;i++){
      const frac = 0.2 + rng()*0.6;
      const by = b.y + b.h*frac;
      const bw = 55;
      const side = rng()<0.5 ? -1 : 1;
      const bx = side < 0 ? (b.x - bw*0.6) : (b.x + b.w - bw*0.4);
      platforms.push({x: bx, y: by, w: bw, balcony: true});
    }

    x += w + BUILDING_GAP_MIN + rng()*(BUILDING_GAP_MAX-BUILDING_GAP_MIN);
  }

  // que cada chunk tenga si o si al menos un CosCorp en algun lado
  if(!hasCosCorp && chunkBuildings.length){
    const tall = chunkBuildings.filter(b => b.h > 650);
    const pick = tall.length ? tall[Math.floor(rng()*tall.length)] : chunkBuildings[Math.floor(rng()*chunkBuildings.length)];
    if(pick) pick.billboard = 'CosCorp';
  }
});
