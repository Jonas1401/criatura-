import type { Creature } from "./Creature";
import { Input } from "./Input";
import { Node } from "./Node";
import { lerp } from "./math";
import { settings } from "./settings";

export interface LimOptions {
  /** +1 = lado direito do corpo, -1 = lado esquerdo */
  side: 1 | -1;
  /** inclinação da pata: >0 aponta p/ frente, <0 aponta p/ trás (rad) */
  sweep: number;
  /** distância ideal do pé ao quadril */
  reach: number;
  /** true → cotovelo dobra para trás; false → joelho dobra para frente */
  bendBack: boolean;
  /** grupo da marcha (patas do mesmo grupo andam juntas) */
  group: number;
}

export class LimSystem {
  creature: Creature;
  nodes: Node[];
  length: number;
  hip: Node;
  speed: number;

  // --- configuração da pata ---
  hipIndex: number;
  side: 1 | -1;
  sweep: number;
  reach: number;
  bendBack: boolean;
  group: number;
  totalLength: number;

  // --- estado do passo ---
  target = { x: 0, y: 0 }; // onde o pé está plantado
  from = { x: 0, y: 0 };
  stepping = false;
  stepT = 0;
  lift = 0;

  constructor(
    end: Node,
    length: number,
    speed: number,
    creature: Creature,
    opts: Partial<LimOptions> = {}
  ) {
    this.creature = creature;
    this.speed = speed;
    this.nodes = [];
    this.length = length;

    // sobe a cadeia a partir do pé até encontrar o nó que NÃO é segmento
    // do membro (o quadril, que fica na coluna da criatura)
    let node: Node = end;
    for (let i = 0; i < length; i++) {
      this.nodes.unshift(node);
      node = node.parent!;
      if (!node.isSegment) {
        this.length = i + 1;
        break;
      }
    }

    this.hip = this.nodes[0].parent!;

    // ---- configuração extra ----
    this.hipIndex = creature.spine.indexOf(this.hip);
    this.side = opts.side ?? 1;
    this.sweep = opts.sweep ?? 0;
    this.reach = opts.reach ?? 80;
    this.bendBack = opts.bendBack ?? true;
    this.group = opts.group ?? 0;
    this.totalLength = this.nodes.reduce((s, n) => s + n.boneLength, 0);

    this.reset();
  }

  /** posição ideal do pé (sem antecipação de movimento) */
  private base() {
    const f = this.creature.forwardAt(this.hipIndex);
    const heading = Math.atan2(f.y, f.x);
    const ang = heading + this.side * (Math.PI / 2 - this.sweep);
    return {
      x: this.hip.x + Math.cos(ang) * this.reach,
      y: this.hip.y + Math.sin(ang) * this.reach,
    };
  }

  /** planta o pé na posição ideal e arruma os ossos */
  reset() {
    const b = this.base();
    this.target.x = b.x;
    this.target.y = b.y;
    this.stepping = false;
    this.stepT = 0;
    this.lift = 0;
    // espalha os nós em linha antes de resolver o IK
    this.nodes.forEach((n, i) => {
      const t = (i + 1) / this.nodes.length;
      n.x = lerp(this.hip.x, b.x, t);
      n.y = lerp(this.hip.y, b.y, t);
    });
    this.moveTo(b.x, b.y);
  }

  update(dt = 1) {
    if (settings.ikMode) {
      // modo IK puro: a pata inteira persegue o mouse
      const t = Input.moved ? Input.mouse : this.creature.goal;
      this.moveTo(t.x, t.y);
      const foot = this.nodes[this.nodes.length - 1];
      this.target.x = foot.x;
      this.target.y = foot.y;
      this.stepping = false;
      this.lift = 0;
      return;
    }
    this.step(dt);
  }

  /** lógica de caminhada: planta o pé e dá um passo quando ele fica longe */
  private step(dt: number) {
    const { hip } = this;
    const base = this.base();

    // velocidade do quadril → antecipa o destino do passo
    const vx = (hip.x - hip.px) / dt;
    const vy = (hip.y - hip.py) / dt;
    let lx = vx * 10;
    let ly = vy * 10;
    const lm = Math.hypot(lx, ly);
    const maxLead = this.reach * 0.5;
    if (lm > maxLead) {
      lx *= maxLead / lm;
      ly *= maxLead / lm;
    }
    const ideal = { x: base.x + lx, y: base.y + ly };

    if (!this.stepping) {
      const d = Math.hypot(this.target.x - base.x, this.target.y - base.y);
      const hd = Math.hypot(this.target.x - hip.x, this.target.y - hip.y);
      const overstretched = hd > this.totalLength * 0.97;
      if ((d > this.reach * 0.5 && this.creature.canStep(this)) || overstretched) {
        this.stepping = true;
        this.stepT = 0;
        this.from.x = this.target.x;
        this.from.y = this.target.y;
      }
    }

    let fx = this.target.x;
    let fy = this.target.y;
    this.lift = 0;

    if (this.stepping) {
      const bodySpeed = Math.hypot(vx, vy);
      this.stepT += (this.speed + bodySpeed * 0.02) * dt;
      const t = Math.min(this.stepT, 1);
      const e = t * t * (3 - 2 * t); // smoothstep
      fx = lerp(this.from.x, ideal.x, e);
      fy = lerp(this.from.y, ideal.y, e);
      this.lift = Math.sin(Math.PI * t);
      if (this.stepT >= 1) {
        this.stepping = false;
        this.target.x = ideal.x;
        this.target.y = ideal.y;
        fx = ideal.x;
        fy = ideal.y;
        this.lift = 0;
      }
    }

    this.moveTo(fx, fy);
  }

