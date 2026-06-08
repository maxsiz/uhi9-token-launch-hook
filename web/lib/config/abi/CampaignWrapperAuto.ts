// AUTO-EXTRACTED from out/CampaignWrapper.sol/CampaignWrapper.json (task_020) — the auto-priced
// launchCampaign(AutoLaunchParams, bytes) overload only. A dedicated single-function ABI avoids viem
// overload ambiguity with launchCampaign(CampaignParams, bytes).
export const CampaignWrapperAutoAbi = [
  {
    "type": "function",
    "name": "launchCampaign",
    "inputs": [
      {
        "name": "p",
        "type": "tuple",
        "internalType": "struct CampaignWrapper.AutoLaunchParams",
        "components": [
          {
            "name": "tokenConfig",
            "type": "tuple",
            "internalType": "struct TokenDeployConfig",
            "components": [
              {
                "name": "name",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "symbol",
                "type": "string",
                "internalType": "string"
              },
              {
                "name": "totalSupply",
                "type": "uint256",
                "internalType": "uint256"
              }
            ]
          },
          {
            "name": "pairToken",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "fee",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "tickSpacing",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "rangeTicks",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "seedTokenAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "seedPairAmount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "lpRecipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "launchConfig",
            "type": "tuple",
            "internalType": "struct MechanismConfig.LaunchConfig",
            "components": [
              {
                "name": "deployer",
                "type": "address",
                "internalType": "address"
              },
              {
                "name": "launchDuration",
                "type": "uint64",
                "internalType": "uint64"
              },
              {
                "name": "tokenIsCurrency0",
                "type": "bool",
                "internalType": "bool"
              },
              {
                "name": "expectedInitialSqrtPrice",
                "type": "uint160",
                "internalType": "uint160"
              },
              {
                "name": "enabled",
                "type": "tuple",
                "internalType": "struct MechanismConfig.EnabledMechanisms",
                "components": [
                  {
                    "name": "antiSnipe",
                    "type": "bool",
                    "internalType": "bool"
                  },
                  {
                    "name": "tax",
                    "type": "bool",
                    "internalType": "bool"
                  },
                  {
                    "name": "lock",
                    "type": "bool",
                    "internalType": "bool"
                  },
                  {
                    "name": "whitelist",
                    "type": "bool",
                    "internalType": "bool"
                  }
                ]
              },
              {
                "name": "antiSnipe",
                "type": "tuple",
                "internalType": "struct AntiSnipeMechanism.AntiSnipeConfig",
                "components": [
                  {
                    "name": "antiSnipeDuration",
                    "type": "uint32",
                    "internalType": "uint32"
                  },
                  {
                    "name": "maxBuyAmountIn",
                    "type": "uint128",
                    "internalType": "uint128"
                  }
                ]
              },
              {
                "name": "tax",
                "type": "tuple",
                "internalType": "struct BuySellTaxMechanism.BuySellTaxConfig",
                "components": [
                  {
                    "name": "initialBuyTax",
                    "type": "uint24",
                    "internalType": "uint24"
                  },
                  {
                    "name": "initialSellTax",
                    "type": "uint24",
                    "internalType": "uint24"
                  },
                  {
                    "name": "baseTax",
                    "type": "uint24",
                    "internalType": "uint24"
                  },
                  {
                    "name": "decayDuration",
                    "type": "uint32",
                    "internalType": "uint32"
                  },
                  {
                    "name": "manualBuyTax",
                    "type": "uint24",
                    "internalType": "uint24"
                  },
                  {
                    "name": "manualSellTax",
                    "type": "uint24",
                    "internalType": "uint24"
                  }
                ]
              },
              {
                "name": "lock",
                "type": "tuple",
                "internalType": "struct LiquidityLockMechanism.LiquidityLockConfig",
                "components": [
                  {
                    "name": "logic",
                    "type": "uint8",
                    "internalType": "enum LiquidityLockMechanism.UnlockLogic"
                  },
                  {
                    "name": "timeEnabled",
                    "type": "bool",
                    "internalType": "bool"
                  },
                  {
                    "name": "volumeEnabled",
                    "type": "bool",
                    "internalType": "bool"
                  },
                  {
                    "name": "unlockTime",
                    "type": "uint64",
                    "internalType": "uint64"
                  },
                  {
                    "name": "unlockVolumeThreshold",
                    "type": "uint128",
                    "internalType": "uint128"
                  }
                ]
              },
              {
                "name": "whitelist",
                "type": "tuple",
                "internalType": "struct WhitelistPhaseMechanism.WhitelistPhaseConfig",
                "components": [
                  {
                    "name": "whitelistEndTime",
                    "type": "uint64",
                    "internalType": "uint64"
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        "name": "permitData",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [
      {
        "name": "key",
        "type": "tuple",
        "internalType": "struct PoolKey",
        "components": [
          {
            "name": "currency0",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "currency1",
            "type": "address",
            "internalType": "Currency"
          },
          {
            "name": "fee",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "tickSpacing",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "hooks",
            "type": "address",
            "internalType": "contract IHooks"
          }
        ]
      },
      {
        "name": "governanceTokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  }
] as const;
