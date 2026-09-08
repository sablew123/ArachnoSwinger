// ============================================================================
//  entities/dragsystem.js
// ----------------------------------------------------------------------------
//  Sistema generico de "arrastre por el asfalto": el tramo de la pelea en el
//  que el boss va corriendo con el jugador enganchado de la telaraña y lo
//  arrastra por la calle. No sabe nada del boss en particular -- solo expone
//  start/stop y hace su trabajo mientras este activo -- por si el dia de
//  mañana hace falta un arrastre parecido con otra cosa.
//
//  Mientras el arrastre esta activo:
//    - el jugador pierde vida por segundo (damagePlayer), MITIGADA mientras
//      este en el aire (saltando) -- ver dps/jumpMitigation mas abajo.
//    - cualquier auto que quede cerca del jugador se vuelca (tipOverBus),
//      unicamente porque esta prendido este sistema: en trafico normal un
//      auto JAMAS se vuelca, este flag no existe fuera de este arrastre.
//
//  Uso (desde crazylimemonster.js):
//    window.startPlayerDrag({ dps: 14 });
//    ... cada frame, mientras el boss decida seguir arrastrando ...
//    window.stopPlayerDrag();
//
//  window.isPlayerBeingDragged() sirve para que el propio boss (o el HUD, si
//  hace falta mas adelante) sepa si el arrastre sigue activo en este instante.
// ============================================================================

(function(){

  let drag = null; // null = no hay arrastre activo. Si no, ver forma en startPlayerDrag.

  // cfg:
  //   dps             -> daño por segundo mientras te arrastra a pleno piso (default 14)
  //   jumpMitigation   -> 0..1, cuanto de ese daño se DESCUENTA mientras estas en el aire
  //                      (saltando, ver player.dragAirborneT / controlState 'dragging' en el
  //                      motor). 1 = saltando no perdes NADA (inmunidad mientras dure el saltito);
  //                      0 = saltar no ayuda en nada. default 1 -- la idea es justamente esa: ir
  //                      saltando seguido para esquivar el goteo de daño, no que el salto solo
  //                      lo reduzca a medias.
  //   tipBuses         -> si hay que volcar autos cercanos (default true)
  //   busCheckRadius   -> que tan cerca del jugador tiene que estar un auto para volcarse (default 90)
  //   onTick(dt)        -> opcional, se llama cada frame mientras el arrastre este activo
  window.startPlayerDrag = function(cfg = {}){
    drag = Object.assign({
      dps: 14,
      jumpMitigation: 1,
      tipBuses: true,
      busCheckRadius: 90,
      onTick: null
    }, cfg);
  };

  window.stopPlayerDrag = function(){
    drag = null;
  };

  window.isPlayerBeingDragged = function(){
    return !!drag;
  };

  window.RESET_LISTENERS = window.RESET_LISTENERS || [];
  window.RESET_LISTENERS.push(function(){ drag = null; });

  // ---------- volcado: salto corto en el aire y cae de cabeza (patas arriba) en el piso ----------
  const TIP_HANG_TIME    = 0.4;  // segundos que dura el saltito completo, del piso al piso
  const TIP_JUMP_HEIGHT  = 46;   // que tan alto se levanta a mitad del salto (px)

  window.WORLD_UPDATE_LISTENERS = window.WORLD_UPDATE_LISTENERS || [];
  window.WORLD_UPDATE_LISTENERS.push(function(dt){
    if(drag){
      // en el aire (saltaste) el daño se mitiga; pegado al piso (grounded) es el arrastre "puro"
      const mitigation = player.grounded ? 1 : (1 - drag.jumpMitigation);
      damagePlayer(drag.dps * dt * mitigation);

      if(drag.tipBuses){
        for(const car of cars){
          if(!car.tipped && Math.abs(car.x - player.x) <= drag.busCheckRadius){
            tipOverBus(car);
          }
        }
      }

      if(drag.onTick) drag.onTick(dt);
    }

    // la animacion del saltito de vuelco corre SIEMPRE, no solo mientras el arrastre este
    // activo -- asi un bus que se volco justo cuando el arrastre termina, o que quedo en un
    // chunk por el que el jugador ya paso, igual completa la caida en vez de quedar congelado
    // a media vuelta en el aire
    for(const car of cars){
      if(!car.tipped || car.tipLanded) continue;

      car.tipAirTime += dt;
      const t = Math.min(1, car.tipAirTime / TIP_HANG_TIME);

      // arco parabolico simple (0 en t=0 y t=1, pico -TIP_JUMP_HEIGHT en t=0.5): sube y cae
      // como un salto de verdad, no una rotacion en el lugar
      car.tipYOffset = -TIP_JUMP_HEIGHT * 4*t*(1-t);
      // gira a la par del salto, terminando EXACTO boca abajo (180°) justo cuando toca el piso
      car.tipRotation = car.tipSpinDir * Math.PI * t;

      if(t >= 1){
        car.tipYOffset = 0;
        car.tipRotation = car.tipSpinDir * Math.PI;
        car.tipLanded = true;
      }
    }
  });

  // vuelca un bus: SOLO pasa durante este arrastre (ver arriba). Deja de avanzar en seco (ya no
  // es "un frenon", es un vuelco: no tiene sentido que un auto de panza siga circulando) y pega
  // un salto cortito girando en el aire hasta caer exactamente de cabeza (patas arriba, 180°) --
  // ver el WORLD_UPDATE_LISTENERS de arriba, que es quien de verdad anima el salto cuadro a
  // cuadro; aca solo se arranca el estado inicial.
  function tipOverBus(car){
    car.tipped   = true;
    car.vx       = 0;      // frenazo total: un bus volcado no sigue circulando
    car.tipAirTime = 0;
    car.tipYOffset = 0;
    car.tipRotation = 0;
    car.tipSpinDir = Math.random() < 0.5 ? -1 : 1; // para que lado gira, al azar
    car.tipLanded = false;
  }
  window.tipOverBus = tipOverBus;

})();
