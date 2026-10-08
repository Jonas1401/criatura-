import { useState } from "react";
import CreatureCanvas from "./components/CreatureCanvas";
import CodePanel from "./components/CodePanel";
import { settings } from "./creature/settings";
import limSource from "./creature/LimSystem.ts?raw";
import { cn } from "./utils/cn";

function Toggle({
  label,
  hint,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      className={cn(
        "pointer-events-auto flex items-center gap-2 rounded-full border px-3.5 py-1.5 font-mono text-[11px] tracking-wide transition",
        active
          ? "border-sky-300/60 bg-sky-300/15 text-sky-100 shadow-[0_0_18px_-4px_rgba(125,200,255,0.6)]"
          : "border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full transition",
          active ? "bg-sky-300" : "bg-slate-500"
        )}
      />
      {label}
    </button>
  );
}

export default function App() {
  const [ik, setIk] = useState(false);
  const [bones, setBones] = useState(false);
  const [code, setCode] = useState(false);

  return (
    <div
      className="relative h-screen w-screen overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 45%, #0a111d 0%, #04060b 55%, #000 100%)",
      }}
    >
      <CreatureCanvas />

      {/* título */}
      <div className="pointer-events-none absolute left-5 top-5 z-10 select-none sm:left-7 sm:top-6">
        <h1 className="font-mono text-sm font-semibold tracking-[0.3em] text-white/90">
          LIM<span className="text-sky-300">SYSTEM</span>
        </h1>
        <p className="mt-1 max-w-[240px] font-mono text-[11px] leading-4 text-slate-400">
          criatura procedural · cinemática inversa (FABRIK) · passos alternados
        </p>
      </div>

      {/* controles */}
      <div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-2 sm:right-6 sm:top-5">
        <Toggle
          label="IK: patas seguem o mouse"
          hint="Todas as patas apontam direto para o cursor (this.moveTo(Input.mouse.x, Input.mouse.y))"
          active={ik}
          onClick={() => {
            settings.ikMode = !ik;
            setIk(!ik);
          }}
        />
        <Toggle
          label="ossos"
          hint="Mostra alvo, alcance das patas e nós da coluna"
          active={bones}
          onClick={() => {
            settings.showBones = !bones;
            setBones(!bones);
          }}
        />
        <Toggle
          label="{ } código"
          hint="Ver a classe LimSystem completa"
          active={code}
          onClick={() => setCode(!code)}
        />
      </div>

      {/* dica */}
      <div className="pointer-events-none absolute bottom-5 left-5 z-10 select-none font-mono text-[11px] text-slate-500 sm:bottom-6 sm:left-7">
        {ik
          ? "modo IK — mexa o mouse e veja as patas esticarem até o cursor"
          : "mova o mouse — a criatura te segue · parado por 6s ela passeia sozinha"}
      </div>

      <CodePanel source={limSource} open={code} onClose={() => setCode(false)} />
    </div>
  );
}
