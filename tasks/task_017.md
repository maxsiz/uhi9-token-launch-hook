# task_017 — Стейкинг в период кампании (через V4 return-delta бонус)

> **Статус: 🟡 DESIGN / TODO** — спроектировано, ожидает ревью деталей. Не реализовано.
> Commit tag: `#17` · ветка реализации: `task_017-campaign-staking` (создать при старте).
> **Это v2-модуль** — требует return-delta флагов, снятых в v1 (аудит M-2) → **отдельный mined-адрес и
> деплой**, аудированный v1 не трогаем.

## Цель

Стейкинг во время лонч-кампании: участник коммитит ликвидность на окно кампании и получает **премию**
сверх обычного LP-дохода. Реализуется через механику Uniswap v4, без отдельного staking-vault.

## Зафиксированные решения (с владельцем)
- **Тело вклада:** допустима LP-конвертация (НЕ 1:1; стейкер — это LP, позиция может конвертироваться / IL).
- **Механика входа:** «swap + позиция» — вход через **zap** (своп до нужного соотношения → минт позиции),
  внешним координатором (своп внутри хука не нужен).
- **Премия:** явный **бонус, скимящийся со свопов через return-delta** (а не только нативная доля fee) —
  залоченные стейкеры получают строго больше казуальных LP; финансируется рынком (налогом трейдеров).
- Реализует существующий `// TODO think about staking` в `TokenLaunchHook._beforeRemoveLiquidity`.

## Механика

**1. Вход — zap (`StakingWrapper`, новый, по образцу `CampaignWrapper`).**
Стейкер шлёт один актив; враппер делает `PositionManager.multicall([опц. swap, MINT])` (pull через
Permit2), помечает минт в `hookData` как **stake**. Позиция (`salt == bytes32(tokenId)`) регистрируется
как застейканная для пула. Переиспользует паттерны `CampaignWrapper` (Permit2, multicall, salt==tokenId,
sweep остатка).

**2. Лок — коммитмент.** Новый `StakingMechanism` хранит застейканные `tokenId` по пулу; хук в
`_beforeRemoveLiquidity` блокирует ранний выход stake-позиции до конца окна (`launchEndTime` или отдельный
`stakeEndTime`). Переиспользует форму G3/M3 (`_checkBurnProtection`, `_checkLiquidityLock`,
`uint256(params.salt) == tokenId`). Лок — это то, что гейтит право на бонус (иначе он утекает к
некоммитнутым LP).

**3. Премия — return-delta ским + MasterChef/Synthetix аккумулятор (математика).**
- **Ским:** в `_afterSwap` забрать `r = skimRate × output` через `afterSwapReturnDelta` (положительный
  `int128` = `hookDeltaUnspecified`, т.е. из выходной валюты свопа).
- **Аккумулятор:** `accRewardPerShare += r / totalStakedLiquidity`;
  `pending_i = L_i · accRewardPerShare − rewardDebt_i`; пересчёт `rewardDebt_i` на stake/unstake/claim.
- **Клейм/выход:** вывод накопленного из баланса хука (`poolManager.take` / ERC-6909); на конце кампании —
  анлок позиции + финальный клейм.

## Файлы
- Новые: `src/mechanisms/StakingMechanism.sol`, `src/StakingWrapper.sol`,
  `test/mechanisms/StakingMechanism.t.sol`, `test/StakingWrapper.t.sol`, `test/utils/StakingHarness.sol`.
- Правки: `src/TokenLaunchHook.sol` (наследование модуля; диспатч скима в `_afterSwap`, лок в
  `_beforeRemoveLiquidity`, регистрация stake в `_beforeAddLiquidity`; **вернуть два return-delta флага**),
  `src/lib/MechanismConfig.sol` (флаг `staking` + конфиг), `script/MineSalt.s.sol` +
  `script/DeployStack.s.sol` (v2-флаги/майнинг), `test/utils/TokenLaunchHookTestBase.sol` (флаги в lockstep).
- Reference перед кодингом скима: семантика `BaseHook.afterSwap` return-`int128` и сеттлмент дельты —
  `lib/v4-hooks-public/lib/v4-core/src/PoolManager.sol`.

## Открытые тюнинг-решения (дефолты — переопределяемы)
- **Направление скима:** buys-only → одна reward-валюта (launched-токен), без двух аккумуляторов.
- **Источник скима:** carve-from-M2 (срезать слайс с M2-fee, без доп. стоимости для трейдеров; но связывает
  M2↔staking) vs небольшой ским сверху M2 (проще).
- **Окно:** стейк в любой момент кампании, анлок на `launchEndTime` (vs отдельный `stakeEndTime`).

## Риски
- **Return-delta — самый рисковый surface v4** (аудит M-2). Ским обязан точно балансировать дельту хука
  (без утечки/застрявших свопов), быть reentrancy-safe, обрабатывать округление (dust). Отдельный
  security-pass перед любым деплоем.
- v2 = свежий, отдельный деплой; адрес аудированного v1 не трогать.
- Конвертация/IL — на стейкере (принято).

## Этапность (каждый этап тестируется независимо)
1. `StakingMechanism` + математика аккумулятора + лок — юнит-тесты в изоляции (harness, без обвязки хука).
2. Обвязка хука: ским в `_afterSwap` (return-delta) + лок + регистрация stake; тесты дельта-аккаунтинга на
   реальном PoolManager.
3. `StakingWrapper` zap-вход + интеграция multi-staker pro-rata / claim.
4. v2-деплой: вернуть флаги, re-mine, `DeployStack` v2; адрес совпадает с `getHookPermissions()`.

## DoD
- Инварианты аккумулятора: роздано ≤ скимнуто (нет переначисления); pro-rata корректна для нескольких
  стейкеров с разным временем входа/выхода; dust ограничен.
- Лок: stake-позиция не выходит до конца; не-stake позиции и gov-NFT путь не затронуты.
- Дельта: баланс хука сходится на каждом свопе (fuzz buy/sell, exact-in/out); нет утечки; свопы не DoS-ятся.
- `forge fmt --check` · `forge build --sizes` · `forge test -vvv` — зелено; биты mined-адреса ==
  `getHookPermissions()`.
- **Не мержить в v1-линию до отдельного ревью return-delta скима.**
