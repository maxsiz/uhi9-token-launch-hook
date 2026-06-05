"use client";

import { useMemo, useState } from "react";
import { PRESETS, type PresetId } from "@/lib/campaign/presets";
import type { EnabledMechanisms } from "@/lib/campaign/types";
import { hookPlan } from "@/lib/hook/hookMap";
import { HookExplainer } from "@/components/hook/HookExplainer";
import { HookBadge } from "@/components/hook/HookBadge";

const STEPS = ["Token", "Pool & price", "Mechanisms", "Review", "Sign"] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

const FEATURE_OF: Record<keyof EnabledMechanisms, "antiSnipe" | "tax" | "lock" | "whitelist"> = {
  antiSnipe: "antiSnipe",
  tax: "tax",
  lock: "lock",
  whitelist: "whitelist",
};

export function LaunchWizard() {
  const [step, setStep] = useState<StepIndex>(0);
  const [presetId, setPresetId] = useState<PresetId>("memecoin");
  const [enabled, setEnabled] = useState<EnabledMechanisms>(PRESETS[0].enabled);

  const plan = useMemo(() => hookPlan(enabled), [enabled]);

  function choosePreset(id: PresetId) {
    setPresetId(id);
    const p = PRESETS.find((x) => x.id === id)!;
    setEnabled(p.enabled);
  }
  function toggle(k: keyof EnabledMechanisms) {
    setPresetId("custom");
    setEnabled((e) => ({ ...e, [k]: !e[k] }));
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <ol className="flex flex-wrap gap-2 text-sm">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              i === step ? "bg-blue-600 text-white" : i < step ? "bg-neutral-800 text-neutral-300" : "bg-neutral-900 text-neutral-500"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 && <PlaceholderStep title="Token" note="Deploy a new ERC-20 (name / symbol / total supply) or paste an existing token address." feature="launch.bootstrap" />}
      {step === 1 && <PlaceholderStep title="Pool & price" note="Pick the pair (native ETH or ERC-20), the initial price, the seed amounts, and the range. priceMath.ts (v4-sdk) derives sqrtPrice / ticks / liquidity." feature="launch.bootstrap" />}

      {step === 2 && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h3 className="font-semibold">Choose a preset</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => choosePreset(p.id)}
                  className={`card text-left transition ${presetId === p.id ? "border-blue-600" : "hover:border-neutral-600"}`}
                >
                  <div className="font-medium">{p.label}</div>
                  <div className="text-sm text-neutral-400">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Mechanisms</h3>
            {(Object.keys(FEATURE_OF) as (keyof EnabledMechanisms)[]).map((k) => (
              <label key={k} className="flex items-center gap-3 rounded-lg border border-neutral-800 p-3">
                <input type="checkbox" checked={enabled[k]} onChange={() => toggle(k)} />
                <span className="flex-1 capitalize">{k}</span>
                <HookBadge feature={FEATURE_OF[k]} />
              </label>
            ))}
          </div>

          {/* The demo highlight: which hook callbacks this config will run */}
          <HookPlan plan={plan} />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold">Review — Hook plan</h3>
          <p className="text-sm text-neutral-400">
            With this configuration, the following hook callbacks will run on your pool. A
            <code className="mx-1 font-mono">simulateContract</code> dry-run gates the final sign step.
          </p>
          <div className="space-y-2">
            {plan.map((f) => (
              <HookExplainer key={f.key} feature={f.key} />
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="card space-y-2 text-sm">
          <p className="font-medium">Sign</p>
          <p className="text-neutral-400">
            Scaffold: wire <code className="font-mono">priceMath.ts</code>,{" "}
            <code className="font-mono">buildParams.ts</code> and <code className="font-mono">permit2.ts</code>, then
            <code className="mx-1 font-mono">simulateContract</code> → <code className="font-mono">writeContract</code>{" "}
            against <code className="font-mono">CampaignWrapper.launchCampaign</code>. On success the receipt is
            passed to <code className="font-mono">&lt;HookCallTrace/&gt;</code> to prove the hook ran.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn-ghost" disabled={step === 0} onClick={() => setStep((s) => (s - 1) as StepIndex)}>
          Back
        </button>
        <button className="btn-primary" disabled={step === 4} onClick={() => setStep((s) => (s + 1) as StepIndex)}>
          Next
        </button>
      </div>
    </div>
  );
}

function HookPlan({ plan }: { plan: ReturnType<typeof hookPlan> }) {
  return (
    <div className="card">
      <h4 className="mb-2 text-sm font-semibold">Hook plan — what runs on-chain</h4>
      <div className="space-y-2">
        {plan.map((f) => (
          <HookExplainer key={f.key} feature={f.key} />
        ))}
      </div>
    </div>
  );
}

function PlaceholderStep({ title, note, feature }: { title: string; note: string; feature: "launch.bootstrap" }) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <HookBadge feature={feature} />
      </div>
      <p className="text-sm text-neutral-400">{note}</p>
      <p className="text-xs text-neutral-600">Scaffold placeholder — form fields wired in a later phase (DESIGN.md §9).</p>
    </div>
  );
}
