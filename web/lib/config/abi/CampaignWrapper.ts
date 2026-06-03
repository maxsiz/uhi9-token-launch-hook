// AUTO-EXTRACTED from Foundry out/CampaignWrapper.sol/CampaignWrapper.json — do not hand-edit.
export const CampaignWrapperAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_posm",
        "type": "address",
        "internalType": "contract IPositionManager"
      },
      {
        "name": "_hook",
        "type": "address",
        "internalType": "contract TokenLaunchHook"
      },
      {
        "name": "_factory",
        "type": "address",
        "internalType": "contract TokenFactory"
      },
      {
        "name": "_permit2",
        "type": "address",
        "internalType": "contract IAllowanceTransfer"
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
    "name": "PERMIT2",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IAllowanceTransfer"
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
    "name": "TOKEN_FACTORY",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract TokenFactory"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "launchCampaign",
    "inputs": [
      {
        "name": "params",
        "type": "tuple",
        "internalType": "struct CampaignWrapper.CampaignParams",
        "components": [
          {
            "name": "existingToken",
            "type": "address",
            "internalType": "address"
          },
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
            "name": "sqrtPriceInit",
            "type": "uint160",
            "internalType": "uint160"
          },
          {
            "name": "tickLower",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "tickUpper",
            "type": "int24",
            "internalType": "int24"
          },
          {
            "name": "liquidity",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "amount0Max",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "amount1Max",
            "type": "uint128",
            "internalType": "uint128"
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
    "stateMutability": "payable"
  },
  {
    "type": "event",
    "name": "CampaignLaunched",
    "inputs": [
      {
        "name": "pid",
        "type": "bytes32",
        "indexed": true,
        "internalType": "PoolId"
      },
      {
        "name": "governanceTokenId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "deployer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "lpRecipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      },
      {
        "name": "cfg",
        "type": "tuple",
        "indexed": false,
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
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "CaptureFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NFTNotDelivered",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NativeRefundFailed",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  },
  {
    "type": "error",
    "name": "TaxRequiresDynamicFee",
    "inputs": []
  }
] as const;
