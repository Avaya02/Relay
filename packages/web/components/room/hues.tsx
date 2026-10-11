"use client";

import { createContext, useContext, type ReactNode } from "react";
import { hueOf } from "@/lib/presence";

const HueCtx = createContext<Map<string, string>>(new Map());

/** The room's colour assignment (lib/presence assignHues), shared below it. */
export function HueProvider({ hues, children }: { hues: Map<string, string>; children: ReactNode }) {
  return <HueCtx.Provider value={hues}>{children}</HueCtx.Provider>;
}

/** The room's colour for a participant; someone who has left keeps a stable one. */
export function useHue(): (participantId: string) => string {
  const hues = useContext(HueCtx);
  return (id) => hues.get(id) ?? hueOf(id);
}
