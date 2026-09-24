# Changelog

## 0.1.0 (2026-09-11)


### Added

* add drag-to-move and a Move to... fallback on the kanban board ([d120b8a](https://github.com/scottt732/paseo-linear/commit/d120b8af8d078b1f4db927fd62d3fc190a664cf0))
* add issueCreate mutation and register linear.create-issue handler ([f131f50](https://github.com/scottt732/paseo-linear/commit/f131f50ec38c177bd8add8b189e4c502df2f22ed))
* add isValidDueDate helper for due-date validation ([82edafa](https://github.com/scottt732/paseo-linear/commit/82edafadff9acb0dc1cc45b6b927f5e05d09cb93))
* add listTeamsRpc and assignToMe to createIssueRpc ([d7727a4](https://github.com/scottt732/paseo-linear/commit/d7727a4f96ca86cce439b92642c00e85fa52cfab))
* add pure drag-target resolution helpers for the kanban board ([686eb1d](https://github.com/scottt732/paseo-linear/commit/686eb1d9fa2663f119668bf552674d197a46c397))
* add pure dropEffect helper for drag feedback ([c5c85b2](https://github.com/scottt732/paseo-linear/commit/c5c85b2174b406e176d7d2efaa0250048b47d537))
* add pure repo-label matcher ([9469c55](https://github.com/scottt732/paseo-linear/commit/9469c5529e482f774e9cd746418f0fd49c1cd340))
* add pure repo-match explanation strings ([40c5902](https://github.com/scottt732/paseo-linear/commit/40c5902fad300ec9c3bfd466d0ce47d0fd3d60c4))
* add repo-matching settings fields ([4285bb9](https://github.com/scottt732/paseo-linear/commit/4285bb9e35d6cb4c65e3b92467d4943a661422aa))
* add repository label group picker to settings ([a28a12f](https://github.com/scottt732/paseo-linear/commit/a28a12f4d2bf32c5166cbf91adc3d86de37823a0))
* add repository picker to the start-work row ([7b46036](https://github.com/scottt732/paseo-linear/commit/7b46036ed9abd653891e41426ee3f40cebfd3627))
* add unassigned scope and createIssueRpc contract ([d0c5d58](https://github.com/scottt732/paseo-linear/commit/d0c5d5868fceebf10490c9655b3c24bab38a9c26))
* carry Linear label groups through issues, add label-groups RPC ([5de748b](https://github.com/scottt732/paseo-linear/commit/5de748b44aad876b98b82d35e0372e3674b02550))
* credential resolution with env precedence over settings ([371974e](https://github.com/scottt732/paseo-linear/commit/371974ea21db1621d55595cec6ee20ed132850b4))
* daemon handlers, settings registration, and attachment source ([7d2a93c](https://github.com/scottt732/paseo-linear/commit/7d2a93ccfb8d1867da76d5d80576a1c5a2879298))
* default start-work repository path to the current workspace ([04cefc3](https://github.com/scottt732/paseo-linear/commit/04cefc35f02c578879ecfd2d8548268bbd4311bd))
* extend Issue with priority, estimate, dueDate, position, prCount ([5a05188](https://github.com/scottt732/paseo-linear/commit/5a051885e0bc8d9bb6e32f6d441168022412f4aa))
* highlight the drop-target column during a kanban drag ([323bb77](https://github.com/scottt732/paseo-linear/commit/323bb77a019cc59f0858ba99153076e5072d3e9b))
* issue chip and rich issue card with external link and copy actions ([255a3dd](https://github.com/scottt732/paseo-linear/commit/255a3ddb1fe0273a15109f3c47b99bf6b4310096))
* issue panel with assigned, cycle, and triage scopes ([817186c](https://github.com/scottt732/paseo-linear/commit/817186c16bba71615835a673704dd2c617ad2a8d))
* issue-to-agent binding via labels with branch-name fallback ([3329e51](https://github.com/scottt732/paseo-linear/commit/3329e515b101023cdfb1c1b498041238620450f0))
* Linear comment, state, assignee, and attachment mutations ([b8a5447](https://github.com/scottt732/paseo-linear/commit/b8a54477d719ad7a73dcc20c580a8aa329758fb2))
* Linear custom coding tool launcher and setup documentation ([5fa29ea](https://github.com/scottt732/paseo-linear/commit/5fa29ead373abfadf1f0918ca0582a503233bbab))
* Linear GraphQL transport with error mapping ([53f78d9](https://github.com/scottt732/paseo-linear/commit/53f78d9a2ae1f7d206ad51820cfe300fc71725b3))
* Linear issue queries with parent-chain flattening and scope filters ([0772d8d](https://github.com/scottt732/paseo-linear/commit/0772d8dc7b4fd598b2149ba26711873e25dc38b8))
* Linear settings screen with connection test and key-source disclosure ([fca4a76](https://github.com/scottt732/paseo-linear/commit/fca4a761f5c09f8ee1f55ecb389c5cd9168d4206))
* make the Linear provider setting a picker instead of free text ([8842ca5](https://github.com/scottt732/paseo-linear/commit/8842ca5255ac73929edfe18a7af4ee828c4e537d))
* pure formatters for relative time, prompts, clamping, branch parsing ([8989213](https://github.com/scottt732/paseo-linear/commit/8989213bee288200efa2922bd99a62569f3fe099))
* rebuild Linear panel as a kanban board with issue creation ([7cc5c40](https://github.com/scottt732/paseo-linear/commit/7cc5c409c54e61b72394804b8d174f5e0e9c016c))
* replace the default-team free-text field with a team picker ([18fc28f](https://github.com/scottt732/paseo-linear/commit/18fc28f19446e3d989bad6fcbfbd7b2e98b19cf4))
* RPC, settings, and attachment-source contracts ([2ee29bc](https://github.com/scottt732/paseo-linear/commit/2ee29bcf094cf528ce502ddc9e289282267cd48d))
* shared issue contract, breadcrumb, and attachment payload builder ([8a9a9fd](https://github.com/scottt732/paseo-linear/commit/8a9a9fd78440d87b1b272cdc59c6e392d819768e))
* start work on a Linear issue in a branch-off worktree ([705a8e0](https://github.com/scottt732/paseo-linear/commit/705a8e0f791b8698ba756eb4f0e0f86eefb63a6b))
* surface missing start-work settings before the button is pressed ([dd7eb43](https://github.com/scottt732/paseo-linear/commit/dd7eb43fc3588a6bf415d6b53a626d57a0678fcf))
* turn-end offer row, comment write-back, and per-agent composer pill ([9681575](https://github.com/scottt732/paseo-linear/commit/96815754d5b4e19df4cd8419003985da0f2c7d4f))
* use SquareKanban for the Linear surfaces ([9499625](https://github.com/scottt732/paseo-linear/commit/94996251b50b27a3b900626f927f65e9b8e4f9e9))
* use the Linear mark in every icon slot that accepts a component ([0a36b4f](https://github.com/scottt732/paseo-linear/commit/0a36b4f1873fb0cb40d69baac32ea4f86ab07772))


### Fixed

* do not nest a vertical scroller in the card modal body ([003ffc8](https://github.com/scottt732/paseo-linear/commit/003ffc8cc17a7557b8250a95610449372279e980))
* don't render a loading settings document as misconfigured ([a0c9351](https://github.com/scottt732/paseo-linear/commit/a0c9351e6beb2bf2a049ba3008071a1a9fef7c6a))
* make the board height flex-based instead of a percentage chain ([a09342e](https://github.com/scottt732/paseo-linear/commit/a09342ee94dffb882c2605a15c749c3e8fa8218a))
* treat an empty description the same as a missing one ([568fe46](https://github.com/scottt732/paseo-linear/commit/568fe46ae6d848edee2ab8e63518fb20951c32e0))


### Changed

* let dropEffect own the drop rule in onDrop too ([6147980](https://github.com/scottt732/paseo-linear/commit/6147980d6fb89bf04cda55666d25edc4671aad5a))
* move pushSettings into client/sync.ts ([3282046](https://github.com/scottt732/paseo-linear/commit/32820469b5d9d11e8c471f8a611bab7ba7efd323))


### Documentation

* bring the README up to date with the board ([fc18c4a](https://github.com/scottt732/paseo-linear/commit/fc18c4af11647400f43aa2f5af64b152b962b207))
* correct project.icon, empty descriptions, and the settings-push design ([c2e1ec1](https://github.com/scottt732/paseo-linear/commit/c2e1ec154902aa7822710addc839945aed16271c))
* correct theme tokens, audit regex, provider requirement, and panel split ([d31b451](https://github.com/scottt732/paseo-linear/commit/d31b4514a38af27d6195b6e4520bff98ceb92e9b))
* design for agent-driven issue grooming ([604c5b7](https://github.com/scottt732/paseo-linear/commit/604c5b768985096637b96b8326f25030dc8b298e))
* design for the Paseo ↔ Linear plugin ([d439500](https://github.com/scottt732/paseo-linear/commit/d43950035fd5f8a62fca9a2fb05d9a8c858c7a6e))
* implementation plan, project scaffold, and verified SDK shapes ([ecca075](https://github.com/scottt732/paseo-linear/commit/ecca0756a7feb14aaa4363622892771089ea3a61))
* scope the Linear launcher honestly and finish plan corrections ([f2875bd](https://github.com/scottt732/paseo-linear/commit/f2875bdcf1b5a1e25e15e5f99cbfe0f78f2a5ad2))
