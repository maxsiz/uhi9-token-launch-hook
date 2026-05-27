# task_005 — M5 WhitelistPhaseMechanism (опциональный модуль)

> **Статус: ✅ DONE** — влито в master (коммит `77e2dde`, 19 тестов зелёные).
> Commit tag: `#5` · ветка: `task_005-whitelist-phase`
> Спека: `tasks/TokenLaunchHook.md` → раздел **M5 WhitelistPhaseMechanism — Finalized Spec**.

## Цель

Фазовый доступ: до `whitelistEndTime` взаимодействовать с пулом (swap обе стороны, addLiquidity)
могут только адреса из whitelist. После endTime ограничения снимаются. Removal ликвидности разрешён
**всегда** (W11). Bootstrap (первый mint деплоера) не требует whitelisting.

## Зависимости
task_001 (setters — `onlyGovernance`; границы `whitelistEndTime` зависят от
`launchTime`/`launchEndTime`).

## Файлы
- `src/mechanisms/WhitelistPhaseMechanism.sol`.
- `test/mechanisms/WhitelistPhaseMechanism.t.sol`.

## Ключевые требования
- `WhitelistPhaseConfig`: `whitelistEndTime` ∈ `(launchTime, launchEndTime]`
  (`InvalidWhitelistEndTime`). `WhitelistPhaseState`: `mapping(address => bool)`.
- `_checkWhitelist(pid)`: после endTime → open; иначе `!whitelisted[<actor>]` → `NotWhitelisted`.
  (Политику «actor = tx.origin vs msg.sender» согласовать — см. риск ниже.)
- Setters (`onlyGovernance`): `addToWhitelist`, `addManyToWhitelist`, `removeFromWhitelist`,
  `removeManyFromWhitelist`, `relaxWhitelistEndTime` (строго вниз — `CanOnlyRelax`).

## Тесты (19)
```
test_init_storesConfig_emitsEvent
test_init_endTimeAtOrBeforeLaunchTime_reverts   (InvalidWhitelistEndTime)
test_init_endTimeAfterLaunchEnd_reverts         (InvalidWhitelistEndTime)
test_whitelisted_canBuy
test_whitelisted_canSell
test_whitelisted_canAddLiquidity
test_nonWhitelisted_cannotBuy                   (NotWhitelisted)
test_nonWhitelisted_cannotSell                  (NotWhitelisted)
test_nonWhitelisted_cannotAddLiquidity          (NotWhitelisted)
test_nonWhitelisted_canAlwaysRemoveLiquidity
test_afterEndTime_unrestricted_evenNonWhitelisted
test_bootstrap_skipsWhitelistCheck
test_addToWhitelist_byOwner_succeeds_emitsEvent
test_addManyToWhitelist_batch_emitsEvents
test_removeFromWhitelist_byOwner_succeeds_emitsEvent
test_removeManyFromWhitelist_batch_emitsEvents
test_addToWhitelist_byNonOwner_reverts          (NotGovernanceOwner)
test_relaxEndTime_byOwner_succeeds
test_relaxEndTime_laterThanCurrent_reverts      (CanOnlyRelax)
```

## Заметки / риски
- Проверка `tx.origin` ломается с AA-кошельками и свопами через роутеры/агрегаторы — зафиксировать
  выбранную политику (см. общее ревью в `staged-squishing-octopus` / комментарии модуля).
- Рост storage: 1 слот на адрес; batch чанками 100–200 на TX.

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- `forge test --match-contract WhitelistPhase -vvv` — зелёные (19/19).
- Коммит с тегом `#5`, отдельная ветка.
