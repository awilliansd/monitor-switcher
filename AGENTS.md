# AGENTS.md

Indicações específicas deste repositório para agentes de IA (e humanos) que forem editar o código.

## Ambiente

- **Node.js 22 LTS** é obrigatório (definido em `.nvmrc`/`.node-version` e em `package.json` `engines`).
  `.npmrc` tem `engine-strict=true`, então `npm install` recusa Node incompatível.
- **npm 10+**.

## Comandos

| Tarefa | Comando |
|---|---|
| Rodar em desenvolvimento | `npm start` |
| Testes (Jest, Node env) | `npm test` |
| Gerar instalador | `npm run dist` |
| Publicar release | `npm run dist:publish` |

**Não há lint nem typecheck configurados**. O único verificador automatizado é o Jest. Ao terminar uma alteração não-trivial, rode `npm test`.

Para checagem de sintaxe rápida:

```sh
node --check main.js
node --check modules/constants.js
```

## Arquitetura

- **Tray-only app**: não há janela visível, renderer, preload ou HTML. Toda a lógica está no processo principal.
- **`main.js`**: classe `MonitorSwitcherApp` + bootstrap em `if (require.main === module)`. Importável sem side-effects (test-friendly).
- **`modules/constants.js`**: strings, enums (`MODES`, `UPDATE_PHASE`, `ENV`), magic numbers, nomes de recursos e colunas CSV — **edite em apenas um lugar**.
- **`display_config.txt`** (extraResource): configuração editável pelo usuário com `DISPLAY1=` e `DISPLAY2=` (stable IDs do MultiMonitorTool).
- **`MultiMonitorTool.exe`** (extraResource): binário NirSoft que faz a troca do monitor principal via CLI.

## Fontes de verdade

- **Strings/enums/magic numbers**: `modules/constants.js`.
- **Configuração do usuário**: `display_config.txt` (não commitar config pessoal).
- **Build/empacotamento**: `package.json` `build` (`files` inclui apenas `main.js`; `extraResources` copia o `.exe`, `.txt` e `.ico`).

## Segurança

- `execFile` (não `exec`) com array de args para `/SetPrimary` — evita shell quoting no displayId.
- Auto-update via `electron-updater` funciona apenas empacotado e no Windows (`canUseAutoUpdater()`).
- Sem code signing configurado; `verifyUpdateCodeSignature` não é setado no build.

## Convenções

- Commits são gerenciados pelo usuário; **não commite sem solicitação explícita**.
- Não adicione comentários explicativos a menos que o usuário peça.
- Textos de UI em **português (pt-BR)**.
- `main.js` não deve ter side effects no top-level (guarda `require.main === module`).