// input.js — keyboard, mouse and pointer lock. All state lives in G.input; modules
// read it, none touches the DOM events themselves. Keys: WASD move, Space jump, Ctrl/C
// crouch, R reload, B buy menu, E plant/defuse, G grenade, 1-6 weapons, 7-0 gear, M mute, Tab scoreboard.
export function createInput() {
  return {
    keys: new Set(),
    mouseDX: 0, mouseDY: 0,
    mouseDown: false, mouseRight: false, mouseClicked: false,
    locked: false,
  };
}

export function bindInput(G, canvas) {
  const inp = G.input;
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab') e.preventDefault();
    if (e.repeat) return;
    inp.keys.add(e.code);
    if (e.code === 'KeyR' && G.onReload) G.onReload();
    if (e.code === 'KeyB' && G.onBuyToggle) G.onBuyToggle();
    if (e.code === 'KeyG' && G.onGrenade) G.onGrenade();
    if (e.code === 'KeyM' && G.onMute) G.onMute();
    if (e.code.startsWith('Digit')) G.onDigit?.(e.code.slice(5));
    if (e.code.startsWith('Numpad')) G.onDigit?.(e.code.slice(6));
  });
  addEventListener('keyup', (e) => inp.keys.delete(e.code));
  addEventListener('blur', () => { inp.keys.clear(); inp.mouseDown = false; inp.mouseRight = false; });
  canvas.addEventListener('click', () => {
    if (!inp.locked && G.onLock) G.onLock();
  });
  addEventListener('mousedown', (e) => {
    if (!inp.locked) return;
    if (e.button === 0) { inp.mouseDown = true; inp.mouseClicked = true; }
    if (e.button === 2) inp.mouseRight = true;
  });
  addEventListener('mouseup', (e) => {
    if (e.button === 0) inp.mouseDown = false;
    if (e.button === 2) inp.mouseRight = false;
  });
  addEventListener('mousemove', (e) => {
    if (!inp.locked) return;
    inp.mouseDX += e.movementX;
    inp.mouseDY += e.movementY;
  });
  addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    inp.locked = document.pointerLockElement === canvas;
    if (!inp.locked) { inp.mouseDown = false; inp.mouseRight = false; }
    if (G.onLockChange) G.onLockChange(inp.locked);
  });
}
