# task_019 — Страница свопа на кампанию (Uniswap-style виджет, fallback к Uniswap UI)

> **Статус: 🟡 DESIGN / TODO** — спроектировано, ожидает реализации. Не реализовано.
> Commit tag: `#19` · ветка реализации: `task_019-swap-widget` (создать при старте).
> **Зависит от `#18` (CampaignLens)** — берёт PoolKey/налоги/фазу/whitelist одним вызовом.

## Цель

Отдельная страница-виджет свопа в стиле Uniswap, по одному shareable URL на кампанию
(`/swap/[chainId]/[pid]`), на случай если пул с нашим хуком недоступен в официальном Uniswap UI.

## Проблема

- Uniswap UI может не дать торговать пул с произвольным кастомным хуком (дин. fee / ограничения) → нужен
  свой fallback-виджет.
- Своп против v4 идёт ТОЛЬКО через Universal Router (не напрямую в PoolManager): V4Planner + Quoter + Permit2.

## Технические факты (из контрактов; правок не требуют)

- `_beforeSwap` не читает hookData → swap `hookData = 0x` (`TokenLaunchHook.sol:151`).
- PoolKey (currency0/1, `fee` с `OVERRIDE_FEE_FLAG 0x800000` при tax, tickSpacing, hooks) → из
  `PositionManager.getPoolAndPositionInfo(govTokenId)`, приходит в `CampaignView` (#18).
- buy/sell: `isBuy = params.zeroForOne != tokenIsCurrency0`.
- Реверты свопа, которые UI предусматривает заранее (Quoter callStatic ловит те же):
  whitelist-фаза по **`tx.origin`** (`NotWhitelisted`) — смарт-кошельки заблокированы; анти-снайп
  `BuyTooLarge` и `ExactOutNotAllowedDuringAntiSnipe` (sell не ограничен). Налог не ревертит.

## Часть A — страница/виджет (web/, Next.js)

- Роут `app/swap/[chainId]/[pid]/page.tsx`; работает по прямой ссылке (shareable), грузит всё по pid+chainId.
- Загрузка кампании: `CampaignLens.getCampaign(pid)` → poolKey, токены, фаза, effective buy/sell tax,
  whitelistEndTime, anti-snipe cap/окно.
- Виджет (Uniswap-style, СВОЙ — `@uniswap/widgets` v4/кастом-хуки не поддерживает): input/output
  (token↔pair), направление, сумма, slippage, connect/approve/swap.
- Квота: `Quoter.quoteExactInputSingle` (`callStatic`) с poolKey + zeroForOne + `hookData=0x` → выход +
  эффективный налог (сверка с `effectiveBuy/SellTaxOf`).
- Исполнение: Universal Router `execute` с V4Planner `[SWAP_EXACT_IN_SINGLE, SETTLE_ALL, TAKE_ALL]`;
  ERC-20 через Permit2 (token→Permit2→UR), нативный ETH через `value`; deadline обязателен.
- UX-гейты под хук: whitelist-фаза (дизейбл + пояснение про EOA из whitelist); анти-снайп окно (показать
  max buy cap, запретить exact-out на buy); текущий buy/sell tax + decay; фаза кампании.
- Переиспользовать: `lib/campaign/poolId.ts`, `lib/config/uniswap.ts`, `lib/config/chains.ts`,
  `components/ui/*`, `ConnectGate`, `lib/format.ts`.

## Часть B — навигация / deep-link

- Кнопка «Trade» из `/launch` (после запуска) и из `/governance` → `/swap/[chainId]/[pid]`.

## Часть C — конфиг сетей

- Добавить в `lib/config/uniswap.ts` адреса **Universal Router** и **Quoter** по сети (из Uniswap
  deployments). При необходимости добавить Unichain Sepolia (1301) в `lib/config/chains.ts`.
- Discovery-замечание (см. #18): на мейннетах хостед v4-subgraph есть; на unichain-sepolia — self-deploy
  в Studio или Alchemy-фоллбэк.

## Файлы

- Новые: `web/app/swap/[chainId]/[pid]/page.tsx`, `web/components/swap/SwapWidget.tsx`,
  `web/lib/swap/quote.ts` (Quoter callStatic), `web/lib/swap/buildSwap.ts` (V4Planner+RoutePlanner),
  `web/lib/swap/permit2Swap.ts` (approvals).
- Правки: `web/lib/config/uniswap.ts` (+UniversalRouter/Quoter), `web/lib/config/chains.ts` (опц. +1301),
  кнопки «Trade» в launch/governance, `tasks/DESIGN.md` (§3, §11).
- Пакеты: `@uniswap/v4-sdk`, `@uniswap/universal-router-sdk`, `@uniswap/sdk-core`.
- Зависимость: адрес `CampaignLens` (#18) в `web/lib/config/contracts.generated.ts`.

## Открытые вопросы

- Показывать ли ликвидность/график пула (можно позже).
- Источник эффективного налога в UI: из quote (выход vs spot) или напрямую из `effectiveBuy/SellTaxOf`.

## Verification

- На форке/тестнете: `/swap/[chainId]/[pid]` существующей кампании → quote отображается, swap проходит
  через Universal Router; нативный и ERC-20 пути.
- Whitelist-фаза: не-whitelisted EOA → своп задизейблен/причина показана; whitelisted → проходит.
- Анти-снайп: buy>cap → ошибка до отправки; sell не ограничен; exact-out на buy запрещён.
- Tax: эффективный налог в quote совпадает с `effectiveBuy/SellTaxOf`.
