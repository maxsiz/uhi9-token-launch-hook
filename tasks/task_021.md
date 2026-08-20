# task_021 — GSC «Duplicate without user-selected canonical» на unilaunch.envelop.is

> **Статус: 🟢 FIX ГОТОВ (код), ждёт деплоя** — ветка `task_021-canonical-signals`.
> Commit tag: `#21`. Затрагивает только `web/` (метаданные), контракты не трогает.
> Часть работ — вне кода: Cloudflare (порт 80) и ручное действие владельца в GSC UI.

## Симптом

В Search Console (URL-prefix property `https://unilaunch.envelop.is/`) отчёт «Индексирование
страниц» держит **`Duplicate without user-selected canonical`**. Ни одна страница сайта в индекс не
попала: сабмит сайтмапа `submitted: 3 / indexed: 0`.

## Доказательство (GSC URL Inspection API, снято 2026-08-20)

Затронут **ровно один URL** — главная. Проверены все URL, которые сайт вообще умеет отдавать:

| URL | coverageState | lastCrawlTime | googleCanonical | userCanonical |
|---|---|---|---|---|
| `https://unilaunch.envelop.is/` | **Duplicate without user-selected canonical** | 2026-08-17T14:17:08Z (MOBILE) | **`https://www.747live.bet/`** | *(нет)* |
| `https://unilaunch.envelop.is` (без слэша) | то же самое (тот же URL для Google) | то же | то же | *(нет)* |
| `https://unilaunch.envelop.is/launch` | Discovered – currently not indexed | never crawled | — | — |
| `https://unilaunch.envelop.is/governance` | URL is unknown to Google | never crawled | — | — |
| `/launch/`, `/governance/`, `/index`, `/opengraph-image`, `/sitemap.xml`, `/?utm_source=…`, `/swap/1301/0x00…` | URL is unknown to Google | never crawled | — | — |

Для главной: `robotsTxtState: ALLOWED`, `indexingState: INDEXING_ALLOWED`,
`pageFetchState: SUCCESSFUL`, `referringUrls: (пусто)`, привязки к сайтмапу нет
(у `/launch` она есть — значит главную Google нашёл не из сайтмапа).

Что реально отдаёт прод (curl, 2026-08-20) — здесь всё **корректно**:

- `/`, `/launch`, `/governance` → `200`, `<meta name="robots" content="index, follow">`,
  у каждой свой `<link rel="canonical">` на себя, ровно один тег на страницу;
- `robots.txt` — `Allow: /`, `Disallow: /api/`, `Host:` + `Sitemap:` на прод-домен;
- `sitemap.xml` — три URL, домен/регистр/слэш совпадают с каноническими;
- редиректов нет (`num_redirects=0`), `www.`-варианта не существует, Googlebot-UA и браузерный UA
  получают один и тот же ответ (никакого CF-challenge и никакого клоакинга);
- stage на Vercel закрыт правильно: `X-Robots-Tag: noindex, nofollow` + `<meta robots noindex>` +
  self-canonical на себя — прод с ним не конкурирует;
- origin `88.99.35.38` с чужим `Host:` отдаёт Traefik-404, то есть наш контейнер **не** обслуживает
  посторонние домены (гипотеза «catch-all vhost склеил нас с чужим сайтом» проверена и отпадает);