  /**
   * Cinemática inversa (FABRIK): o quadril fica fixo e a cadeia de nós
   * é esticada/dobrada para o pé alcançar (x, y).
   */
  moveTo(tx: number, ty: number) {
    const chain: Node[] = [this.hip, ...this.nodes];
    const n = chain.length;
    const ox = this.hip.x;
    const oy = this.hip.y;

    const dx = tx - ox;
    const dy = ty - oy;
    const dist = Math.hypot(dx, dy) || 0.0001;

    // alvo fora de alcance → perna esticada em linha reta
    if (dist >= this.totalLength) {
      let acc = 0;
      for (let i = 1; i < n; i++) {
        acc += chain[i].boneLength;
        chain[i].x = ox + (dx / dist) * acc;
        chain[i].y = oy + (dy / dist) * acc;
      }
      return;
    }

    const pull = (node: Node, anchor: { x: number; y: number }, d: number) => {
      const ax = node.x - anchor.x;
      const ay = node.y - anchor.y;
      const m = Math.hypot(ax, ay) || 0.0001;
      node.x = anchor.x + (ax / m) * d;
      node.y = anchor.y + (ay / m) * d;
    };

    const foot = chain[n - 1];
    for (let iter = 0; iter < 12; iter++) {
      // 1) de trás pra frente: o pé vai pro alvo
      foot.x = tx;
      foot.y = ty;
      for (let i = n - 2; i >= 1; i--) {
        pull(chain[i], chain[i + 1], chain[i + 1].boneLength);
      }
      // 2) da frente pra trás: o quadril volta ao lugar
      for (let i = 1; i < n; i++) {
        pull(chain[i], chain[i - 1], chain[i].boneLength);
      }
      if (Math.hypot(foot.x - tx, foot.y - ty) < 0.1) break;
    }

    // perna de 2 ossos: garante o lado em que o joelho dobra
    if (n === 3) {
      const a = chain[0];
      const b = chain[1];
      const c = chain[2];
      const cross = (c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x);
      const wanted = this.side * (this.bendBack ? 1 : -1);
      if (Math.sign(cross) !== wanted && cross !== 0) {
        // reflete o joelho em relação à linha quadril → pé
        const lx = c.x - a.x;
        const ly = c.y - a.y;
        const lm = Math.hypot(lx, ly) || 0.0001;
        const ux = lx / lm;
        const uy = ly / lm;
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const p = vx * ux + vy * uy;
        b.x = a.x + 2 * ux * p - vx;
        b.y = a.y + 2 * uy * p - vy;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    const s = this.creature.scale;
    const chain: Node[] = [this.hip, ...this.nodes];
    const foot = chain[chain.length - 1];
    const prev = chain[chain.length - 2];

    // ossos da pata
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(chain[0].x, chain[0].y);
    for (let i = 1; i < chain.length; i++) ctx.lineTo(chain[i].x, chain[i].y);
    ctx.strokeStyle = "rgba(205, 220, 240, 0.7)";
    ctx.lineWidth = 1.3 * s + 0.2;
    ctx.stroke();

    // articulações
    ctx.fillStyle = "rgba(235, 245, 255, 0.9)";
    for (let i = 1; i < chain.length - 1; i++) {
      ctx.beginPath();
      ctx.arc(chain[i].x, chain[i].y, 1.8 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // garra (triângulo) — cresce um pouco quando o pé está levantado
    const dx = foot.x - prev.x;
    const dy = foot.y - prev.y;
    const m = Math.hypot(dx, dy) || 1;
    const ux = dx / m;
    const uy = dy / m;
    const k = s * (1 + this.lift * 0.7);
    ctx.beginPath();
    ctx.moveTo(foot.x + ux * 6 * k, foot.y + uy * 6 * k);
    ctx.lineTo(foot.x - ux * 3 * k - uy * 5 * k, foot.y - uy * 3 * k + ux * 5 * k);
    ctx.lineTo(foot.x - ux * 3 * k + uy * 5 * k, foot.y - uy * 3 * k - ux * 5 * k);
    ctx.closePath();
    ctx.fillStyle = `rgba(225, 238, 255, ${0.55 + this.lift * 0.4})`;
    ctx.fill();

    if (settings.showBones) {
      ctx.save();
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = "rgba(120, 190, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.hip.x, this.hip.y, this.reach, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      ctx.strokeStyle = this.stepping ? "rgba(255,170,90,0.9)" : "rgba(120,255,190,0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.target.x, this.target.y, 4 * s, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
