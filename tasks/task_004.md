# task_004 — M3 LiquidityLockMechanism

> Commit tag: `#4` · ветка: `task_004-liquidity-lock`
> Спека: `tasks/TokenLaunchHook.md` → раздел **M3 LiquidityLockMechanism — Finalized Spec**.

## Цель

Условный unlock governance-NFT: время и/или накопленный объём (логика AND/OR). Объём копится в
`_afterSwap` по pair-стороне `BalanceDelta`. Setters — one-way relaxation. Применяется **только** к
gov-NFT; прочие LP свободны. `launchEndTime` (G3) — минимальный лок, M3 ужесточает поверх.

## Зависимости
task_001 (setters — `onlyGovernance`; связь с G3 burn-protection и `launchEndTime`).

## Файлы
- `src/mechanisms/LiquidityLockMechanism.sol`.
- `test/mechanisms/LiquidityLockMechanism.t.sol`.

## Ключевые требования
- `LiquidityLockConfig` (1 слот): `logic` (AND/OR), `timeEnabled`, `volumeEnabled`, `unlockTime`,
  `unlockVolumeThreshold`. `LiquidityLockState`: `cumulativeVolume` (uint128).
- `_initLock`: ≥1 условие (`NoConditionsEnabled`); если time — `unlockTime >= launchEndTime`
  (`UnlockTimeBeforeLaunchEnd`); если volume — порог > 0.
- `_trackVolume(pid, delta, tokenIsCurrency0)`: `+= |pairAmount|` (обе стороны свопа).
- `_isUnlocked`: AND → оба включённых условия; OR → хотя бы одно включённое выполнено.
- Setters (`onlyGovernance`): `relaxUnlockTime`/`relaxUnlockVolume` (строго вниз),
  `disableTimeCondition`/`disableVolumeCondition` (нельзя выключить последнее —
  `MustKeepOneCondition`), `switchToOr` (one-way, повтор → `AlreadyOr`).
- `_checkLiquidityLock` → `LiquidityStillLocked`, если не unlocked.

## Тесты (~20)
```
test_init_storesConfig_emitsEvent
test_init_noConditions_reverts                 (NoConditionsEnabled)
test_init_unlockTimeBeforeLaunchEnd_reverts    (UnlockTimeBeforeLaunchEnd)
test_init_volumeEnabledZeroThreshold_reverts   (NoConditionsEnabled)
test_volumeAccumulates_inAfterSwap_bothDirections
test_isUnlocked_AND_bothMet_returnsTrue
test_isUnlocked_AND_oneMet_returnsFalse
test_isUnlocked_OR_eitherMet_returnsTrue
test_isUnlocked_neitherMet_returnsFalse
test_removeLiquidity_locked_reverts            (LiquidityStillLocked)
test_removeLiquidity_unlocked_succeeds
test_removeLiquidity_beforeLaunchEnd_reverts   (Governance G3, даже если M3 выполнен)
test_relaxUnlockTime_byOwner_succeeds_emitsEvent
test_relaxUnlockTime_higherThanCurrent_reverts (CanOnlyRelax)
test_relaxUnlockVolume_byOwner_succeeds
test_disableTimeCondition_keepsVolumeActive
test_disableLastCondition_reverts              (MustKeepOneCondition)
test_switchToOr_changesLogic_emitsEvent
test_switchToOr_alreadyOr_reverts              (AlreadyOr)
test_nonGovNFT_removeLiquidity_unrestricted
```

## Заметки / риски
- Знак/ориентация `BalanceDelta` (`tokenIsCurrency0`) — покрыть exact-in и exact-out обеих сторон.
- `cumulativeVolume` не сбрасывается после unlock (lifetime-метрика).

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- `forge test --match-contract LiquidityLock -vvv` — зелёные.
- Коммит с тегом `#4`, отдельная ветка.
