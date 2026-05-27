# task_007 — TokenLaunchHook: сборка модулей + MechanismConfig

> Commit tag: `#7` · ветка: `task_007-hook-assembly`
> Спека: `tasks/TokenLaunchHook.md` → разделы **TokenLaunchHook — skeleton**,
> **Modular Mechanism Architecture**, **Required Hook Permissions**.

## Цель

Собрать единый хук: `BaseHook` + все модули (Governance, M1, M2, M3, M5), `EnabledMechanisms` per-pool
(immutable, ставится на bootstrap), диспетч в колбэках. `MechanismConfig` — кодирование/декодирование
`hookData` → конфиги модулей. End-to-end тесты на реальном `PoolManager` (in-memory).

## Зависимости
task_001 … task_005 (модули). task_006 не обязателен (фабрика подключается в task_008).

## Файлы
- `src/TokenLaunchHook.sol` — дополнить: наследование модулей, `mapping(PoolId => EnabledMechanisms)`,
  колбэки `_beforeInitialize` (noop), `_beforeAddLiquidity` (bootstrap всех включённых модулей на
  первом mint; затем whitelist-гейт для последующих adds), `_beforeSwap` (порядок:
  whitelist → anti-snipe → tax-fee), `_afterSwap` (M3 volume), `_beforeRemoveLiquidity` (G3 +
  M3 для gov-NFT).
- `src/lib/MechanismConfig.sol` — структуры `LaunchConfig`/`EnabledMechanisms` + encode/decode.
- `test/lib/MechanismConfig.t.sol`, `test/TokenLaunchHook.integration.t.sol`,
  `test/TokenLaunchHook.governance.t.sol`, `test/TokenLaunchHook.race.t.sol`.

## Ключевые требования
- Деплой хука в тестах с корректными permission-битами адреса — через `HookMiner`/`deployCodeTo`
  (v4-periphery test utils).
- `getHookPermissions()` уже задан в стабе — сверить с разделом **Required Hook Permissions** (флаги
  `*ReturnDelta` зарезервированы под v2, в v1 не используются в рантайме).
- Bootstrap: `sender == POSITION_MANAGER`, проверка `expectedInitialSqrtPrice` через `getSlot0`,
  захват gov-NFT, инициализация только включённых модулей из `hookData`.
- При включённом M2 — пул должен быть dynamic-fee (`0x800000`); невалидную конфигурацию отклонять.

## Тесты
- `MechanismConfig.t.sol`: round-trip encode→decode всех комбинаций флагов; устойчивость к мусорным
  данным.
- `integration`: bootstrap всех модулей одним первым mint; последовательность модулей в swap; buy/sell
  с налогом + anti-snipe + whitelist вместе; volume-учёт.
- `governance`: захват gov-NFT, мутабельность (ratchet вниз), фазы Pre/Active/Frozen, заморозка после
  `launchEndTime`.
- `race`: попытка чужого first-mint / front-run инициализации пула реверится (anti-sandwich).

## Заметки / риски
- `tx.origin` vs `msg.sender` (anti-sandwich, whitelist, anti-snipe) — реализовать согласованно с
  выбранной политикой; добавить тест с роутером-посредником.
- Front-run инициализации пула (`beforeInitialize` noop) — задокументировать поведение/реверты.
- Следить за размером контракта (`--sizes`): много наследуемых модулей при `via_ir=false`.

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто (хук влезает в лимит).
- `forge test --match-path 'test/TokenLaunchHook.*' --match-path test/lib/MechanismConfig.t.sol -vvv`
  — зелёные.
- Коммит с тегом `#7`, отдельная ветка.
