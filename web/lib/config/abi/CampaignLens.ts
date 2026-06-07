// AUTO-EXTRACTED from Foundry out/CampaignLens.sol/CampaignLens.json — do not hand-edit.

export const CampaignLensAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_hook",
        "type": "address",
        "internalType": "contract TokenLaunchHook"
      },
      {
        "name": "_posm",
        "type": "address",
        "internalType": "contract IPositionManager"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "HOOK",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract TokenLaunchHook"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "POSM",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IPositionManager"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCampaign",
    "inputs": [
      {
        "name": "pid",
        "type": "bytes32",
        "internalType": "PoolId"
      }
    ],
    "outputs": [
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct CampaignLens.CampaignView",
        "components": [
          {
            "name": "pid",
            "type": "bytes32",
            "internalType": "PoolId"
          },
          {
            "name": "poolKey",
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
            "name": "initialized",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "tokenIsCurrency0",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "governanceTokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "governanceOwner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deployer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "launchTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "launchEndTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "phase",
            "type": "uint8",
            "internalType": "uint8"
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
            "name": "effectiveBuyTax",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "effectiveSellTax",
            "type": "uint24",
            "internalType": "uint24"
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
            "name": "cumulativeVolume",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "lockUnlocked",
            "type": "bool",
            "internalType": "bool"
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
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCampaignByTokenId",
    "inputs": [
      {
        "name": "tokenId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "pid",
        "type": "bytes32",
        "internalType": "PoolId"
      },
      {
        "name": "v",
        "type": "tuple",
        "internalType": "struct CampaignLens.CampaignView",
        "components": [
          {
            "name": "pid",
            "type": "bytes32",
            "internalType": "PoolId"
          },
          {
            "name": "poolKey",
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
            "name": "initialized",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "tokenIsCurrency0",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "governanceTokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "governanceOwner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deployer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "launchTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "launchEndTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "phase",
            "type": "uint8",
            "internalType": "uint8"
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
            "name": "effectiveBuyTax",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "effectiveSellTax",
            "type": "uint24",
            "internalType": "uint24"
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
            "name": "cumulativeVolume",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "lockUnlocked",
            "type": "bool",
            "internalType": "bool"
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
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getCampaigns",
    "inputs": [
      {
        "name": "pids",
        "type": "bytes32[]",
        "internalType": "PoolId[]"
      }
    ],
    "outputs": [
      {
        "name": "views",
        "type": "tuple[]",
        "internalType": "struct CampaignLens.CampaignView[]",
        "components": [
          {
            "name": "pid",
            "type": "bytes32",
            "internalType": "PoolId"
          },
          {
            "name": "poolKey",
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
            "name": "initialized",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "tokenIsCurrency0",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "governanceTokenId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "governanceOwner",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "deployer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "launchTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "launchEndTime",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "phase",
            "type": "uint8",
            "internalType": "uint8"
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
            "name": "effectiveBuyTax",
            "type": "uint24",
            "internalType": "uint24"
          },
          {
            "name": "effectiveSellTax",
            "type": "uint24",
            "internalType": "uint24"
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
            "name": "cumulativeVolume",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "lockUnlocked",
            "type": "bool",
            "internalType": "bool"
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
    ],
    "stateMutability": "view"
  },
  {
    "type": "error",
    "name": "NotACampaign",
    "inputs": []
  }
] as const;
