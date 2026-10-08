import { LimSystem } from "./LimSystem";
import { Node } from "./Node";
import { clamp, lerp, smoothstep, wrapAngle } from "./math";
import { settings } from "./settings";

/**
 * Criatura procedural:
 *  - a cabeça persegue o alvo (mouse ou piloto automático)
 *  - cada nó da coluna segue o anterior (com limite de curvatura)
 *  - cada pata é um LimSystem que usa IK + passos alternados
 */
export class Creature {
  spine: Node[] = [];
  limbs: LimSystem[] = [];
  radii: number[] = [];
  scale: number;
  spacing: number;
  maxBend = 0.2;
  maxSpeed: number;
  heading = 0;
  speed = 0;
  time = 0;
  goal = { x: 0, y: 0 };

  constructor(x: number, y: number, scale = 1, segments = 64) {
    this.scale = scale;
    this.spacing = 9 * scale;
    this.maxSpeed = 4.4 * scale;
    this.goal.x = x;
    this.goal.y = y;

    // ---- coluna: a cabeça é o nó 0, cada nó tem o anterior como parent ----
    for (let i = 0; i < segments; i++) {
      const parent = i === 0 ? null : this.spine[i - 1];
      this.spine.push(new Node(x - i * this.spacing, y, parent, false, this.spacing));
    }

    // ---- espessura do corpo (ombros largos, cauda fina) ----
    const headR = 7 * scale;
    const maxR = 22 * scale;
    for (let i = 0; i < segments; i++) {
      const r =
        i < 10
          ? lerp(headR, maxR, smoothstep(0, 10, i))
          : maxR * Math.pow(1 - (i - 10) / (segments - 10), 0.85) + 1.5 * scale;
      this.radii.push(r);
    }

    // ---- pernas: 3 pares (frente, meio, trás) ----
    const pairs = [
      { idx: 8, sweep: 0.45, reach: 78, bendBack: true },
      { idx: 22, sweep: 0.05, reach: 88, bendBack: true },
      { idx: 36, sweep: -0.4, reach: 82, bendBack: false },
    ];

    pairs.forEach((p, pi) => {
      ([1, -1] as const).forEach((side) => {
        const hip = this.spine[p.idx];
        const reach = p.reach * scale;
        const total = reach * 1.38;

        // joelho/cotovelo e pé: isSegment = true (pertencem ao membro)
        const knee = new Node(hip.x, hip.y, hip, true, total * 0.48);
        const foot = new Node(hip.x, hip.y, knee, true, total * 0.52);

        this.limbs.push(
          new LimSystem(foot, 2, 0.11, this, {
            side,
            sweep: p.sweep,
            reach,
            bendBack: p.bendBack,
            // marcha diagonal: patas opostas alternam
            group: (pi + (side > 0 ? 0 : 1)) % 2,
          })
        );
      });
    });
  }

  /** direção unitária (cauda → cabeça) no nó i */
  forwardAt(i: number) {
    const a = this.spine[Math.max(i - 1, 0)];
    const b = this.spine[Math.min(i + 1, this.spine.length - 1)];
    const x = a.x - b.x;
    const y = a.y - b.y;
    const m = Math.hypot(x, y) || 1;
    return { x: x / m, y: y / m };
  }

  /** uma pata só pode dar um passo se nenhuma do grupo oposto estiver no ar */
  canStep(limb: LimSystem) {
    return !this.limbs.some((l) => l !== limb && l.group !== limb.group && l.stepping);
  }

  update(dt: number, goal: { x: number; y: number }) {
    this.goal.x = goal.x;
    this.goal.y = goal.y;
    this.time += dt;

    for (const n of this.spine) {
      n.px = n.x;
      n.py = n.y;
    }

    const head = this.spine[0];

    if (!settings.ikMode) {
      const dx = goal.x - head.x;
      const dy = goal.y - head.y;
      const d = Math.hypot(dx, dy);

      // acelera longe do alvo, desacelera perto
      const wanted = this.maxSpeed * smoothstep(25 * this.scale, 230 * this.scale, d);
      this.speed += (wanted - this.speed) * Math.min(1, 0.08 * dt);
      const sf = this.speed / this.maxSpeed;

      // curva suave (não vira "no lugar")
      const diff = wrapAngle(Math.atan2(dy, dx) - this.heading);
      const turn = 0.08 * dt * (0.25 + 0.75 * sf);
      this.heading += clamp(diff, -turn, turn);
      // ondulação sutil, dá vida ao corpo
      this.heading += Math.sin(this.time * 0.1) * 0.02 * sf * dt;

      head.x += Math.cos(this.heading) * this.speed * dt;
      head.y += Math.sin(this.heading) * this.speed * dt;
    } else {
      this.speed *= 0.9;
    }

    // cada nó segue o anterior mantendo distância fixa e curvatura limitada
    for (let i = 1; i < this.spine.length; i++) {
      const a = this.spine[i - 1];
      const b = this.spine[i];
      let ang = Math.atan2(b.y - a.y, b.x - a.x);
      if (i >= 2) {
        const pp = this.spine[i - 2];
        const prevAng = Math.atan2(a.y - pp.y, a.x - pp.x);
        ang = prevAng + clamp(wrapAngle(ang - prevAng), -this.maxBend, this.maxBend);
      }
      b.x = a.x + Math.cos(ang) * this.spacing;
      b.y = a.y + Math.sin(ang) * this.spacing;
    }

    for (const limb of this.limbs) limb.update(dt);
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = "lighter";

    for (const limb of this.limbs) limb.draw(ctx);
    this.drawBody(ctx);
    this.drawHead(ctx);

    if (settings.showBones) this.drawBones(ctx);

    ctx.globalCompositeOperation = "source-over";
  }

