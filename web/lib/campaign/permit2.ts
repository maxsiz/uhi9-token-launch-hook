/**
 * Permit2 batch signing for ERC-20 launches (existing token and/or ERC-20 pair). Returns `0x` when no
 * pull is needed (fresh token + native ETH). The encoded `(PermitBatch, signature)` tuple matches
 * `abi.decode(permitData, (IAllowanceTransfer.PermitBatch, bytes))` in CampaignWrapper.launchCampaign.
 */
import { encodeAbiParameters, type Address, type Hex, type PublicClient } from "viem";
import { Permit2Abi } from "@/lib/config/abi";

export const EMPTY_PERMIT: Hex = "0x";

const MAX_UINT160 = (1n << 160n) - 1n;
const SIG_DEADLINE_SECS = 60 * 30; // 30 min to submit
const PERMIT_EXPIRATION_SECS = 60 * 60 * 24 * 30; // 30 days of allowance

const PERMIT_DETAILS_COMPONENTS = [
  { name: "token", type: "address" },
  { name: "amount", type: "uint160" },
  { name: "expiration", type: "uint48" },
  { name: "nonce", type: "uint48" },
] as const;

const PERMIT_BATCH_TUPLE = {
  type: "tuple",
  components: [
    { name: "details", type: "tuple[]", components: PERMIT_DETAILS_COMPONENTS },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
} as const;

const EIP712_TYPES = {
  PermitDetails: PERMIT_DETAILS_COMPONENTS.map((c) => ({ name: c.name, type: c.type })),
  PermitBatch: [
    { name: "details", type: "PermitDetails[]" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
} as const;

export interface Permit2Input {
  owner: Address;
  spender: Address; // CampaignWrapper
  chainId: number;
  permit2: Address;
  tokens: { token: Address; amount: bigint }[];
  publicClient: PublicClient;
  /** wagmi `signTypedDataAsync` (or any viem-compatible typed-data signer). */
  signTypedData: (args: {
    domain: { name: string; chainId: number; verifyingContract: Address };
    types: Record<string, readonly { name: string; type: string }[]>;
    primaryType: "PermitBatch";
    message: Record<string, unknown>;
  }) => Promise<Hex>;
}

/** Read the current Permit2 nonce for (owner, token, spender). */
async function readNonce(i: Permit2Input, token: Address): Promise<number> {
  const res = (await i.publicClient.readContract({
    address: i.permit2,
    abi: Permit2Abi,
    functionName: "allowance",
    args: [i.owner, token, i.spender],
  })) as readonly [bigint, number, number];
  return res[2];
}

export async function buildPermitData(i: Permit2Input): Promise<Hex> {
  if (i.tokens.length === 0) return EMPTY_PERMIT;

  const now = Math.floor(Date.now() / 1000);
  const expiration = now + PERMIT_EXPIRATION_SECS;
  const sigDeadline = BigInt(now + SIG_DEADLINE_SECS);

  const details = await Promise.all(
    i.tokens.map(async (t) => ({
      token: t.token,
      amount: MAX_UINT160, // approve max; the wrapper pulls only amountMax per side
      expiration,
      nonce: await readNonce(i, t.token),
    }))
  );

  const batch = { details, spender: i.spender, sigDeadline };

  const signature = await i.signTypedData({
    domain: { name: "Permit2", chainId: i.chainId, verifyingContract: i.permit2 },
    types: EIP712_TYPES,
    primaryType: "PermitBatch",
    message: batch,
  });

  return encodeAbiParameters([PERMIT_BATCH_TUPLE, { type: "bytes" }], [batch, signature]);
}
