#!/usr/bin/env python3
"""Print block-explorer links for the 3 lifecycle transactions of ModelCampaign.s.sol.

A forge script cannot know its own transaction hashes at run() time (they are assigned only after
broadcast), so this companion reads the broadcast artifact that `forge script ... --broadcast` writes
and emits the labelled explorer links.

Usage:
    python3 script/print_tx_links.py [chainId]      # chainId defaults to 1301 (Unichain Sepolia)
"""

import json
import sys
from pathlib import Path

# Block-explorer base URL per chain id (mirrors HookDeployLib.explorerBaseUrl in script/MineSalt.s.sol).
EXPLORERS = {
    1: "https://etherscan.io",
    8453: "https://basescan.org",
    42161: "https://arbiscan.io",
    130: "https://uniscan.xyz",
    1301: "https://sepolia.uniscan.xyz",
    11155111: "https://sepolia.etherscan.io",
}

# Lifecycle transactions, in order: (label, function-name prefix in the broadcast artifact).
STEPS = [
    ("Campaign create (launchCampaign)", "launchCampaign("),
    ("Campaign change (addToWhitelist)", "addToWhitelist("),
    ("Swap (swap)", "swap("),
]

SCRIPT = "ModelCampaign.s.sol"


def main() -> int:
    chain_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1301
    explorer = EXPLORERS.get(chain_id)
    if explorer is None:
        print(f"Unknown chainId {chain_id}; no explorer base configured.", file=sys.stderr)
        return 1

    repo = Path(__file__).resolve().parent.parent
    artifact = repo / "broadcast" / SCRIPT / str(chain_id) / "run-latest.json"
    if not artifact.exists():
        print(
            f"Broadcast artifact not found: {artifact}\n"
            f"Run the script with --broadcast first:\n"
            f"  forge script script/{SCRIPT} --rpc-url <unichain-sepolia> --broadcast --private-key <key>",
            file=sys.stderr,
        )
        return 1

    data = json.loads(artifact.read_text())
    txs = data.get("transactions", [])
    receipts = data.get("receipts", [])

    # IMPORTANT: do NOT use transactions[].hash — forge writes it scrambled (assigned in mined-nonce
    # order, not call order), so it does not match transactions[].function. The reliable mapping is
    # transactions[i].function (decoded from that call's data) paired with receipts[i].transactionHash,
    # which forge writes index-aligned with the transactions array.
    if len(receipts) != len(txs):
        print(
            f"Warning: {len(txs)} transactions vs {len(receipts)} receipts — index alignment may be off.",
            file=sys.stderr,
        )

    def hash_for(prefix: str):
        for i, t in enumerate(txs):
            if (t.get("function") or "").startswith(prefix) and i < len(receipts):
                return receipts[i].get("transactionHash")
        return None

    print(f"Explorer: {explorer}  (chainId {chain_id})\n")
    missing = False
    for label, prefix in STEPS:
        tx_hash = hash_for(prefix)
        if tx_hash:
            print(f"{label}:\n  {explorer}/tx/{tx_hash}\n")
        else:
            missing = True
            print(f"{label}:\n  (transaction not found in {artifact.name})\n")

    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