  private drawBody(ctx: CanvasRenderingContext2D) {
    const n = this.spine.length;
    const s = this.scale;
    const maxR = this.radii[10];

    // contorno do corpo
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 1; i < n; i++) {
        const p = this.spine[i];
        const f = this.forwardAt(i);
        const r = this.radii[i] * 0.95;
        const x = p.x - f.y * r * side;
        const y = p.y + f.x * r * side;
        if (i === 1) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = "rgba(170, 200, 240, 0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // costelas (arcos) — primeiro um brilho, depois as linhas finas
    const glow = new Path2D();
    const ribs: { path: Path2D; a: number }[] = [];

    for (let i = 1; i < n; i++) {
      const p = this.spine[i];
      const f = this.forwardAt(i);
      const nx = -f.y;
      const ny = f.x;
      const r = this.radii[i];

      const lx = p.x + nx * r - f.x * r * 0.5;
      const ly = p.y + ny * r - f.y * r * 0.5;
      const rx = p.x - nx * r - f.x * r * 0.5;
      const ry = p.y - ny * r - f.y * r * 0.5;
      const cx = p.x + f.x * r;
      const cy = p.y + f.y * r;

      const path = new Path2D();
      path.moveTo(lx, ly);
      path.quadraticCurveTo(cx, cy, rx, ry);
      glow.addPath(path);
      ribs.push({ path, a: 0.3 + 0.6 * clamp(r / maxR, 0, 1) });
    }

    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(120, 170, 255, 0.07)";
    ctx.lineWidth = 4 * s;
    ctx.stroke(glow);

    ctx.lineWidth = 1.1;
    for (const rib of ribs) {
      ctx.strokeStyle = `rgba(215, 232, 255, ${rib.a})`;
      ctx.stroke(rib.path);
    }

    // espinha dorsal + vértebras
    ctx.beginPath();
    ctx.moveTo(this.spine[0].x, this.spine[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(this.spine[i].x, this.spine[i].y);
    ctx.strokeStyle = "rgba(235, 245, 255, 0.45)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (let i = 1; i < n; i += 2) {
      const p = this.spine[i];
      const sz = Math.max(1, 2.2 * s * (this.radii[i] / maxR));
      ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
    }
  }

  private drawHead(ctx: CanvasRenderingContext2D) {
    const head = this.spine[0];
    const f = this.forwardAt(0);
    const hs = 10 * this.scale;

    // coordenadas locais: u = para frente, v = para o lado
    const pt = (u: number, v: number): [number, number] => [
      head.x + f.x * u * hs - f.y * v * hs,
      head.y + f.y * u * hs + f.x * v * hs,
    ];

    // chifres
    ctx.strokeStyle = "rgba(220, 235, 255, 0.7)";
    ctx.lineWidth = 1.2;
    ctx.lineCap = "round";
    for (const v of [1, -1]) {
      ctx.beginPath();
      const a = pt(-0.3, 0.8 * v);
      const b = pt(-1.2, 1.5 * v);
      const c = pt(-2.0, 1.4 * v);
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(b[0], b[1], c[0], c[1]);
      ctx.stroke();
    }

    // crânio
    const poly: [number, number][] = [
      [2.2, 0],
      [1.0, 0.7],
      [-0.3, 0.9],
      [-0.7, 0.45],
      [-0.7, -0.45],
      [-0.3, -0.9],
      [1.0, -0.7],
    ];
    ctx.beginPath();
    poly.forEach(([u, v], i) => {
      const [x, y] = pt(u, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "rgba(150, 190, 255, 0.12)";
    ctx.fill();
    ctx.strokeStyle = "rgba(230, 242, 255, 0.9)";
    ctx.lineWidth = 1.2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // olhos
    ctx.fillStyle = "rgba(255, 255, 255, 1)";
    for (const v of [1, -1]) {
      const [x, y] = pt(0.7, 0.42 * v);
      ctx.beginPath();
      ctx.arc(x, y, 1.5 * this.scale + 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawBones(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = "rgba(120, 255, 190, 0.5)";
    ctx.lineWidth = 1;
    for (let i = 0; i < this.spine.length; i += 2) {
      const p = this.spine[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, this.radii[i]), 0, Math.PI * 2);
      ctx.globalAlpha = 0.25;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // alvo atual
    ctx.strokeStyle = "rgba(255, 190, 110, 0.9)";
    ctx.beginPath();
    ctx.arc(this.goal.x, this.goal.y, 8, 0, Math.PI * 2);
    ctx.moveTo(this.goal.x - 14, this.goal.y);
    ctx.lineTo(this.goal.x + 14, this.goal.y);
    ctx.moveTo(this.goal.x, this.goal.y - 14);
    ctx.lineTo(this.goal.x, this.goal.y + 14);
    ctx.stroke();
  }
}
