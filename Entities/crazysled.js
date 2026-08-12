// ============================================================================
//  entities/crazysled.js
// ----------------------------------------------------------------------------
//  El aerodeslizador vacio del Monstruo Loco Lima (fase 7 -- ver STUNNED en
//  entities/crazylimemonster.js, que es quien lo spawnea con spawnEntity('crazysled', ...)
//  justo cuando el boss cae de el).
//
//  Ciclo de vida de una instancia:
//    1. 'idle' -- se queda quieto flotando donde el boss lo dejo, durante IDLE_WAIT segundos
//       (el tiempo que tarda en "reaccionar" y salir a buscarlo).
//    2. 'homing' -- misil teledirigido de verdad: persigue la posicion ACTUAL del boss cuadro a
//       cuadro (no un punto fijo), acelerando de a poco desde 0 hasta HOMING_MAX_SPEED. Si nadie
//       lo detiene y llega hasta el boss, dispara onReturnedToOwner() -- crazylimemonster.js lo usa
//       para reiniciar ROOFTOP_BOMBING (fase 6 entera de nuevo).
//    3. 'grabbed' -- el jugador lo engancho con la telaraña de siempre y le dio un toque de click
//       medio: como es huggable:true, ESO YA LO TRAE SOLO (mismo mecanismo que un civil, ver
//       performWebPull/updateEntities en el motor -- e.beingReeled/e.justCaught, nada nuevo que
//       escribir aca para esa parte). Apenas llega (e.justCaught), queda "agarrado": de ahi en mas
//       se mantiene pegado a donde apunta el jugador (para que cualquier puñetazo/patada le pegue
//       de verdad, sin puntear con precision de milimetro) hasta que los puños/patadas de siempre
//       (dealDamageAt, ya conectado en el motor -- no hace falta nada especial aca tampoco) le bajen
//       el hp a 0. Eso dispara onDeath -> onDestroyedByPlayer(), que crazylimemonster.js usa para
//       pasar a GROUNDED (fase 8).
//
//  Los dos desenlaces (onReturnedToOwner / onDestroyedByPlayer) estan separados a proposito:
//  "volvio con el boss" pone e.dead=true A MANO (no pasa por hp, asi que NO dispara onDeath),
//  "lo destruyeron a golpes" es la UNICA forma de llegar a hp<=0 -- por eso nunca se pisan entre si.
// ============================================================================

