// habilities/chill.js -- habilidad "chill": con las dos manos enganchadas, quedarse colgado
// quieto sin soltar el mouse (primer toque) y soltar el agarre (segundo toque). Antes vivia
// inline en el case 'KeyQ' del keydown de spiderswing.html; la logica es identica, solo movida
// a funcion. La tecla que la dispara sigue viniendo de habilities/controls.json (campo "chill").
function toggleChillState(){
  if(controlState === 'normal' && bothHandsAttached()){
    // te quedas colgado quieto de las dos telarañas: WASD deja de responder y los
    // clicks quedan "pulsados" aunque sueltes el mouse
    controlState = 'chill';
    chillTimer = 0;
    hangSign = player.vx < 0 ? -1 : 1;
  } else if(controlState === 'chill'){
    // segundo toque: soltas el agarre (las dos telarañas se sueltan), pero la pose no
    // cambia de golpe: sigue "acostado chill" mientras cae, hasta que toques algo
    // o hasta que aterrice de golpe
    detachIfAttached('left');
    detachIfAttached('right');
    pressed.left = false; pressed.right = false;
    controlState = 'passiveFall';
  }
}
