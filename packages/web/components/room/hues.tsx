"use client";

import { createContext, useContext, type ReactNode } from "react";
import { hueOf } from "@/lib/presence";

const HueCtx = createContext<Map<string, string>>(new Map());

export function HueProvider({ hues, children }: { hues: Map<string, string>; children: ReactNode }) {
  return <HueCtx.Provider value={hues}>{children}</HueCtx.Provider>;
}

// Someone who has left keeps a stable colour.
export function useHue(): (participantId: string) => string {
  const hues = useContext(HueCtx);
  return (id) => hues.get(id) ?? hueOf(id);
}
