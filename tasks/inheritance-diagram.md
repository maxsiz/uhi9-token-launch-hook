# TokenLaunchHook — диаграмма наследования контрактов

Фактическая иерархия по коду в `src/`. `GovernanceModule` — общий базовый контракт для модулей с
governance-сеттерами (M2/M3/M5); M1 (AntiSnipe) самостоятелен (без governance-сеттеров).
`TokenLaunchHook` собирает все модули и `BaseHook`; `GovernanceModule` попадает в него по «ромбу»
через M2/M3/M5 (Solidity C3-линеаризация включает его один раз, конструктор инициализирует один раз).

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

**Легенда:**
- `A <|-- B` — B наследует A.
- `A ..> B : uses` — B использует библиотеку A (не наследование).
- `<<v4-periphery>>` — внешние контракты из `lib/v4-hooks-public` (`BaseHook` → `ImmutableState`).

**Не входят в иерархию хука** (отдельные контракты, ещё не реализованы):
`CampaignWrapper` (task_008) — координатор лонча, вызывает `TokenLaunchHook` через PositionManager;
`TokenFactory` + `StandardToken` (task_006) — опциональный клонер ERC-20, независим от хука.
