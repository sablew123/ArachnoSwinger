// habilities/spiderSense.js -- habilidad de sentido arácnido: toggle (el tiempo se ralentiza
// mientras este activo). Antes vivia inline en el case 'ControlLeft'/'ControlRight' del keydown
// de spiderswing.html; la logica es identica, solo movida a funcion para que ese case pueda
// llamarla igual que a cualquier otra habilidad. La tecla que la dispara sigue viniendo de
// habilities/controls.json (campo "spiderSense"), no de aca.
function toggleSpiderSense(){
  spiderSenseOn = !spiderSenseOn;
}
