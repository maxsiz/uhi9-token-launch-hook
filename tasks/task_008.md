# task_008 — CampaignWrapper (атомарный launch)

> Commit tag: `#8` · ветка: `task_008-campaign-wrapper`
> Спека: `tasks/TokenLaunchHook.md` → разделы **CampaignWrapper — skeleton**,
> **Atomic launch flow (full TX)**.

## Цель

Координатор: `launchCampaign(params, permitData)` за одну TX атомарно деплоит/использует токен,
строит `PoolKey`, кодирует `hookData` и вызывает
`PositionManager.multicall([initializePool, modifyLiquidities([MINT_POSITION, SETTLE_PAIR, SWEEP])])`,
затем верифицирует захват gov-NFT и доставку на `lpRecipient`. Stateless (кроме ссылок на immutable).

## Зависимости
task_007 (хук), task_006 (фабрика — для пути «новый токен»).

## Файлы
- `src/CampaignWrapper.sol`.
- `test/CampaignWrapper.t.sol`.

## Ключевые требования
- `CampaignParams`: token-сторона (existing vs deploy), pool-сторона (pairToken/fee/tickSpacing/
  sqrtPriceInit), первый mint (ticks/liquidity/maxAmounts/`lpRecipient`), `launchConfig`.
- Сортировка currency0/currency1 по адресу (V4-конвенция); проставление `deployer = msg.sender`,
  `expectedInitialSqrtPrice`, `tokenAddress`, `tokenIsCurrency0` в конфиг.
- **Валидация**: при включённом M2 `fee == DYNAMIC_FEE_FLAG (0x800000)`.
- Permit2-flow для переноса ERC-20 (`permitData`).
- Post-checks: `HOOK.governanceTokenIdOf(poolId) != 0`; `PosM.ownerOf(govId) == lpRecipient`; событие
  `CampaignLaunched`.

## Тесты
```
test_launch_newToken_viaFactory_succeeds
test_launch_existingToken_succeeds
test_launch_nativeETHPair_succeeds
test_launch_erc20Pair_withPermit2_succeeds
test_launch_govNFT_capturedAndDeliveredToRecipient
test_launch_taxEnabled_nonDynamicFee_reverts
test_launch_captureFailed_reverts
test_launch_frontRunPoolInit_griefing_behaviour   (документирует поведение — см. ревью п.2)
```

## Заметки / риски
- Front-run инициализации пула чужой ценой → multicall реверится; покрыть тестом и описать обход
  (смена fee/tickSpacing/salt).
- Native ETH: корректная пересылка `msg.value` через `multicall{value:}` + SWEEP остатка.

## DoD
- `forge fmt --check`, `forge build --sizes` — чисто.
- `forge test --match-contract CampaignWrapper -vvv` — зелёные.
- Коммит с тегом `#8`, отдельная ветка.