(function(){

  const SLED_HP         = 30;   // unos 2-3 golpes (kick=14, punch=8) -- se destruye rapido a proposito
  const SLED_HIT_RADIUS = 24;
  const SLED_COLOR      = '#9aa0a8';
  const SLED_ACCENT     = '#5c6470';

  const IDLE_WAIT        = 1.5;  // segundos quieto antes de salir a buscar al boss
  const HOMING_ACCEL     = 700;  // px/s^2 -- "aceleraria de a poco", no sale disparado de una
  const HOMING_MAX_SPEED = 640;
  const RETURN_DIST      = 26;   // que tan cerca del boss cuenta como "volvio de verdad"
  const SLED_HOLD_DIST   = 34;   // que tan lejos del jugador se mantiene mientras esta agarrado

  registerEntityType('crazysled', {
    hp: SLED_HP,
    hitRadius: SLED_HIT_RADIUS,
    moveType: 'custom',   // se mueve 100% por su cuenta (flota, no le pesa la gravedad -- es un aerodeslizador)
    webAttachable: true,  // se engancha con la telaraña como cualquier cosa
    huggable: true,       // un TOQUE de click medio con la soga tensa lo trae SOLO hacia el jugador
                           // (mismo mecanismo ya armado para civiles, ver performWebPull en el motor)
    invulnerable: false,  // a diferencia de un civil: SI puede recibir daño de puños/patadas de verdad
    friendly: false,
    color: SLED_COLOR,

    onSpawn(e){
      // OJO (mismo detalle que en crazybomb.js): el motor llama a este hook como def.onSpawn(e),
      // UN SOLO argumento -- nunca un "opts" aparte. Los opts que le paso crazylimemonster.js
      // (getOwner, onReturnedToOwner, onDestroyedByPlayer) YA quedaron mezclados directo sobre "e"
      // por spawnEntity (Object.assign, antes de llamar a onSpawn), asi que se leen de e.* tal
      // cual -- nunca de un segundo parametro que no llega.
      e.getOwner = e.getOwner || (() => null);
      e.sledState = 'idle';
      e.sledT = 0;
      e.homingSpeed = 0;
      e.grabbed = false;
      e.bobCycle = Math.random()*Math.PI*2;
    },

    onUpdate(e, dt){
      e.bobCycle += dt*3;

      // el motor ya lo trajo hasta el jugador via beingReeled (huggable) -- justCaught dura UN
      // SOLO frame (ver updateEntities), lo usamos para marcarlo "agarrado" de ahi en mas
      if(e.justCaught) e.grabbed = true;

      if(e.grabbed){
        // agarrado: se mantiene pegado bien cerca de donde apunta el jugador (no exactamente
        // encima suyo) para que cualquier puñetazo/patada -- que tambien sigue mas o menos la
        // mira, ver startAttack en el motor -- lo conecte de verdad sin tener que apuntar con
        // precision de milimetro. El sled no hace nada mas mientras dure esto: destruirlo es
        // 100% el sistema de combate de siempre (dealDamageAt), nada especial de este archivo.
        const worldX = mouse.x + camera.x, worldY = mouse.y + camera.y;
        const dx = worldX - player.x, dy = worldY - player.y;
        const dist = Math.hypot(dx,dy) || 1;
        e.x = player.x + dx/dist*SLED_HOLD_DIST;
        e.y = player.y + dy/dist*SLED_HOLD_DIST;
        return;
      }

      // en pleno viaje de reel-in (ver huggable arriba): el motor ya le esta moviendo x/y solo
      // este cuadro (WEB_PULL_SPEED, mismo trato que un civil) -- no tocarlo mientras dure
      if(e.beingReeled) return;

      if(e.sledState === 'idle'){
        e.sledT += dt;
        if(e.sledT >= IDLE_WAIT) e.sledState = 'homing';
        return;
      }

      // 'homing': persigue al boss cuadro a cuadro (posicion ACTUAL, no un punto fijo -- por eso
      // hay que interceptarlo antes de que llegue, no basta con adivinar donde iba a estar)
      const owner = e.getOwner();
      if(!owner || owner.dead){
        e.dead = true; // resguardo: si el boss ya no existe por lo que sea, no se queda flotando eterno
        return;
      }

      e.homingSpeed = Math.min(HOMING_MAX_SPEED, e.homingSpeed + HOMING_ACCEL*dt);
      const dx = owner.x - e.x, dy = owner.y - e.y;
      const dist = Math.hypot(dx,dy) || 1;
      e.x += dx/dist*e.homingSpeed*dt;
      e.y += dy/dist*e.homingSpeed*dt;

      if(dist <= RETURN_DIST){
        e.dead = true; // esto SOLO -- no pasa por hp, asi que no dispara onDeath/onDestroyedByPlayer
        if(e.onReturnedToOwner) e.onReturnedToOwner();
      }
    },

    // onDeath dispara UNICAMENTE por hp<=0 (ver updateEntities en el motor): o sea, "lo destruyeron
    // a golpes de verdad". El otro desenlace (volver con el boss) pone e.dead=true a mano arriba,
    // asi que nunca llega a pasar por aca -- los dos callbacks no se pisan entre si.
    onDeath(e){
      if(e.onDestroyedByPlayer) e.onDestroyedByPlayer();
    },

    draw(ctx, e){ drawCrazySled(ctx, e); }
  });

  function drawCrazySled(ctx, e){
    const bob = e.grabbed ? 0 : Math.sin(e.bobCycle)*3;
    ctx.save();
    ctx.translate(e.x, e.y + bob);

    ctx.fillStyle = 'rgba(154,160,168,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 8, 30, 10, 0, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = SLED_COLOR;
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI*2); ctx.fill();

    // barra al medio, simulando el respaldo vacio donde iba parado el boss
    ctx.strokeStyle = SLED_ACCENT;
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(14, -3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(0, -14); ctx.stroke();

    ctx.restore();
  }

})();