- `www.747live.bet` — казино/беттинг на Next.js за Cloudflare, контента с нашим не пересекает,
  наш домен не упоминает, hreflang/canonical на нас не ставит (проверено grep'ом по их HTML).

## Причина

**Не «canonical забыли»** — canonical есть на всех трёх маршрутах с коммита `e44edb3`
(2026-08-17 13:18, сборка прода 13:21:57). Но:

1. Единственный краул главной был **2026-08-17 14:17**, то есть в первый же час жизни хоста, при
   нуле внешних ссылок и нуле истории. `userCanonical` в решении Google не записан вовсе, а
   `googleCanonical` указывает на посторонний сильный домен. Это классическая «шумная» кластеризация
   Google на свежем хосте: страница, у которой на момент индексации не зафиксирован собственный
   canonical, канонизируется за нас — и не обязательно на наш URL. Само по себе решение
   пересматривается на следующем крауле; отчёт «Индексирование страниц» показывает **последнее
   решение**, а не текущее состояние страницы, поэтому статус будет висеть, пока Google не
   перекраулит и не переиндексирует главную.
2. При этом сайт **сам подмешивает дубль-сигнал**, который эту кластеризацию поддерживает и который
   мы обязаны убрать до повторного краула: весь блок `openGraph` (и `twitter`) задан в
   `web/app/layout.tsx` жёстко и целиком наследуется дочерними маршрутами — в Next.js дочерний
   `metadata` **заменяет** одноимённое поле родителя, а `/launch` и `/governance` своего `openGraph`
   не объявляют. В результате все три страницы прода отдают идентичный OG-блок:

   ```
   /          og:url = https://unilaunch.envelop.is   og:title = TokenLaunchHook Studio — Fair-launch…
   /launch    og:url = https://unilaunch.envelop.is   og:title = TokenLaunchHook Studio — Fair-launch…
   /governance og:url = https://unilaunch.envelop.is  og:title = TokenLaunchHook Studio — Fair-launch…
   ```

   То есть `/launch` и `/governance` на уровне OpenGraph заявляют себя главной страницей, прямо
   противореча собственному `rel=canonical`. Это ровно тот сигнал, из-за которого дальше по цепочке
   в тот же бакет уезжают и они (сейчас `/launch` уже «Discovered – currently not indexed»).
3. Ни один маршрут не защищён от «а если canonical забудут»: canonical объявлен per-page, в корневом
   layout его нет — новый маршрут по умолчанию поедет без canonical.

## Что сделано в этой ветке

`web/app/layout.tsx` — единственный изменённый файл (14 строк, из них 9 — комментарии):

- добавлен `alternates: { canonical: "./" }` в корневой `metadata`. В Next 14 `"./"` резолвится
  через `resolveRelativeUrl(url, pathname)` → `path.posix.resolve(pathname, "./")`, то есть даёт
  self-canonical **для каждого маршрута**, включая будущие. Per-page `alternates` в
  `app/page.tsx` / `app/launch/page.tsx` / `app/governance/page.tsx` оставлены как есть (они
  перекрывают родителя тем же значением) — это явная документация намерения;
- `openGraph.url`: `SITE_URL` → `"./"` — og:url становится per-route;
- из `openGraph` убраны `title`/`description`, из `twitter` — `title`/`description`. Next при их
  отсутствии подставляет title/description **самого маршрута**
  (`resolve-metadata.js` → `postProcessMetadata` → `inheritFromMetadata`), поэтому у главной обе
  строки остаются прежними, а дочерние получают свои.

Проверено на реальной сборке (`NEXT_PUBLIC_SITE_URL=https://unilaunch.envelop.is npm run build`,
чтение `.next/server/app/*.html`):

| маршрут | canonical | og:url | og:title |
|---|---|---|---|
| `/` | `https://unilaunch.envelop.is` | `https://unilaunch.envelop.is` | TokenLaunchHook Studio — Fair-launch… |
| `/launch` | `…/launch` | `…/launch` | Launch a campaign — TokenLaunchHook Studio |
| `/governance` | `…/governance` | `…/governance` | Governance dashboard — TokenLaunchHook Studio |

Вывод для главной **побайтово тот же, что и до правки** — регрессии на индексируемой странице нет.
`npm run typecheck` и `npm run build` зелёные.

## Что осталось — вне кода

1. **Cloudflare (агент `envelop-devops`).** `http://unilaunch.envelop.is/` отвечает
   `404 page not found` (дефолтный бэкенд Traefik), а не `301` на https. Нужен «Always Use HTTPS»
   на зоне `envelop.is` (или redirect-middleware в Traefik). Оговорка: `unisafe.envelop.is` ведёт
   себя точно так же и при этом проиндексирован, так что **это не причина** текущего статуса —
   это отдельная гигиена: первый контакт краулера с новым хостом часто идёт по http, и получать там
   generic-404 вместо редиректа мы не хотим.
2. **GSC, ручное действие владельца (мной намеренно не сделано).** После деплоя правки:
   `URL Inspection → https://unilaunch.envelop.is/ → Test live URL → Request indexing`, затем то же
   для `/launch` и `/governance`; сайтмап переотправить. Без повторного краула статус в отчёте не
   изменится, сколько бы правок ни выкатили.
3. **Внешние ссылки.** `referringUrls` пуст. Самый сильный сигнал против чужого канонического
   кластера — реальные входящие ссылки на `https://unilaunch.envelop.is/` (README репозитория,
   профиль хакатона UHI9, посты). Это не код, но без этого молодой хост так и останется без веса.

## Acceptance

- после деплоя: `curl -sS https://unilaunch.envelop.is/launch | grep 'og:url'` → `…/launch`
  (не корень), то же для `/governance`; главная не изменилась;
- `npm run typecheck` + `npm run build` зелёные (уже так);
- через 1–2 недели после re-indexing: URL Inspection главной даёт
  `userCanonical = https://unilaunch.envelop.is/` и `googleCanonical` **на нашем домене**,
  `coverageState` уходит из `Duplicate without user-selected canonical`.

## Вне скоупа

- Consent Mode v2 / баннер согласия (известный долг, см. `web/DEPLOY.md`).
- Перенос JSON-LD `SoftwareApplication` из `layout.tsx` в `app/page.tsx`: сейчас он рендерится на
  каждой странице с `url: SITE_URL`. Для канонизации Google structured data не использует, так что
  на симптом это не влияет; сделать имеет смысл заодно со следующей правкой метаданных.
