# task_001 — GovernanceModule + тест-инфраструктура (фундамент)

> **Статус: ✅ DONE** — влито в master (PR #1, коммит `16f3d37`, 15 тестов зелёные).
> Commit tag: `#1` · ветка: `task_001-governance-module`
> Спека: `tasks/TokenLaunchHook.md` → разделы **GovernanceModule — Finalized Spec** и
> **Salt = tokenId convention**.

## Цель

Заложить фундамент для всех модулей: захват первого LP-NFT как governance-NFT, модификатор
`onlyGovernance(pid)`, фазы жизненного цикла (Pre/Active/Frozen), защита gov-NFT от burn/decrease в
активной фазе (G3) и cross-cutting метаданные (`tokenIsCurrency0`, `launchTime`). Плюс общая
тест-инфраструктура (mock PositionManager-ERC721 + harness-паттерн), которую переиспользуют
task_002…task_005.

## Зависимости
Нет (первый таск).

## Файлы
- `src/mechanisms/GovernanceModule.sol` — abstract-контракт (скелет в спеке).
- `test/utils/MockPositionManager.sol` — минимальный ERC721 с `ownerOf`, `nextTokenId`,
  `mint(to) → tokenId`; используется как `POSITION_MANAGER` для проверки владения gov-NFT.
- `test/utils/GovernanceHarness.sol` — наследует `GovernanceModule`, экспонирует `internal`-функции
  (`_initGovernance`, `_checkBurnProtection`) и предоставляет тестовый сеттер с `onlyGovernance`.
- `test/mechanisms/GovernanceModule.t.sol`.

## Ключевые требования
- `GovernanceState` — 3 слота: `tokenId`; `launchTime`/`launchEndTime`/`initialized`/`tokenIsCurrency0`;
  `deployer` (метаданные, **не** для авторизации — G2).
- `_initGovernance`: только `sender == POSITION_MANAGER`; `launchDuration ∈ [MIN, MAX]`
  (1 day … 365 days); `tokenId = uint256(params.salt)`; запрет повторной инициализации.
- `onlyGovernance(pid)`: `initialized` + `block.timestamp < launchEndTime` +
  `IERC721(POSM).ownerOf(tokenId) == msg.sender`.
- `_checkBurnProtection`: реверт `CannotBurnGovernanceNFT`, если это gov-NFT и фаза активна.
- Вьюхи: `governanceTokenIdOf`, `governanceOwnerOf`, `launchPhaseOf`.

## Тесты (15)
```
test_init_bootstrap_capturesGovNFT_emitsEvent
test_init_nonPosM_reverts                       (MustUsePositionManager)
test_init_duplicate_reverts                     (AlreadyInitialized)
test_init_durationTooShort_reverts              (InvalidLaunchDuration)
test_init_durationTooLong_reverts               (InvalidLaunchDuration)
test_onlyGovernance_correctOwner_passes
test_onlyGovernance_wrongCaller_reverts         (NotGovernanceOwner)
test_onlyGovernance_uninitialized_reverts       (NotInitialized)
test_onlyGovernance_postLaunchEnd_reverts       (LaunchEnded)
test_onlyGovernance_afterNFTTransfer_newOwnerHasAccess
test_burnProtection_govNFT_inPhase1_reverts     (CannotBurnGovernanceNFT)
test_burnProtection_govNFT_inPhase2_allows
test_burnProtection_nonGovNFT_inPhase1_allows
test_launchPhaseOf_returnsCorrectPhase
test_multiplePositionsFirstMulticall_onlyFirstCapturesGov
```

## DoD
- `forge fmt --check` и `forge build --sizes` — чисто.
- `forge test --match-contract GovernanceModule -vvv` — зелёные (15/15).
- Коммит с тегом `#1`, отдельная ветка.
