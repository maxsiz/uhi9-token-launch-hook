# TokenLaunchHook — contract inheritance diagram

The actual hierarchy as implemented in `src/`. `GovernanceModule` is the shared base for the modules
that expose governance setters (M2/M3/M5); M1 (AntiSnipe) is standalone (it has no governance setters).
`TokenLaunchHook` assembles every module plus `BaseHook`; `GovernanceModule` reaches it via the
diamond through M2/M3/M5 (Solidity's C3 linearization includes it once, and the constructor initializes
it once).

```mermaid
classDiagram
    class ImmutableState {
        <<v4-periphery>>
        +IPoolManager poolManager
    }
    class BaseHook {
        <<v4-periphery, abstract>>
        +getHookPermissions()
        #_beforeInitialize() / _beforeAddLiquidity() ...
    }
    class GovernanceModule {
        <<abstract>>
        +POSITION_MANAGER
        mapping~PoolId~GovernanceState
        modifier onlyGovernance(pid)
        error CanOnlyRelax
    }
    class AntiSnipeMechanism {
        <<abstract, M1>>
        mapping~PoolId~AntiSnipeConfig
        _checkAntiSnipe()
    }
    class BuySellTaxMechanism {
        <<abstract, M2>>
        mapping~PoolId~BuySellTaxConfig
        _currentTax()
    }
    class LiquidityLockMechanism {
        <<abstract, M3>>
        mapping~PoolId~LiquidityLockConfig
        _checkLiquidityLock()
    }
    class WhitelistPhaseMechanism {
        <<abstract, M5>>
        mapping~PoolId~WhitelistPhaseConfig
        _checkWhitelist()
    }
    class TokenLaunchHook {
        <<concrete>>
        mapping~PoolId~EnabledMechanisms
        constructor(IPoolManager, positionManager)
    }
    class LaunchMath {
        <<library>>
        decayedTax()
    }
    class MechanismConfig {
        <<library>>
        LaunchConfig / EnabledMechanisms
        encode() / decode()
    }

    ImmutableState <|-- BaseHook

    GovernanceModule <|-- BuySellTaxMechanism
    GovernanceModule <|-- LiquidityLockMechanism
    GovernanceModule <|-- WhitelistPhaseMechanism

    BaseHook <|-- TokenLaunchHook
    AntiSnipeMechanism <|-- TokenLaunchHook
    BuySellTaxMechanism <|-- TokenLaunchHook
    LiquidityLockMechanism <|-- TokenLaunchHook
    WhitelistPhaseMechanism <|-- TokenLaunchHook

    BuySellTaxMechanism ..> LaunchMath : uses
    TokenLaunchHook ..> MechanismConfig : uses
```

**Legend:**
- `A <|-- B` — B inherits from A.
- `A ..> B : uses` — B uses library A (not inheritance).
- `<<v4-periphery>>` — external contracts from `lib/v4-hooks-public` (`BaseHook` → `ImmutableState`).

**Outside the hook hierarchy** (standalone contracts, not yet implemented):
`CampaignWrapper` (task_008) — the launch coordinator that drives `TokenLaunchHook` through the
PositionManager; `TokenFactory` + `StandardToken` (task_006) — an optional ERC-20 cloner, independent
of the hook.
