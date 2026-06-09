/**
 * Browser-side injected-wallet shim for Playwright. Bundled by global-setup (esbuild → IIFE) and
 * injected with `context.addInitScript` BEFORE app code runs, so wagmi's `injected()` connector +
 * EIP-6963 discovery pick it up exactly like a real MetaMask/Rabby extension — no extension needed.
 *
 * It is a real EIP-1193 provider backed by a viem account (throwaway test key, passed in at runtime —
 * never hardcoded). Signing methods (eth_sendTransaction / eth_signTypedData_v4 / personal_sign) are
 * served locally by the key; everything else is forwarded to the live RPC. Nonces are tracked locally
 * to ride out the load-balanced public RPC's head-lag (same race Harness A hit).
 *
 * Defines `window.__installE2EWallet(cfg)`; the test calls it via a second addInitScript carrying the key.
 */
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { unichainSepolia } from "viem/chains";

type Cfg = { key: `0x${string}`; rpc: string; chainId: number };
type Listener = (...args: unknown[]) => void;

declare global {
  interface Window {
    __installE2EWallet?: (cfg: Cfg) => void;
    ethereum?: unknown;
  }
}

window.__installE2EWallet = (cfg: Cfg) => {
  const account = privateKeyToAccount(cfg.key);
  const pub = createPublicClient({ chain: unichainSepolia, transport: http(cfg.rpc) });
  const wallet = createWalletClient({ account, chain: unichainSepolia, transport: http(cfg.rpc) });
  const chainHex = ("0x" + cfg.chainId.toString(16)) as `0x${string}`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const listeners: Record<string, Listener[]> = {};
  const emit = (e: string, ...a: unknown[]) => (listeners[e] || []).forEach((f) => f(...a));

  // Local nonce manager: the public RPC is load-balanced and nodes disagree on the nonce, so seed from
  // the confirmed (latest) count and trust the authoritative "next nonce N" returned on rejection.
  let nonce: number | null = null;
  async function send(t: { to: `0x${string}`; data?: `0x${string}`; value?: string; gas?: string }): Promise<string> {
    for (let i = 0; i < 12; i++) {
      try {
        if (nonce == null) nonce = Number(await pub.getTransactionCount({ address: account.address, blockTag: "latest" }));
        const hash = await wallet.sendTransaction({
          to: t.to,
          data: t.data,
          value: t.value ? BigInt(t.value) : undefined,
          gas: t.gas ? BigInt(t.gas) : undefined,
          nonce,
        });
        nonce++;
        return hash;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        const next = m.match(/next nonce (\d+)/i);
        if (next) nonce = Number(next[1]);
        else if (/nonce too low|already known|replacement transaction underpriced/i.test(m)) nonce = (nonce ?? 0) + 1;
        else throw e;
        await sleep(1000);
      }
    }
    throw new Error("shim send: nonce retries exhausted");
  }

  const provider = {
    isMetaMask: true,
    isE2E: true,
    async request({ method, params }: { method: string; params?: unknown[] }): Promise<unknown> {
      switch (method) {
        case "eth_requestAccounts":
        case "eth_accounts":
          return [account.address];
        case "eth_chainId":
          return chainHex;
        case "net_version":
          return String(cfg.chainId);
        case "wallet_switchEthereumChain":
        case "wallet_addEthereumChain":
          return null;
        case "wallet_requestPermissions":
        case "wallet_getPermissions":
          return [{ parentCapability: "eth_accounts" }];
        case "eth_sendTransaction":
          return send((params as [{ to: `0x${string}`; data?: `0x${string}`; value?: string; gas?: string }])[0]);
        case "eth_signTypedData_v4": {
          const [, payload] = params as [string, string | object];
          const td = (typeof payload === "string" ? JSON.parse(payload) : payload) as {
            domain: Record<string, unknown>;
            types: Record<string, unknown>;
            primaryType: string;
            message: Record<string, unknown>;
          };
          const { EIP712Domain: _omit, ...types } = td.types as Record<string, unknown>;
          return account.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message } as Parameters<typeof account.signTypedData>[0]);
        }
        case "personal_sign": {
          const [data] = params as [`0x${string}`];
          return account.signMessage({ message: { raw: data } });
        }
        default:
          // Forward reads (eth_call, eth_getBalance, eth_estimateGas, …) to the live RPC.
          return pub.request({ method, params } as Parameters<typeof pub.request>[0]);
      }
    },
    on(e: string, f: Listener) {
      (listeners[e] || (listeners[e] = [])).push(f);
      return provider;
    },
    removeListener(e: string, f: Listener) {
      listeners[e] = (listeners[e] || []).filter((x) => x !== f);
      return provider;
    },
  };

  (window as Window).ethereum = provider;

  // EIP-6963 announce so wagmi's multi-injected discovery lists it as a selectable wallet.
  const info = {
    uuid: "e2e00000-0000-4000-8000-000000000000",
    name: "E2E Wallet",
    icon: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz4=",
    rdns: "dev.e2e.wallet",
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();

  setTimeout(() => emit("connect", { chainId: chainHex }), 0);
};
