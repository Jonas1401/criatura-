/**
 * Input global — guarda a posição do mouse/toque.
 * Usado como `Input.mouse.x` / `Input.mouse.y`, igual ao código original.
 */
export const Input = {
  mouse: { x: 0, y: 0 },
  /** true depois do primeiro movimento do ponteiro */
  moved: false,
  /** timestamp (ms) do último movimento */
  lastMove: 0,

  attach(target: Window): () => void {
    const onMove = (e: PointerEvent) => {
      Input.mouse.x = e.clientX;
      Input.mouse.y = e.clientY;
      Input.moved = true;
      Input.lastMove = performance.now();
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerdown", onMove);
    return () => {
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerdown", onMove);
    };
  },
};
