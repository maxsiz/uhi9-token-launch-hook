import { ConnectGate } from "@/components/ConnectGate";
import { GovernanceDashboard } from "@/components/governance/GovernanceDashboard";

export const metadata = { title: "Governance — TokenLaunchHook Studio" };

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
