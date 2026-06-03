import type { EnabledMechanisms } from "./types";

export type PresetId = "memecoin" | "fairLaunch" | "rwa" | "dao" | "custom";

export interface Preset {
  id: PresetId;
  label: string;
  description: string;
  enabled: EnabledMechanisms;
}

export const PRESETS: Preset[] = [
  {
    id: "memecoin",
    label: "Memecoin",
    description: "Anti-snipe + tax + liquidity lock. Defends a hype launch.",
    enabled: { antiSnipe: true, tax: true, lock: true, whitelist: false },
  },
  {
    id: "fairLaunch",
    label: "Fair Launch",
    description: "Anti-snipe + tax + liquidity lock. Even start for everyone.",
    enabled: { antiSnipe: true, tax: true, lock: true, whitelist: false },
  },
  {
    id: "rwa",
    label: "RWA / Permissioned",
    description: "Liquidity lock + whitelist. Gated, compliance-friendly.",
    enabled: { antiSnipe: false, tax: false, lock: true, whitelist: true },
  },
  {
    id: "dao",
    label: "DAO Token",
    description: "Tax + liquidity lock. Treasury-aligned, no gate.",
    enabled: { antiSnipe: false, tax: true, lock: true, whitelist: false },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Toggle every mechanism yourself.",
    enabled: { antiSnipe: false, tax: false, lock: false, whitelist: false },
  },
];

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p])) as Record<PresetId, Preset>;
