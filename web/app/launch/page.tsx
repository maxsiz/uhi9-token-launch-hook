import { ConnectGate } from "@/components/ConnectGate";
import { LaunchWizard } from "@/components/wizard/WizardShell";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Launch a campaign",
  description:
    "Configure and launch a fair-launch Uniswap v4 campaign in one transaction: pick the token and pair, set the anti-snipe cap, the decaying buy/sell tax, the liquidity lock and the whitelist window.",
  alternates: { canonical: "/launch" },
};

export default function LaunchPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Launch a campaign</h1>
      <ConnectGate requireEoa>
        <LaunchWizard />
      </ConnectGate>
    </div>
  );
}
