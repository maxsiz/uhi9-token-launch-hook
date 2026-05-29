# task_006 — TokenFactory + StandardToken (независимый)

> **Статус: ✅ DONE** — влито в master (merge `e3fb88a`, 6 тестов зелёные, полный прогон 108).
> Commit tag: `#6` · ветка: `task_006-token-factory`
> Спека: `tasks/TokenLaunchHook.md` → раздел **TokenFactory — optional minimal-proxy factory**.

## Цель

Опциональная фабрика дешёвых ERC-20 через EIP-1167 minimal proxies (OZ `Clones`) для деплоеров без
своего токена. Полностью независима от хука (стандартный ERC-20, без allowlist-ограничений).

## Зависимости
Нет (можно делать в любой момент, в т.ч. параллельно с модулями).

## Файлы
- `src/StandardToken.sol` — initializable ERC-20 (mintable), `initialize(name, symbol, totalSupply,
  recipient)`; защита от повторной инициализации.
- `src/TokenFactory.sol` — `deployToken(TokenDeployConfig, recipient) → address`; клонирует
  `TOKEN_IMPLEMENTATION`, инициализирует, минтит supply на recipient; событие `TokenDeployed`.
- `test/TokenFactory.t.sol`.

## Ключевые требования
- Клон неинициализируем повторно (`initialize` один раз).
- Supply целиком на `recipient`; корректные `name`/`symbol`/`decimals`/`totalSupply`.
- Имплементация-образец сама по себе не используется как токен (initializer заблокирован).

## Тесты
```
test_deployToken_clonesAndInitializes
test_deployToken_mintsSupplyToRecipient
test_deployToken_emitsTokenDeployed
test_clone_reinitialize_reverts
test_implementation_cannotBeInitialized
test_multipleClones_independentState
```

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- `forge test --match-contract TokenFactory -vvv` — зелёные.
- Коммит с тегом `#6`, отдельная ветка.
