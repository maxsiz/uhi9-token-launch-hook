import { ConnectGate } from "@/components/ConnectGate";
import { GovernanceDashboard } from "@/components/governance/GovernanceDashboard";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Governance dashboard",
  description:
    "Manage a live TokenLaunchHook campaign from the governance NFT: relax the tax curve, shorten the lock, edit the whitelist, and watch the hook state per pool.",
  alternates: { canonical: "/governance" },
};

export default function GovernancePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Governance dashboard</h1>
      <ConnectGate>
        <GovernanceDashboard />
      </ConnectGate>
    </div>
  );
}
