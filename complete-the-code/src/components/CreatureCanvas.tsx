import { useEffect, useRef } from "react";
import { Creature } from "../creature/Creature";
import { Input } from "../creature/Input";
import { clamp } from "../creature/math";

const scaleFor = (w: number, h: number) => clamp(Math.min(w, h * 1.4) / 950, 0.5, 1.2);

export default function CreatureCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    };
    resize();

    if (!Input.moved) {
      Input.mouse.x = w / 2;
      Input.mouse.y = h / 2;
    }

    const creature = new Creature(w * 0.62, h * 0.5, scaleFor(w, h));
    const detach = Input.attach(window);
    window.addEventListener("resize", resize);

    const goal = { x: 0, y: 0 };
    let last = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const dt = clamp((now - last) / 16.667, 0.2, 3);
      last = now;

      // mouse ativo → segue o mouse; parado há muito tempo → piloto automático
      if (Input.moved && now - Input.lastMove < 6000) {
        goal.x = Input.mouse.x;
        goal.y = Input.mouse.y;
      } else {
        goal.x = w / 2 + Math.sin(now * 0.00031) * w * 0.36;
        goal.y = h / 2 + Math.sin(now * 0.00047 + 1.3) * h * 0.32;
      }

      creature.update(dt, goal);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      creature.draw(ctx);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      detach();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 block touch-none" />;
}
