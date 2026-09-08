// ============================================================================
//  entities/jaryman.js
// ----------------------------------------------------------------------------
//  Jary Mane (JM): un PERSONAJE especial, no un civil mas. Se invoca pulsando
//  555 (tres toques seguidos de la tecla "5", en menos de SUMMON_WINDOW_MS) y
//  aparece parada en la calle, en medio de algun edificio del chunk donde
//  este el jugador en ese momento.
//
//  En TODO lo demas (caminar, pausar, ida-y-vuelta, charlar con otros
//  civiles, asustarse, engancharse con la telaraña, cargarla en brazos,
//  daño de caida, etc.) se comporta exactamente como un 'civil' comun: en
//  vez de reimplementar toda esa IA de nuevo aca, este archivo toma el tipo
//  'civil' ya registrado por civiles.js (por eso jaryman.js tiene que ir
//  DESPUES en entities/manifest.js) y lo reutiliza tal cual, solo pisando su
//  apariencia (fija, no aleatoria) y agregandole pelo -- es la unica con
//  pelo en la cabeza de todo el juego.
//
//  Lo que SI la hace especial, y que este archivo maneja por su cuenta:
//    - Solo puede haber una Jary Mane invocada a la vez: 555 no hace nada
//      si ya esta invocada (viva en algun lado, aunque su chunk este
//      descargado ahora mismo).
//    - La UNICA forma de "desinvocarla" es que muera (mismo mecanismo que
//      cualquier civil: daño de caida letal -- es invulnerable a golpes y
//      proyectiles, igual que ellos). Recien ahi 555 vuelve a funcionar.
//    - Si descargas el chunk en el que este parada, no muere ni desaparece
//      del todo: queda "suspendida" en esa coordenada exacta, y reaparece
//      ahi mismo en cuanto ese chunk se vuelva a cargar.
//    - Mientras este cargada (su chunk activo) y fuera de la pantalla,
//      se dibuja un circulo con una flechita y las letras "JM" en el borde
//      de la pantalla, apuntando hacia donde esta -- para poder encontrarla.
// ============================================================================

