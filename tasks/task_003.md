# task_003 — M2 BuySellTaxMechanism + LaunchMath

> **Статус: ✅ DONE** — влито в master (PR #3, коммит `becafee`, 15 + 8 тестов зелёные).
> Commit tag: `#3` · ветка: `task_003-buysell-tax`
> Спека: `tasks/TokenLaunchHook.md` → раздел **M2 BuySellTaxMechanism — Finalized Spec**.

## Цель

Асимметричный налог через **dynamic LP fee** v4 (единицы — сотые доли б.п.: `1e4 = 1%`, `MAX_TAX =
1e5 = 10%`). Выше на продажах, ниже на покупках, линейный decay к `baseTax`. Setters — only-way
ratchet вниз. Pure-формула decay вынесена в `LaunchMath`.

## Зависимости
task_001 (setters используют `onlyGovernance`).

## Файлы
- `src/mechanisms/BuySellTaxMechanism.sol`.
- `src/lib/LaunchMath.sol` — `pure` линейный decay (`_decayedTax`).
- `test/mechanisms/BuySellTaxMechanism.t.sol`, `test/lib/LaunchMath.t.sol`.

## Ключевые требования
- `BuySellTaxConfig` (1 слот): `initialBuyTax`, `initialSellTax`, `baseTax`, `decayDuration`,
  `manualBuyTax`, `manualSellTax` (0 = нет override).
- `_initTax`: все ≤ `MAX_TAX`; `baseTax ≤ initial*`; manual-поля на bootstrap = 0
  (`InvalidTaxConfig`).
- Decay (`LaunchMath`): `duration == 0 || elapsed >= duration` → `baseTax`; иначе линейная
  интерполяция `initial - (initial-base)*elapsed/duration`.
- `_currentTax`: `isBuy = zeroForOne != tokenIsCurrency0`; берёт min(decayed, manual≠0).
- `setBuyTaxOverride`/`setSellTaxOverride` (`onlyGovernance`): `newOverride ∈ (0, MAX_TAX]`, строго
  ниже предыдущего (`CanOnlyLowerTax`); override — потолок, не «заморозка».

## Тесты
`BuySellTaxMechanism.t.sol` (14):
```
test_init_storesConfig_emitsEvent
test_init_initialBelowBase_reverts            (InvalidTaxConfig)
test_init_initialExceedsMax_reverts           (TaxExceedsMax)
test_init_baseExceedsMax_reverts              (TaxExceedsMax)
test_init_manualPresetAtBootstrap_reverts     (InvalidTaxConfig)
test_buy_atLaunchTime_returnsInitialBuyTax
test_sell_atLaunchTime_returnsInitialSellTax
test_buy_midDecay_returnsLinearInterpolation
test_buy_afterDecayDuration_returnsBaseTax
test_zeroDecayDuration_immediatelyReturnsBase
test_setBuyTaxOverride_byOwner_succeeds_emitsEvent
test_setBuyTaxOverride_byNonOwner_reverts      (NotGovernanceOwner)
test_setBuyTaxOverride_higherThanCurrent_reverts (CanOnlyLowerTax)
test_setBuyTaxOverride_thenDecayGoesBelow_usesDecay
test_postLaunchEnd_setOverride_reverts         (LaunchEnded)
```
`LaunchMath.t.sol`: unit + fuzz на `_decayedTax` (границы `elapsed=0`, `elapsed>=duration`,
`duration=0`, монотонность, отсутствие переполнения/underflow).

## Заметки / риски
- При включённом M2 пул обязан быть с dynamic-fee флагом (`0x800000`) — проверка переедет в
  task_008 (CampaignWrapper) и task_007 (integration).
- v1: налог = LP fee (без `*ReturnDelta`), уходит активным LP.

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- `forge test --match-contract "BuySellTax|LaunchMath" -vvv` — зелёные.
- Коммит с тегом `#3`, отдельная ветка.
