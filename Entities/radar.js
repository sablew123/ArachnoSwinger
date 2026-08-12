// ============================================================================
//  entities/radar.js
// ----------------------------------------------------------------------------
//  Replica generica del indicador "circulo + flechita + texto" que ya usaba
//  Jary Mane en jaryman.js (mismo dibujo, misma logica de clamp contra el
//  borde de pantalla), pero como una funcion reusable, para no copiar y pegar
//  ese bloque de nuevo en crazylimemonster.js.
//
//  jaryman.js NO se toca: sigue con su propio indicador (ya andaba, no hace
//  falta arriesgarlo). Esto es solo para que el boss (y cualquier cosa futura
//  que necesite un radar) no tenga que reescribirlo.
//
//  Uso:
//    registerRadarTarget(() => bossEntityOrNull, {label:'JLM', color:'#3fae4a'});
//
//  getEntity() se vuelve a preguntar cada frame: si devuelve null/undefined o
//  una entidad con .dead, el indicador simplemente no se dibuja ese frame (no
//  hace falta desregistrar nada a mano).
// ============================================================================

window.HUD_DRAW_LISTENERS = window.HUD_DRAW_LISTENERS || [];

function registerRadarTarget(getEntity, opts = {}){
  const label       = opts.label || '?';
  const ringColor   = opts.color || '#ffffff';
  const arrowColor  = opts.color || '#ffffff';
  const margin      = opts.margin ?? 24; // si esta a menos de esto del borde real, se considera "a la vista"
  const pad         = opts.pad ?? 46;    // que tan adentro del borde de pantalla clampeamos el indicador

  window.HUD_DRAW_LISTENERS.push(function(ctx){
    const e = getEntity();
    if(!e || e.dead) return;

    const sx = e.x - camera.x, sy = e.y - camera.y;
    const onScreen = sx > margin && sx < canvas.width - margin && sy > margin && sy < canvas.height - margin;
    if(onScreen) return;

    const cx = canvas.width/2, cy = canvas.height/2;
    const dx = sx - cx, dy = sy - cy;
    const angle = Math.atan2(dy, dx);

    const halfW = canvas.width/2 - pad, halfH = canvas.height/2 - pad;
    const scale = Math.min(halfW/Math.abs(dx || 0.0001), halfH/Math.abs(dy || 0.0001));
    const ix = cx + dx*scale, iy = cy + dy*scale;

    ctx.save();
    ctx.translate(ix, iy);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(20,20,25,0.72)';
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(21, 0);
    ctx.lineTo(11, -6);
    ctx.lineTo(11, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, ix, iy);
    ctx.restore();
  });
}
window.registerRadarTarget = registerRadarTarget;
