// physics/constants.js — todas las constantes de tuning de la fisica del jugador: gravedad,
// movimiento en tierra/aire, correr, telarañas/resortes de soga, agarre de pared, velocidad
// terminal y caidas fuertes. Nada de logica aca, solo numeros — las funciones que los usan
// viven en los demas archivos de esta carpeta (ver physics/manifest.js).

const GRAVITY         = 1400;   // px/s^2
const GROUND_ACCEL    = 2200;
const GROUND_FRICTION = 2600;
const MAX_GROUND_SPEED= 320;
const AIR_CONTROL_ACCEL = 320;  // control en el aire / bombeo del pendulo
const JUMP_VELOCITY    = -620;
const PLAYER_SIZE      = 28;

// peso "real" del jugador (kg), usado como referencia para convertir el peso real de cualquier
// entidad cargable (ver e.weightKg en civiles.js) a las unidades de masa abstractas que ya usa
// toda la fisica de swing/pulseada (donde el jugador solo = 1). Expuesto en window para que los
// archivos de entidades (cargados aparte, ver entities/manifest.js) puedan hacer esa conversion
// sin duplicar el numero.
const PLAYER_REFERENCE_WEIGHT_KG = 75;
window.PLAYER_REFERENCE_WEIGHT_KG = PLAYER_REFERENCE_WEIGHT_KG;

// ---------- CORRER: doble toque de A o D para pasar de caminar a correr ----------
const MAX_RUN_SPEED      = 540;  // tope de velocidad corriendo (bastante mas que caminando)
const RUN_ACCEL           = 3400; // aceleracion corriendo, mas brusca que caminando
const RUN_OVERSPEED_DECAY = 260;  // si aterrizas ya mas rapido que el tope de correr, se va frenando gradual hasta ese tope (no de golpe)

// ---------- TELARAÑAS: fisica de soga real (solo tension al estirarse, floja si no) ----------
const ROPE_STRETCH_RATIO    = 0.05;  // maximo estiramiento por encima del largo natural (5%, igual que antes)
const ROPE_SPRING_STIFFNESS = 60;
const ROPE_SPRING_DAMPING   = 8;
const WEB_TRAVEL_TIME   = 0.35;    // el tiempo MAXIMO que puede tardar en llegar: solo lo tarda de verdad a WEB_MAX_RANGE
const WEB_MAX_RANGE     = 1300;   // distancia maxima en la que puede enganchar algo
// velocidad de viaje FIJA de la telaraña (px/s), no el tiempo: a esta velocidad, cubrir WEB_MAX_RANGE
// tarda exactamente WEB_TRAVEL_TIME (el maximo). Para un enganche mas cerca, a la misma velocidad
// se cubre menos distancia en menos tiempo -- proporcional, asi que un enganche pegado casi no
// tarda nada (tiempo infimo), y solo al tiro mas largo posible se siente el viaje completo
const WEB_TRAVEL_SPEED  = WEB_MAX_RANGE / WEB_TRAVEL_TIME;
const WEB_DETACH_FADE_TIME = 1.1;  // si se suelta estando enganchada, tarda esto en desvanecerse
const WEB_PULL_SPEED        = 900; // impulso al jalar de una telaraña tensada (toque de boton medio)

// ---------- AGARRE DE PARED (W toque, sin telaraña de por medio) ----------
const WALL_GRAB_RANGE    = 34;   // que tan cerca de la fachada tenes que estar para poder pescarla
const WALL_GRAB_FRICTION = 2400; // friccion al agarrarte: frena el resbalon antes de quedar fijo
const WALL_GRAB_STOP_SPEED = 15; // velocidad por debajo de la cual se considera "ya quedo agarrado del todo"
const WALL_CLIMB_SPEED   = 210;  // velocidad al trepar/moverse por la fachada una vez agarrado
const WALL_JUMP_VX       = 480;  // impulso horizontal al saltar desde el borde del edificio
const WALL_JUMP_VY       = -680; // impulso vertical al saltar desde el borde del edificio
const MAX_SPEED = 2400; // "velocidad terminal": tope general de rapidez (alta, pero humana, nada de romper la barrera del sonido)

// ---------- CAIDAS FUERTES: daño o rodada al aterrizar ----------
// por debajo de esta velocidad vertical de impacto, aterrizar es "normal": ni daño ni rodada,
// pase lo que pase con la velocidad horizontal (asi un salto comun jamas lastima)
const FALL_DAMAGE_MIN_SPEED = 950;
// a velocidad terminal (MAX_SPEED) exacta, una caida "de plano" (sin correr) hace este daño
const FALL_DAMAGE_MAX       = 70;
// rodar te salva de la INMENSA mayoria de las caidas fuertes: por debajo de esto, aterrizar
// rodando no hace absolutamente nada de daño (a diferencia de FALL_DAMAGE_MIN_SPEED, que es el
// umbral de "caida fuerte" en general). Recien pasando esto -bien cerca de la velocidad terminal-
// empieza a doler un poco, y aun asi con el tope chiquito de ROLL_FALL_DAMAGE_MAX
const ROLL_DAMAGE_MIN_SPEED = 2100;
// a velocidad terminal, como mucho esto (rodando)
const ROLL_FALL_DAMAGE_MAX  = 10;
// que tan rapido en horizontal tenes que venir (respecto al tope de correr) para que una caida
// fuerte termine en rodada en vez de en un golpe seco parado en el sitio
const ROLL_MIN_VX           = MAX_RUN_SPEED * 0.9;
