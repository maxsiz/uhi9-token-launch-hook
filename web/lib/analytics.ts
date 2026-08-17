// Thin, typed wrapper around the GTM dataLayer. The GTM container (see lib/config/site.ts) holds a
// GA4 configuration tag plus one GA4 event tag per event name below, so adding an event here means
// adding a trigger + tag in GTM — the names must match exactly.
//
// No-ops unless the container is actually mounted (see app/layout.tsx): stage, previews and local
// dev never emit, so the property only ever holds production traffic.
//
// Privacy: no wallet address, no ENS name, no tx hash and no token amount owned by a user is ever
// sent. Chain ids, module flags, coarse counts and pool ids are not personal data.
//
// Consent (known debt, same as unisafe): there is no consent banner yet, so GA4 runs with
// analytics_storage granted by default, which is not GDPR-clean for the EEA. When Consent Mode v2
// lands, gate `track()` here and no call site has to change.

import { sendGTMEvent } from "@next/third-parties/google";
import { GTM_ID, INDEXABLE } from "@/lib/config/site";

export type AnalyticsEvents = {
  wallet_connect: { connector?: string; chain_id?: number };
  wallet_disconnect: { chain_id?: number };
  /** Wizard submitted — the user signed up for the whole launch flow. */
  launch_start: { chain_id: number; token_mode: "new" | "existing"; pair_mode: "native" | "erc20"; modules: string };
  /** Campaign is on-chain. The conversion this site exists for. */
  launch_campaign: { chain_id: number; token_mode: "new" | "existing"; pair_mode: "native" | "erc20"; modules: string };
  swap_execute: { chain_id: number; direction: "buy" | "sell" };
  governance_update: { chain_id: number; action: string };
};

export type AnalyticsEvent = keyof AnalyticsEvents;

/** Emit a typed event to the dataLayer. Safe anywhere on the client; never throws. */
export function track<E extends AnalyticsEvent>(event: E, params: AnalyticsEvents[E]): void {
  if (!GTM_ID || !INDEXABLE) return;
  try {
    sendGTMEvent({ event, ...params });
  } catch {
    // analytics must never be able to break the app
  }
}

/** Compact, stable label for which hook modules a campaign enabled, e.g. "antiSnipe+tax". */
export function moduleLabel(enabled: Record<string, boolean>): string {
  const on = Object.entries(enabled)
    .filter(([, v]) => v)
    .map(([k]) => k);
  return on.length ? on.join("+") : "none";
}
