# task_009 — Deploy-скрипты + fork-тест

> **Статус: ✅ DONE** — влито в master (merge `b9933f1`, 4 fork-теста зелёные на живом mainnet-форке, полный прогон 116 + 4 skip).
> Commit tag: `#9` · ветка: `task_009-deploy-scripts`
> Спека: `tasks/TokenLaunchHook.md` → разделы **Multi-chain deployment**, **Deploy scripts**,
> **Critical Files to Create → Deploy scripts**.

## Цель

Воспроизводимый one-shot per-chain деплой стека и проверка на mainnet-форке против реальных
PoolManager/PositionManager.

## Зависимости
task_007 (хук), task_008 (wrapper), task_006 (фабрика).

## Файлы
- `script/MineSalt.s.sol` — оффчейн-помощник: майнинг CREATE2 salt для адреса `TokenLaunchHook` с
  корректными битами пермишенов (`HookMiner`/`Hooks.isValidHookAddress`).
- `script/DeployStack.s.sol` — деплой по шагам: mine salt → hook (CREATE2) → CampaignWrapper →
  TokenFactory + StandardToken impl. Адреса PoolManager/PosM/Permit2 — из конфигурации сети.
- `test/TokenLaunchHook.fork.t.sol`.

## Ключевые требования
- Адрес хука после деплоя проходит `Hooks.isValidHookAddress` для заданных `getHookPermissions()`.
- Скрипт идемпотентен по входным адресам сети; параметры через env (см. `foundry.toml`
  `[rpc_endpoints]`/`[etherscan]`).

## Тесты (fork)
```
test_fork_deployStack_hookAddressHasValidFlags
test_fork_launchCampaign_endToEnd
test_fork_swap_appliesTaxAndAntiSnipe
test_fork_removeLiquidity_blockedThenUnlocked
```
Запуск: `forge test --match-path test/TokenLaunchHook.fork.t.sol --fork-url mainnet -vvv`
(RPC из env, см. `foundry.toml`).

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- Fork-тесты зелёные при наличии RPC; деплой-скрипт проходит `forge script --sig run() ... --rpc-url`
  в dry-run.
- Полный прогон стека `forge test -vvv` (как в CI) — зелёный.
- Коммит с тегом `#9`, отдельная ветка.
