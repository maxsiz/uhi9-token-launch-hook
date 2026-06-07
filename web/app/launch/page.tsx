import { ConnectGate } from "@/components/ConnectGate";
import { LaunchWizard } from "@/components/wizard/WizardShell";
import { WalletDebug } from "@/components/debug/WalletDebug";

export const metadata = { title: "Launch — TokenLaunchHook Studio" };

export default function LaunchPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Launch a campaign</h1>
      <WalletDebug />
      <ConnectGate requireEoa>
        <LaunchWizard />
      </ConnectGate>
    </div>
  );
}
