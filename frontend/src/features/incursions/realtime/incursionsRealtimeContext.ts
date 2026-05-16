import { createContext } from "react";
import type { IncursionsRealtimeContextValue } from "./IncursionsRealtimeProvider";

export const IncursionsRealtimeContext =
  createContext<IncursionsRealtimeContextValue | null>(null);
