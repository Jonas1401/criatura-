/**
 * Um nó da cadeia (coluna ou membro).
 *
 *  - `parent`      → nó "anterior" na cadeia (quadril, joelho, cabeça…)
 *  - `isSegment`   → true para nós que pertencem a um membro (joelho/pé).
 *                    Os nós da coluna têm isSegment = false, então o
 *                    LimSystem sabe onde o membro termina (o "quadril").
 *  - `boneLength`  → distância fixa até o parent.
 */
export class Node {
  x: number;
  y: number;
  /** posição no frame anterior (para calcular velocidade) */
  px: number;
  py: number;
  parent: Node | null;
  isSegment: boolean;
  boneLength: number;

  constructor(
    x: number,
    y: number,
    parent: Node | null = null,
    isSegment = false,
    boneLength = 0
  ) {
    this.x = x;
    this.y = y;
    this.px = x;
    this.py = y;
    this.parent = parent;
    this.isSegment = isSegment;
    this.boneLength = boneLength;
  }
}
