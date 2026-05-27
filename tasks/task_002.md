# task_002 — M1 AntiSnipeMechanism

> **Статус: ✅ DONE** — влито в master (PR #2, коммит `8dfea3a`, 8 тестов зелёные).
> Commit tag: `#2` · ветка: `task_002-antisnipe`
> Спека: `tasks/TokenLaunchHook.md` → раздел **M1 AntiSnipeMechanism — Finalized Spec**.

## Цель

Ограничить размер одной покупки в pair-currency в течение окна `antiSnipeDuration` после launch.
Продажи в окне не ограничиваются. Модуль **stateless** (без SSTORE) — только конфиг + view-проверка.

## Зависимости
task_001 (переиспользует harness-паттерн и mock-инфраструктуру; для самого `_checkAntiSnipe`
governance не требуется, но окно считается от `launchTime`).

## Файлы
- `src/mechanisms/AntiSnipeMechanism.sol`.
- `test/mechanisms/AntiSnipeMechanism.t.sol` (+ при необходимости `AntiSnipeHarness`).

## Ключевые требования
- `AntiSnipeConfig`: `antiSnipeDuration` (0 = выкл, MAX = 1 day), `maxBuyAmountIn` (pair-currency wei,
  0 = эффективный бан покупок). Помещается в 1 слот.
- `_initAntiSnipe`: реверт `InvalidAntiSnipeDuration`, если `> MAX_ANTISNIPE_DURATION`.
- `_checkAntiSnipe(pid, params, tokenIsCurrency0, launchTime)` — `view`:
  - `duration == 0` или окно истекло → выход без ограничений;
  - покупка определяется как `params.zeroForOne != tokenIsCurrency0`; sells пропускаются;
  - в окне для покупки: `amountSpecified > 0` (exact-out) → `ExactOutNotAllowedDuringAntiSnipe`;
  - `uint256(-amountSpecified) > maxBuyAmountIn` → `BuyTooLarge`.

## Тесты (8)
```
test_init_storesConfig_emitsEvent
test_init_durationExceedsMax_reverts        (InvalidAntiSnipeDuration)
test_disabled_skipsCheck                     (antiSnipeDuration = 0)
test_buy_withinLimits_passes
test_buy_exceedsMaxAmount_reverts            (BuyTooLarge)
test_buy_exactOut_reverts                    (ExactOutNotAllowedDuringAntiSnipe)
test_sell_unrestricted_duringWindow
test_buy_afterWindowExpires_unrestricted
```

## Заметки / риски
- Anti-snipe защищает от **одной** крупной покупки, но не от sybil (много мелких сделок/адресов) —
  by-design; зафиксировать в комментариях/доке.

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- `forge test --match-contract AntiSnipe -vvv` — зелёные (8/8).
- Коммит с тегом `#2`, отдельная ветка.