(function(){

  // ---------- apariencia fija (no aleatoria, a diferencia de los civiles comunes) ----------
  const JM_SKIN  = '#f4d3ae';   // piel clara
  const JM_SHIRT = '#1abc9c';   // turquesa, brazos y torso
  const JM_PANTS = '#4a76b0';   // blue jean clasico
  const JM_HAIR  = '#b5451f';   // pelirrojo/rojizo -- la unica con pelo en la cabeza

  // ---------- invocacion: tres toques seguidos de "5" ----------
  const SUMMON_WINDOW_MS = 1400; // los 3 toques tienen que caer dentro de esta ventana
  let digit5Times = [];

  // ---------- estado persistente de Jary Mane, UNICO en todo el juego ----------
  // vive fuera de `entities` a proposito: cuando su chunk se descarga la sacamos de `entities`
  // (para que deje de simularse/dibujarse, igual que cualquier otra cosa fuera de los chunks
  // cargados) pero jm.x/jm.y se quedan con su ultima posicion real, asi que cuando el chunk
  // vuelve a cargar sabemos exactamente donde reaparecerla -- ver los listeners de chunk mas abajo.
  const jm = {
    invoked: false,     // true desde que se invoca hasta que muere (aunque este suspendida)
    suspended: false,   // true si su chunk esta descargado ahora mismo (invoked sigue en true)
    entity: null,        // instancia viva en `entities`, o null si no esta invocada o esta suspendida
    x: 0, y: 0,          // ultima posicion conocida (para el respawn al recargar su chunk)
    homeChunk: null      // indice de chunk en el que quedo parada
  };

  // ---------- reinicio completo del juego (ver resetWorld() en el motor) ----------
  // el reset del motor ya vacia `entities` solo (asi que la instancia viva de JM, si habia,
  // desaparece con todo lo demas) pero eso NO le avisa nada a este closure -- sin esto, jm.invoked
  // se quedaba en true para siempre despues de un reinicio, y 555 dejaba de funcionar
  window.RESET_LISTENERS = window.RESET_LISTENERS || [];
  window.RESET_LISTENERS.push(function(){
    jm.invoked = false;
    jm.suspended = false;
    jm.entity = null;
    jm.x = 0; jm.y = 0;
    jm.homeChunk = null;
    digit5Times = [];
  });

  window.addEventListener('keydown', function(ev){
    if(ev.code !== 'Digit5' || ev.repeat) return;
    const now = performance.now();
    digit5Times.push(now);
    digit5Times = digit5Times.filter(t => now - t <= SUMMON_WINDOW_MS);
    if(digit5Times.length >= 3){
      digit5Times = [];
      trySummon();
    }
  });

  function trySummon(){
    if(typeof gameOver !== 'undefined' && gameOver) return; // con la pantalla de GAME OVER puesta, no
    if(jm.invoked) return;                                    // ya esta invocada en algun lado: 555 no hace nada

    const spot = pickSpawnSpot();
    materializeJM(spot.x, spot.y);
    jm.invoked = true;
  }

  // crea (o recrea) la instancia viva de JM en x,y y actualiza jm.entity/jm.x/jm.y/jm.homeChunk
  // en consecuencia -- lo mismo que hacian trySummon y el CHUNK_LOAD_LISTENERS por separado,
  // ahora en un solo lugar para no repetir los mismos 4 argumentos de apariencia dos veces.
  // extra: opts para pisar campos puntuales de la instancia (ej. vx/vy, para que salga volando
  // por inercia si algo la solto en pleno aire -- ver window.respawnJaryMane mas abajo).
  function materializeJM(x, y, opts){
    const e = spawnEntity('jaryman', x, y, Object.assign({
      skinColor: JM_SKIN, shirtColor: JM_SHIRT, pantsColor: JM_PANTS
    }, opts));
    if(!e) return null; // el tipo 'jaryman' no llego a registrarse (ver mas abajo): no hay nada que invocar
    jm.suspended = false;
    jm.entity    = e;
    jm.x = x; jm.y = y;
    jm.homeChunk = Math.floor(x / CHUNK_WIDTH);
    return e;
  }

  // getter de solo lectura para quien necesite saber donde/como esta JM ahora mismo (ej. el
  // boss, para saber si sigue en pantalla durante el rescate) sin poder pisarle el estado interno
  window.getJaryManeEntity = function(){ return (jm.invoked && !jm.suspended) ? jm.entity : null; };

  // reaparece a JM en otro punto sin pasar por 555 -- pensado para cuando algo externo (el boss,
  // ver entities/crazylimemonster.js) la suelta en el aire: sigue "invocada" todo el tiempo (no
  // hace falta tocar jm.invoked, nunca dejo de estarlo), solo cambia donde/como vive ahora. Si
  // por lo que sea no esta invocada (nunca la llamaron, o ya murio), no hace nada -- no es forma
  // de invocarla de cero, para eso esta 555.
  window.respawnJaryMane = function(x, y, opts){
    if(!jm.invoked) return null;
    return materializeJM(x, y, opts);
  };

  // elige donde aparece: el centro de algun edificio del chunk en el que este el jugador ahora
  // mismo (si hay varios, uno al azar -- asi no siempre es "el primero de la calle" y tiene
  // sentido el indicador JM para encontrarla). Si por lo que sea el chunk actual no tiene
  // ningun edificio cargado todavia, resguardo: aparece a la altura del jugador.
  function pickSpawnSpot(){
    const chunkIndex  = Math.floor(player.x / CHUNK_WIDTH);
    const chunkStartX = chunkIndex * CHUNK_WIDTH;
    const chunkEndX   = chunkStartX + CHUNK_WIDTH;

    const candidates = buildings.filter(b => {
      const midX = b.x + b.w/2;
      return midX >= chunkStartX && midX < chunkEndX;
    });

    let bx = player.x;
    if(candidates.length){
      const b = candidates[Math.floor(Math.random()*candidates.length)];
      bx = b.x + b.w/2;
    }

    const hitR = (ENTITY_TYPES['jaryman'] && ENTITY_TYPES['jaryman'].hitRadius) || 14;
    return {x: bx, y: STREET_Y - hitR};
  }

  // ---------- registro del tipo: clona 'civil' entero (misma fisica, mismos estados, mismas
  // reacciones) y solo pisa el dibujo (para agregarle el pelo) y la muerte (para que además
  // libere el estado de invocacion) ----------
  const civilDef = ENTITY_TYPES['civil'];
  if(!civilDef){
    console.warn('jaryman.js: no se encontro el tipo "civil" -- revisa que civiles.js este ANTES que jaryman.js en entities/manifest.js');
  } else {
    const civilDraw    = civilDef.draw;
    const civilOnDeath = civilDef.onDeath;

    registerEntityType('jaryman', Object.assign({}, civilDef, {
      draw(ctx, e){
        civilDraw(ctx, e); // mismo cuerpo/animacion que cualquier civil (caminando, cargada, muerta, etc.)
        // el pelo solo tiene sentido con la cabeza "normal" a la vista -- en 'dead'/'lyingDown'
        // drawCivil ya cambia todo a la paleta roja de la animacion de muerte / cae de bruces,
        // asi que ahi no le agregamos nada encima
        if(e.state !== 'dead' && e.state !== 'lyingDown') drawHair(ctx, e);
      },
      onDeath(e){
        civilOnDeath(e); // misma animacion de muerte (tumbarse de costado y desvanecerse) que un civil
        // la muerte es la UNICA forma de desinvocarla: recien aca 555 vuelve a estar disponible
        jm.invoked = false;
        jm.suspended = false;
        jm.entity = null;
      }
    }));
  }

  // pelo rojizo sobre la cabeza: mismo sistema de coordenadas que usa drawCivil para la cabeza
  // (centro local (0,-10), radio 5, dentro de un translate(e.x,e.y) + rotate(e.rotation||0)) --
  // replicamos ese mismo transform aca para que quede pegado perfecto, temblorcito del susto en
  // un techo incluido.
  function drawHair(ctx, e){
    ctx.save();
    let tx = e.x, ty = e.y;
    if(e.state === 'strandedOnRoof'){
      tx += Math.sin(e.trembleCycle*1.7)*1.2;
      ty += Math.cos(e.trembleCycle*2.3)*0.6;
    }
    ctx.translate(tx, ty);
    ctx.rotate(e.rotation || 0);

    ctx.fillStyle = JM_HAIR;
    ctx.beginPath();
    ctx.arc(0, -10, 5.6, Math.PI, Math.PI*2); // gorro de pelo cubriendo la mitad de arriba de la cabeza
    ctx.fill();

    ctx.strokeStyle = JM_HAIR;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4.5,-11); ctx.lineTo(-5.5,-3); ctx.stroke(); // mechon lado izq
    ctx.beginPath(); ctx.moveTo( 4.5,-11); ctx.lineTo( 5.5,-3); ctx.stroke(); // mechon lado der

    ctx.restore();
  }

  // ---------- bullet time automatico al perderla sin querer ----------
  // si algo hace que se te suelte de encima SIN que vos lo hayas decidido (rodada aterrizando de
  // golpe, un golpe del boss que te la vuela de los brazos, lo que sea -- ver el evento generico
  // 'civil-involuntary-drop' en civiles.js, que dropCivil/ejectFromRoll disparan solos en esos
  // casos) se prende el sentido arácnido, para representar que a nuestro heroe se le corta la
  // respiracion un instante viendola caer. NO es un forzado permanente (no tocamos
  // window.AUTO_BULLET_TIME, que ignora al jugador): es EXACTAMENTE lo mismo que si el jugador
  // hubiera tocado Ctrl el mismo -- un toque mas de Ctrl lo apaga al toque, como siempre. Por eso
  // solo prendemos si estaba apagado: si ya lo tenias prendido vos mismo, no hacemos nada raro
  // (ni lo tocamos, ni lo "reiniciamos" a nada).
  window.addEventListener('civil-involuntary-drop', function(ev){
    const e = ev.detail && ev.detail.entity;
    if(!e || e.type !== 'jaryman') return;
    if(!spiderSenseOn) spiderSenseOn = true;
  });

  // ---------- suspension/reaparicion por chunk ----------
  // se descarga el chunk en el que este parada AHORA MISMO (no el chunk en el que nacio): si
  // se alejo caminando a otro, es ESE el que importa. Si el jugador la tiene encima (abrazada o
  // enganchada con la telaraña) no la suspendemos aunque su chunk de origen quede atras: viaja
  // con el, como a cualquier civil cargado.
  window.CHUNK_UNLOAD_LISTENERS.push(function(chunkIndex){
    if(!jm.entity || jm.entity.dead) return;
    const e = jm.entity;
    if(e.carried || e.beingReeled || e.state === 'towed') return;
    if(Math.floor(e.x / CHUNK_WIDTH) !== chunkIndex) return;

    jm.x = e.x; jm.y = e.y;
    jm.homeChunk = chunkIndex;
    jm.suspended = true;
    e.dead = true;      // solo la saca de `entities` -- esto NO dispara onDeath (eso solo pasa
    jm.entity = null;   // por hp<=0, ver updateEntities en el motor), asi que no cuenta como "morir"
  });

  window.CHUNK_LOAD_LISTENERS.push(function(chunkIndex){
    if(!jm.invoked || !jm.suspended) return;
    if(jm.homeChunk !== chunkIndex) return;
    materializeJM(jm.x, jm.y);
  });

  // ---------- indicador en pantalla: circulo + flechita + "JM", solo mientras este cargada
  // (su chunk activo) y fuera de la vista ----------
  window.HUD_DRAW_LISTENERS = window.HUD_DRAW_LISTENERS || [];
  window.HUD_DRAW_LISTENERS.push(function(ctx){
    if(!jm.entity || jm.entity.dead) return; // no invocada, o suspendida (chunk descargado): nada que señalar
    const e = jm.entity;

    const sx = e.x - camera.x, sy = e.y - camera.y;
    const margin = 24;
    const onScreen = sx > margin && sx < canvas.width - margin && sy > margin && sy < canvas.height - margin;
    if(onScreen) return; // a la vista: no hace falta indicador

    const cx = canvas.width/2, cy = canvas.height/2;
    const dx = sx - cx, dy = sy - cy;
    const angle = Math.atan2(dy, dx);

    // clampeamos el punto a una elipse un poco adentro del borde real de la pantalla (mismo
    // truco de siempre para "indicadores de fuera de pantalla"): asi nunca queda pegado al filo
    const pad = 46;
    const halfW = canvas.width/2 - pad, halfH = canvas.height/2 - pad;
    const scale = Math.min(halfW/Math.abs(dx || 0.0001), halfH/Math.abs(dy || 0.0001));
    const ix = cx + dx*scale, iy = cy + dy*scale;

    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(20,20,25,0.72)';
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = JM_HAIR;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = JM_HAIR;
    ctx.beginPath();
    ctx.moveTo(21, 0);
    ctx.lineTo(11, -6);
    ctx.lineTo(11, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // "JM" sin rotar, para que se lea derecho sin importar hacia que lado apunte la flecha
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('JM', ix, iy);
    ctx.restore();
  });

  // ---------- evento: llevarla al techo de un CosCorp invoca al boss ----------
  // los techos de los edificios son platforms comunes (ver chunkPlatforms en el motor: se
  // empujan como {x:b.x, y:b.y, w:b.w}, SIN 'balcony'), asi que un techo de CosCorp es la
  // platform cuyo x/w coincide exacto con los de un building con billboard === 'CosCorp'.
  function isCosCorpRoofPlatform(plat){
    if(!plat || plat.balcony) return false;
    const b = findBuildingForPlatform(plat);
    return !!b && b.billboard === 'CosCorp';
  }

  function findBuildingForPlatform(plat){
    if(!plat) return null;
    for(const b of buildings){
      if(b.x === plat.x && b.w === plat.w) return b;
    }
    return null;
  }

  // se revisa una vez por frame (ver window.WORLD_UPDATE_LISTENERS en el motor): en cuanto quede
  // PARADA en un techo de CosCorp, se dispara el evento 'jarymane-coscorp-rooftop' una sola vez
  // (hasta que se baje del techo y vuelva a subir) -- quien escuche ese evento (por ahora,
  // entities/crazylimemonster.js) decide que hacer con eso, jaryman.js no sabe nada del boss.
  window.WORLD_UPDATE_LISTENERS = window.WORLD_UPDATE_LISTENERS || [];
  window.WORLD_UPDATE_LISTENERS.push(function(){
    if(!jm.entity || jm.entity.dead) return;
    const e = jm.entity;
    const onCosCorpRoof = e.grounded && e.standingPlatform && isCosCorpRoofPlatform(e.standingPlatform);

    if(onCosCorpRoof && !e._cosCorpRoofNotified){
      e._cosCorpRoofNotified = true;
      const building = findBuildingForPlatform(e.standingPlatform);
      window.dispatchEvent(new CustomEvent('jarymane-coscorp-rooftop', {
        detail: {x: e.x, y: e.y, building, entity: e}
      }));
    } else if(!onCosCorpRoof){
      e._cosCorpRoofNotified = false; // se bajo del techo: si vuelve a subir, dispara de nuevo
    }
  });

})();
