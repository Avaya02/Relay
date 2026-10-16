import { useLayoutEffect, useState } from "react";

// Prints every [data-t] control's centre in desk coordinates over the frame, for
// the cursor plans: `remotion still … --props '{"measure":true}'`. Remotion
// doesn't relay the page's console, so the numbers are drawn instead.
export function Measure({ scale }: { scale: number }) {
  const [text, setText] = useState("");
  useLayoutEffect(() => {
    const desk = document.querySelector(".desk")?.getBoundingClientRect();
    if (!desk) return;
    const lines: string[] = [];
    document.querySelectorAll<HTMLElement>("[data-t]").forEach((el) => {
      const r = el.getBoundingClientRect();
      const x = Math.round((r.left - desk.left + r.width / 2) / scale);
      const y = Math.round((r.top - desk.top + r.height / 2) / scale);
      lines.push(`${el.dataset.t}: ${x}, ${y}  (${Math.round(r.width / scale)}×${Math.round(r.height / scale)})`);
    });
    setText(lines.join("\n"));
  }, [scale]);
  return <pre className="tour-measure">{text}</pre>;
}
