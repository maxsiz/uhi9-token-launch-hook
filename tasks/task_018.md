# task_018 — Чтение кампаний фронтом: CampaignLens + discovery (subgraph/Alchemy)

> **Статус: 🟡 DESIGN / TODO** — спроектировано, ожидает реализации. Не реализовано.
> Commit tag: `#18` · ветка реализации: `task_018-campaign-lens` (создать при старте).

## Цель

Дать фронту без собственного индексера: (1) обнаружить кампании, которыми **сейчас** владеет подключённый
кошелёк (gov-NFT), и (2) прочитать все параметры кампании одним static call.

## Проблема

- Реестра кампаний нет (by design, `DESIGN.md` §11) — всё по `PoolId`.
- v4 PositionManager (solmate `ERC721`) не поддерживает `ERC721Enumerable` → перечислить NFT владельца
  on-chain нельзя (подтверждено доками Uniswap «Fetching Positions»).
- Параметры читаемы по `PoolId`, но разбросаны по ~12 геттерам; governance-таймстемпы и ориентация
  (`launchTime/launchEndTime/tokenIsCurrency0/deployer`) не экспонированы.

## Зафиксированные решения (с владельцем)

- **Discovery:** Uniswap hosted v4-subgraph — основной; Alchemy `getNFTsForOwner` — фоллбэк. Свой индексер
  не заводим.
- **Агрегатор:** отдельный stateless `CampaignLens` (паттерн `StateView`), НЕ `CampaignWrapper`.
- **+1 геттер** `governanceInfoOf(pid)` в `GovernanceModule`.

## Часть A — контракты

**A1. `GovernanceModule`: `governanceInfoOf(PoolId) external view returns (GovernanceState memory)`.**
Читает `_governance[pid]` (tokenId, launchTime, launchEndTime, initialized, tokenIsCurrency0, deployer).
Без изменения логики/стораджа. Тест в `test/mechanisms/GovernanceModule.t.sol`.
> Замечание про mined-адрес: добавление view-функций меняет байткод и требует ре-майна salt при деплое →
> делать **до первого деплоя**. На сам хук это единственная правка; `CampaignLens` — отдельный контракт и
> на mined-адрес хука не влияет.

**A2. Новый `src/CampaignLens.sol` (stateless; immutable `HOOK`, `POSM`).**
- `struct CampaignView` — identity (poolKey, pid, tokenIsCurrency0), governance (tokenId, owner, deployer,
  launchTime, launchEndTime, phase), `enabled` флаги, и по модулям: antiSnipe cfg; tax cfg + effective
  buy/sell; lock cfg + cumulativeVolume + isUnlocked; whitelist cfg.
- `getCampaign(PoolId) → CampaignView` — собирает external-геттеры хука одним вызовом.
- `getCampaigns(PoolId[]) → CampaignView[]`.
- `getCampaignByTokenId(uint256 tokenId) → (PoolId, CampaignView)` — `POSM.getPoolAndPositionInfo` →
  `poolKey`; если `poolKey.hooks == HOOK` → `pid = poolKey.toId()`, иначе revert (не наша кампания).
- Whitelist-мембершип per-user не кладём в общий view: либо отдельный `isWhitelisted(pid, user)`-прокси,
  либо параметр `viewer` в `getCampaign` → вернуть `viewerWhitelisted`.
- Тест `test/CampaignLens.t.sol`: сверка с по-отдельности собранными геттерами; tokenId→pid фильтр.

**A3. `script/DeployStack.s.sol`:** задеплоить `CampaignLens` вместе со стеком, залогировать адрес.

## Часть B — фронт (рецепт; реализация вне этого репо)

- **Discovery (primary):** GraphQL к Uniswap v4-subgraph `positions(where:{owner: wallet}){ tokenId
  poolKey{hooks} }`, оставить где `poolKey.hooks == HOOK` → `{tokenId}`; нужен бесплатный `GRAPH_KEY`.
- **Discovery (fallback):** Alchemy `getNFTsForOwner(owner, contractAddresses=[POSM])` → `tokenId[]` →
  `CampaignLens.getCampaignByTokenId`.
- **Per-chain config:** subgraph id + RPC + адреса `HOOK/POSM/CampaignLens` по `chainId`.
- **Reload:** `pid` из URL/localStorage (deep-link сразу после launch) ИЛИ из discovery →
  `CampaignLens.getCampaign(pid)`.
- **Гейтинг редактирования:** `governanceOwner == wallet` && `phase == Active` (`now < launchEndTime`);
  countdown от `launchEndTime`.

## Файлы

- Новые: `src/CampaignLens.sol`, `test/CampaignLens.t.sol`.
- Правки: `src/mechanisms/GovernanceModule.sol` (+`governanceInfoOf`),
  `test/mechanisms/GovernanceModule.t.sol`, `script/DeployStack.s.sol` (+ деплой Lens).
- Опц. док фронта в `web/` — discovery+reload рецепт, ключи `GRAPH_KEY`/Alchemy.

## Открытые вопросы (тюнинг)

- Включать ли whitelist-мембершип в `getCampaign` (нужен `viewer`) или отдельным вызовом.
- Возвращать ли token metadata (symbol/decimals) из Lens (доп. external-вызовы к ERC20) или тянуть фронтом.
- Сверить номер `#18` с реальным issue, если есть маппинг.

## Verification

- `forge build --sizes` (Lens вписывается в лимит размера).
- `forge test --match-contract CampaignLens` и `--match-contract GovernanceModule`.
- Fork-проверка: deploy → `launchCampaign` → `getCampaign(pid)` совпадает с по-отдельности собранными
  геттерами; `getCampaignByTokenId(tokenId)` возвращает тот же `pid`.
- Discovery: на тестнете/форке launch → subgraph (или Alchemy) вернул `tokenId` → Lens вернул кампанию.
