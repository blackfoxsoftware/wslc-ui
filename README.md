# WSLC UI

UI desktop (Electron + Vite + React + TypeScript) para o **WSL container** (`wslc.exe`), o recurso de containers Linux nativo do Windows Subsystem for Linux — atualmente em **preview público**.

## Sobre o WSLC (resumo da pesquisa)

- Anunciado no Microsoft Build 2026; preview público desde 29/06/2026, como parte do **WSL 2.9.3 (pré-release)**. GA prevista para o outono de 2026 (hemisfério norte).
- Dois componentes:
  - **CLI `wslc.exe`** (alias `container.exe`) — já vem embutida no WSL, com sintaxe compatível com Docker (`wslc run`, `wslc image list`, `wslc container list`, `wslc build`, `wslc exec`, `wslc stats`, `wslc container logs`, `wslc container prune`, `wslc system session terminate`…).
  - **API WSL container** — pacote NuGet `Microsoft.WSL.Containers` com projeções **C#**, **C++/WinRT** e uma **API C plana** (`wslcsdk.h` / `wslcsdk.dll`), organizada em `WslcService` → `Session` → `Container` → `Process`. Não há endpoint REST/socket documentado.
- Instalação: `wsl --update --pre-release` (exige WSL ≥ 2.9.3).

### Referências

- Visão geral: <https://learn.microsoft.com/windows/wsl/wsl-container>
- Tutorial: <https://learn.microsoft.com/windows/wsl/tutorials/wsl-containers>
- Anúncio: <https://devblogs.microsoft.com/commandline/wsl-container-is-now-available-for-public-preview/>
- Referência da API (C/C#/C++): <https://wsl.dev/api-reference/>
- Exemplos oficiais: <https://aka.ms/wslc-samples>
- TUI da comunidade (referência de UX): <https://github.com/craigloewen-msft/lazywslc>

## Stack

- **Electron + electron-vite + React 19 + TypeScript** (strict), janela **frameless** com topbar customizada
- **Zod** — contrato IPC tipado e validado de ponta a ponta
- **Zustand** — estado do renderer em stores tipadas
- **TanStack Router** — roteamento file-based (`src/renderer/src/routes/`, hash history para `file://`)
- **HeroUI v3 + Tailwind CSS v4** — biblioteca de componentes (React Aria por baixo) tematizada pelas variáveis semânticas dela; o design system do app vive em `src/renderer/src/design/`
- **UX**: rail de navegação recolhível, confirmações via modal global (`confirm-store`), toasts semânticos (`toast` do HeroUI), menus de ação por linha, Imagens em abas Locais/Catálogo e diálogo de execução em cinco abas com sugestões automáticas por imagem
- **Vitest** — testes de main, shared e renderer (Testing Library + happy-dom)
- **oxlint + oxfmt** — lint e formatação (toolchain oxc)

## Design system

Tudo o que é visual vive em `src/renderer/src/design/` e as features importam só de `@/design`
(nunca de `@heroui/react` direto): um sistema só no app e um lugar só para trocar o que for preciso.

- **`theme.css`** — tokens. O HeroUI expõe o visual inteiro por variáveis semânticas
  (`--background`, `--surface`, `--overlay`, `--field-*`, `--accent`, status); tematizar é redefini-las,
  então não há CSS de componente duplicado.
- **`glass.css`** — material e forma: o raio único, a hierarquia dos botões e o vidro dos overlays.
- **`layout / controls / overlays / data / feedback`** — composições do app (PageHeader, Group,
  TextInput, SelectInput, AppModal, AppSheet, DataTable, StateChip, Empty…).

Regras que mantêm a interface coesa:

| Regra                                  | Por quê                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Um raio (6px) em tudo**              | Botão, campo, chip, painel e overlay usam `var(--radius)`. O HeroUI vem com pílula (`rounded-3xl`); o override está em `glass.css`.                                                                                                                                                                                                                                                                                                          |
| **Fundo neutro e opaco**               | Grafite liso. Sem papel de parede, sem malha, sem brilho colorido: o que aparece é o dado.                                                                                                                                                                                                                                                                                                                                                   |
| **Vidro só onde há algo atrás**        | `backdrop-filter` nos overlays flutuantes (modal, drawer, menu, tooltip, toast). A faixa fixa da view (`page-bar`) é opaca: as listas rolam por dentro do painel, então nada passa por baixo dela — e o blur ainda alisava o grão do fundo, deixando a faixa mais clara que o resto. Em superfície opaca o blur não faz nada e só custa GPU.                                                                                                 |
| **Uma rampa de cinza, quatro degraus** | `--background` (janela, rail, página) → `--surface` (painel: `Group`, `DataTable`, modal, popover) → `--field-background` (campo e `field-row`) → `--well` (poço: log, inspect, terminal, comando para copiar). Todos saem da rampa `--graphite-*`; cor escolhida fora dela destoa do app inteiro. Faixa dentro de um painel não ganha tom próprio: é hairline. Controle (botão secundário, aba ativa, toggle) usa `--default`, um valor só. |
| **Campo sobe, saída desce**            | O campo é um controle: fica um passo ACIMA do painel e é opaco — translúcido muda de tom conforme o que está atrás, e o HeroUI deriva hover/foco/borda dele por `color-mix`. Só o que se lê (log, terminal, inspect) desce para o poço. Grupo que embrulha campos usa `field-group` (hairline, sem fundo), senão os campos somem dentro dele.                                                                                                |
| **Uma superfície por tela**            | Nada de card dentro de card: agrupar é hairline (`Group`) e espaço, não caixa empilhada. `Group` e `DataTable` usam o MESMO fundo e a mesma moldura, para conviverem na mesma tela.                                                                                                                                                                                                                                                          |
| **A lista ocupa a tela**               | `PageShell fill` + `DataTable fill`: a página não rola, quem rola são as linhas por dentro da moldura, com o cabeçalho fixo. Filtros ficam na faixa superior do painel.                                                                                                                                                                                                                                                                      |
| **Ajuda em tooltip**                   | Explicação de campo vai em `hint` (ícone ⓘ ao lado do rótulo), não entre parênteses no rótulo. `description`, que imprime abaixo do campo, é para o que precisa ser lido antes.                                                                                                                                                                                                                                                              |
| **Ação de criar é só ícone**           | No cabeçalho da view, criar/baixar é um `IconAction` primário com tooltip. O título já diz de que recurso se trata. Chave liga/desliga no cabeçalho é `IconToggle`: o estado ligado aparece no fundo de acento do botão, então o rótulo diz o que a chave mostra ("Mostrar parados").                                                                                                                                                        |
| **Ciano só para principal/ativo**      | `--accent` (#00B5CC, a cor da marca) marca a ação principal e o estado ativo. Verde/âmbar/vermelho ficam reservados a estado real de recurso, sempre acompanhados de texto.                                                                                                                                                                                                                                                                  |
| **Tipografia nativa do Windows**       | Segoe UI Variable (texto e display) e Cascadia Mono para dados. Zero fonte baixada, nenhum conflito com a CSP do renderer.                                                                                                                                                                                                                                                                                                                   |
| **Números tabulares**                  | `font-variant-numeric: tabular-nums` global: métricas e IDs não dançam entre atualizações.                                                                                                                                                                                                                                                                                                                                                   |
| **Acessibilidade**                     | Botão de ícone sempre com tooltip e nome acessível; rótulo acima do campo; `prefers-reduced-transparency` e `prefers-reduced-motion` desligam vidro e animação.                                                                                                                                                                                                                                                                              |

Modo escuro é decisão de produto (ferramenta de terminal). Os tokens estão prontos para uma variante
clara, mas ela não é exposta hoje.

## Catálogo de imagens

Catálogo curado com **75+ imagens** em 9 categorias (base, linguagens, bancos & busca, web & proxy,
mensageria & cache, DevOps, monitoramento, IA e apps prontos), cada uma com portas/variáveis/GPU
sugeridas que pré-preenchem o diálogo de execução. A aba Catálogo também faz **busca ao vivo no
Docker Hub** (com debounce, via processo main — CSP do renderer é restrita a `'self'`), mostrando
estrelas e o selo de imagem oficial.

## Cobertura da CLI wslc

| Recurso                                                                                                                                                                                                                 | Onde                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `run` (**todos os flags**: portas/-P, env/--env-file, volumes/tmpfs, GPU, --rm, -d, rede+aliases, hostname/domínio, DNS, user, entrypoint, workdir, labels, cpus/memory/shm, ulimits, healthcheck, stop-signal/timeout) | Diálogo “Executar container” em 5 abas                                                       |
| `container list` / `stats` (`--format json`)                                                                                                                                                                            | Lista + colunas CPU/Memória ao vivo (JSON, imune a locale; fallback p/ tabela)               |
| `container inspect` / `image inspect` / `volume inspect`                                                                                                                                                                | Drawer de detalhes / menu da imagem / botão da view Volumes                                  |
| `exec`                                                                                                                                                                                                                  | Comando rápido no drawer + **terminal embutido** (xterm.js) + terminal externo               |
| `container logs --follow` / `image pull` / `push` / `build`                                                                                                                                                             | Painel de saída em streaming                                                                 |
| `build -t <tag> <contexto>`                                                                                                                                                                                             | Diálogo “Build” com seletor de pasta                                                         |
| `tag`                                                                                                                                                                                                                   | Menu da imagem → “Nova tag…”                                                                 |
| `image save` / `load` / `import`                                                                                                                                                                                        | Menu da imagem → “Salvar como .tar…”; menu “mais ações” → carregar/importar                  |
| `container export`                                                                                                                                                                                                      | Menu do container → “Exportar filesystem (.tar)…” (**só parado** — a CLI recusa em execução) |
| `container kill`                                                                                                                                                                                                        | Menu do container → “Encerrar (SIGKILL)” com confirmação                                     |
| `login` / `logout` (`--password-stdin`)                                                                                                                                                                                 | Menu “mais ações” de Imagens → “Login/Logout de registry…”                                   |
| `start` / `stop` / `rm` / `prune`                                                                                                                                                                                       | Ações por linha + menu “mais ações”                                                          |
| `restart`                                                                                                                                                                                                               | **Emulado** com stop + start (a CLI não tem restart)                                         |
| `volume create/list/rm/prune`                                                                                                                                                                                           | View Volumes + aba Volumes do run                                                            |
| `network create/list/inspect/remove/prune/connect/disconnect`                                                                                                                                                           | **View Redes** (prune com confirmação na UI — a CLI apaga direto!)                           |
| `system session terminate` / `list`                                                                                                                                                                                     | View Sistema (encerrar + tabela de sessões ativas)                                           |
| `settings` / `settings reset`                                                                                                                                                                                           | View Sistema → abrir settings.yaml no editor / redefinir                                     |
| Portas publicadas                                                                                                                                                                                                       | Botão “abrir no navegador” (localhost:porta)                                                 |

**Cobertura 100%** (auditoria + fechamento em 01/09/2026). Fora da UI, por decisão documentada:
`system session enter/run/shell` (fluxo interativo de terminal — `run`/`shell` só funcionam
dentro de um `enter`, que anexa a um storage de sessão existente), `container attach`
(substituído de propósito por `exec -i sh -i`) e `--cidfile`/`-i`/`-t` do run (sem sentido numa
UI: o app já mostra o ID e tem terminal próprio). Detalhes na regra 18 do ROADMAP.

## Motor nativo (wslcsdk via FFI)

Além da CLI, o app carrega a **API C nativa** (`wslcsdk.dll`, vendorizada do NuGet
`Microsoft.WSL.Containers` em `vendor/wslcsdk/`) via **koffi**: toda a superfície do header está
vinculada em `src/main/services/wslc/native/bindings.ts`, e a view Sistema mostra o status do SDK
(versão, DLL, componentes faltando).

**Fases 1 a 7 (roadmap completo + cobertura 100%):** toggle **Motor: CLI / Nativo** em Sistema
(persistido em `settings.json`). No motor nativo o app mantém uma sessão própria (`WslcUi`,
singleton em `native/session.ts`, criada sob demanda — todas as chamadas ao SDK via `.async` do
koffi) e cobre:

- **Imagens** (`native/image-ops.ts`, Fases 4 e 5): listar e remover; **pull e push com progresso
  estruturado por camada** (barras no painel de stream via `WslcContainerImageProgressCallback`,
  com cancelamento real — o callback devolve E_ABORT); **tag** nativa; **load** de tarball OCI e
  **import** de tarball rootfs. Save/inspect/build só existem no motor CLI (o SDK não os expõe) e
  ficam ocultos no nativo.
- **Registry** (`native/registry.ts`, Fase 5): “Login em registry…” valida as credenciais com
  `WslcSessionAuthenticate` e as guarda **só em memória** — elas viram o blob X-Registry-Auth
  (base64) usado pelo push e pelo pull de registries privados. Sem login, o push vai anônimo
  (`"{}"`).
- **Volumes VHD** (`native/volumes.ts`, Fase 5): criar com **tamanho, tipo (dinâmico/fixo) e dono
  (uid/gid)**, listar (readdir de `<storage>\volumes` — o SDK não enumera; volumes “guest”
  auto-criados ao anexar um nome inexistente não aparecem) e remover.
- **Containers** (`native/containers.ts`): executar com opções completas (comando/env/entrypoint/
  **workdir** no init process, **hostname/domainname**, portas TCP, bind mounts e volumes
  nomeados, `--rm`, GPU), listar com estado real, start/stop/restart/remover/prune, **kill**
  (StopContainer com sinal imediato), **exec**, **inspect** e **logs ao vivo** capturados por
  callbacks de stdout/stderr do init process.
- **Tuning da sessão** (Fase 7): CPU, memória, tamanho do VHD do storage e GPU da VM da sessão
  (`WslcSetSessionSettings*`), configurados em Sistema e persistidos em `settings.json` — salvar
  com o motor nativo ativo **reinicia a sessão na hora** (terminate + create; imagens são
  mantidas, containers não).
- **Terminal embutido** (xterm.js, Fase 3) nos DOIS motores: shell interativo persistente dentro
  do container (cd/export mantêm estado). No motor CLI é `wslc exec -i` com pipes; no nativo, um
  **bridge por FIFO** (o SDK preview não expõe stdin nem PTY — ver ROADMAP). Sem TTY o modo é por
  linha: eco/edição/histórico locais, apps full-screen (vim, top) não rodam. O aviso que o `sh -i`
  cospe ao subir sem TTY (`can't access tty; job control turned off`) é filtrado em
  `terminal-noise.ts` — ele só repetia, em jargão, o aviso que a UI já mostra no topo do painel. O
  filtro vale só até a primeira linha digitada, para nunca engolir saída de comando.
- **Resiliência** (Fase 6): **crash dumps** — se um processo morrer por sinal dentro de um
  container (SIGSEGV, SIGABRT…), o WSL coleta um `.dmp` em `%LOCALAPPDATA%\temp\wslc-crashes` e o
  app mostra um toast com processo/pid/sinal e a ação **“Mostrar dump”** (abre o Explorer no
  arquivo). O termination event da sessão é monitorado com o motivo (shutdown/crash) no toast.
- **Instalação guiada** (Fase 6): quando o ambiente não está pronto, o SetupView oferece
  **“Instalar componentes automaticamente”** (`WslcInstallWithDependencies` — Virtual Machine
  Platform e pacote WSL, com barra de progresso por componente); funciona só com a DLL vendorada.
  `WSLC_UI_MOCK=setup` simula a máquina incompleta para ver essa tela.

Limitações do SDK preview (documentadas no ROADMAP): sem stats, redes nomeadas ou export; só TCP
nas portas; a sessão é de um processo por vez; e **não há como reabrir handles de container** —
por isso os containers nativos são removidos quando o app fecha, e Sistema tem a ação destrutiva
"Resetar sessão nativa" (termina a sessão e apaga o storage dela). As 18 regras de
marshalling/comportamento aprendidas por probe estão em [ROADMAP.md](./ROADMAP.md).

## Sistema de logs

O processo main tem um logger estruturado (`services/logger.ts`): cada entrada (nível debug/info/
aviso/erro + categoria app/ipc/cli/nativo/motor/streams/terminal) vai para um ring buffer em
memória, para um arquivo rotacionado em `userData/logs/wslc-ui.log` e para o renderer ao vivo
(evento `logs:entry`). Estão instrumentados: toda invocação da CLI (comando, duração, código),
streams, sessão/containers/exec nativos, trocas de motor, terminais e falhas de validação/handler
do IPC. A UI é um **painel retrátil acoplado ao rodapé** do app (barra com contadores de erros e
avisos; expandida mostra filtros por nível mínimo, categoria e texto, auto-rolagem, limpar e
abrir a pasta de logs).

## Arquitetura

```
src/
├── shared/                      # Fonte única de verdade dos tipos
│   ├── schemas.ts               # Schemas Zod do domínio (tipos via z.infer)
│   ├── format.ts                # Helpers de formatação usados por main e renderer
│   └── ipc/
│       ├── contract.ts          # Contrato IPC: canal → { input, output } (Zod)
│       └── api.ts               # Interface WslcApi (window.wslcApi)
├── main/
│   ├── index.ts                 # Bootstrap (ciclo de vida do app)
│   ├── window.ts                # Criação da janela
│   ├── ipc/
│   │   ├── router.ts            # ipcMain.handle genérico: parse(input) → handler → parse(output)
│   │   ├── events.ts            # Eventos main → renderer validados pelo contrato
│   │   └── index.ts             # Liga o contrato aos serviços
│   └── services/
│       ├── logger.ts            # Sistema de logs: ring buffer + arquivo rotacionado + evento
│       └── wslc/
│           ├── service.ts       # Interface WslcService
│           ├── real.ts          # Implementação real (wslc.exe; list/stats via --format json)
│           ├── mock.ts          # Modo demonstração (WSLC_UI_MOCK=1; =setup simula sem ambiente)
│           ├── ops.ts           # Fronteiras injetáveis: motor nativo, streams e efeitos externos
│           ├── real-ops.ts      # Fiação das fronteiras no mundo real (FFI, spawn, shell, diálogos)
│           ├── mock-ops.ts      # Dublê das fronteiras (sessão nativa fictícia, streams simulados)
│           ├── mock-state.ts    # Ajustes do modo demo: injeção de falha, diálogos, cadência
│           ├── cli.ts           # execFile sem shell + decodificação UTF-16LE/UTF-8
│           ├── table.ts         # Parser de tabelas estilo docker (fallback p/ CLIs antigas)
│           ├── run-args.ts      # Montagem dos argumentos de `wslc run` (todos os flags)
│           ├── sessions.ts      # Parser do `system session list` (cabeçalhos localizados)
│           ├── version.ts       # Comparação de versões do WSL
│           ├── streams.ts       # Processos de longa duração (logs -f, pull) → StreamSink
│           ├── terminals.ts     # Registro dos terminais embutidos (write/close por id)
│           ├── terminal-cli.ts  # Terminal no motor CLI (`exec -i` com pipes)
│           └── native/          # Motor nativo (bindings, sessão, containers, terminal FIFO,
│                                #   image-ops [pull/push c/ progresso, tag, load/import] +
│                                #   progress, registry [login/X-Registry-Auth], volumes [VHDX],
│                                #   crash-dumps [toast + .dmp], install [instalação guiada])
├── preload/                     # invoke/subscribe tipados pelo contrato → window.wslcApi
└── renderer/src/
    ├── routes/                  # TanStack Router file-based (__root, containers, images, volumes, networks, system)
    ├── routeTree.gen.ts         # Gerado pelo router-plugin (não editar)
    ├── stores/                  # Zustand (app): env-store, stream-store, window-store, confirm-store
    ├── features/                # Uma pasta por domínio: view + store + testes
    │   ├── containers/          # ContainersView, RunDialog, TerminalSheet (xterm), store
    │   ├── images/              # ImagesView, catálogo, diálogos (tag, build, import, login), store
    │   ├── volumes/             # VolumesView, diálogo de criação (VHD no nativo), inspect, store
    │   ├── networks/            # NetworksView, criar/conectar/desconectar, store
    │   ├── logs/                # store do painel de logs (entradas + filtros)
    │   ├── system/              # SystemView (motor, sessões wslc, settings, tuning nativo)
    │   └── setup/               # SetupView (gate de ambiente + instalação guiada)
    ├── components/
    │   ├── app-shell.tsx        # Topbar + rail + gate de ambiente + Outlet + painéis
    │   ├── app-rail.tsx         # Rail de navegação (recolhível, estado em ui-store)
    │   ├── brand.tsx            # Marca (SVG em data URI: DOM limpo e CSP ok)
    │   ├── title-bar.tsx        # Topbar da janela frameless (drag + min/max/close)
    │   ├── stream-panel.tsx     # Painel de streaming (texto + barras de progresso por camada)
    │   └── logs-panel.tsx       # Painel retrátil de logs do app (rodapé)
    ├── design/                  # design system: tokens (theme.css), material (glass.css)
    │                            # e composições (layout, controls, overlays, data, feedback)
    ├── hooks/                   # usePolling
    ├── assets/logo/             # typo.svg (assinatura da marca)
    ├── lib/                     # utils (cn), errors, terminal-input (disciplina de linha)
    ├── styles/globals.css       # entrada: tailwind + @heroui/styles + design/
    └── test/                    # setup do Vitest + mock de window.wslcApi
```

### Janela frameless

A janela usa `frame: false`; a topbar (`title-bar.tsx`) é a região de arrasto (`-webkit-app-region: drag`)
com controles próprios de minimizar/maximizar/fechar. Os controles falam com o main pelos canais
`window:*` do contrato Zod, e o main empurra `window:state` quando o estado de maximização muda.

### IPC tipado de ponta a ponta

Cada canal declara schemas Zod de entrada e saída em `src/shared/ipc/contract.ts`. O processo main valida o payload **antes** do handler e a resposta **antes** de devolvê-la (`router.ts`); eventos main → renderer também passam por `parse` (`events.ts`), e o preload valida os payloads de eventos recebidos. Um dado malformado falha na fronteira do processo — nunca no meio da UI. Os tipos TypeScript são todos inferidos dos schemas (`z.infer`), então contrato e tipos não divergem.

### Integração com o wslc

Nesta fase o app **encapsula a CLI `wslc.exe`** via `execFile` sem shell (imune a injeção). A API C (`wslcsdk.dll`) fica como evolução futura — via FFI (koffi) ou addon N-API. O parser de saída lê tabelas no estilo Docker por offset de coluna do cabeçalho, tolerante a variações — importante enquanto a CLI está em preview.

### Fronteiras do processo main

O app fala com o mundo por quatro portas, e **todas são injetáveis**: o serviço da CLI
(`WslcService`), o motor nativo, os streams de longa duração e os efeitos externos (diálogos do
Electron, shell do Windows, busca no Docker Hub). Em produção elas são a implementação real; sob
`WSLC_UI_MOCK` viram dublês. É o que permite exercitar o app inteiro — inclusive o motor nativo —
sem WSL, sem a `wslcsdk.dll` e sem abrir uma única janela do Windows.

## Requisitos

- Windows 11 + WSL **2.9.3 ou superior** (pré-release): `wsl --update --pre-release`
- Node.js 20+

Se o `wslc` não estiver disponível, o app abre em uma tela de setup com instruções.

## Desenvolvimento

```powershell
npm install
npm run dev            # dev server com HMR
npm run build          # build de produção (out/)
npm run typecheck      # tsc (main/preload + renderer)
npm run lint           # oxlint (lint:fix para autocorrigir)
npm run format         # oxfmt (format:check no CI)
npm test               # vitest (test:watch, test:coverage)
npm run test:e2e       # build + Playwright contra o app Electron (e2e/)
npm run check          # typecheck + lint + format:check + test
npm run cenario:nativo # povoa a sessão nativa com o cenário de teste (app fechado)
```

### Cenário de teste com wslc real (`scripts/`)

Dois scripts povoam uma instalação de verdade. Eles **não** fazem a mesma coisa, e a diferença é
arquitetural, não preguiça — veja o quadro abaixo.

```powershell
pwsh -File scripts/cenario-demo.ps1            # motor CLI: cenário completo
pwsh -File scripts/cenario-demo.ps1 -Reset

npm run cenario:nativo                         # motor nativo: imagens + volumes (app FECHADO)
npm run cenario:nativo -- --reset
```

**`cenario-demo.ps1` (motor CLI)** monta o cenário inteiro: as imagens (com uma segunda tag
apontando para o mesmo _image ID_), 3 volumes, 2 redes e 6 containers — um completo (portas
publicadas, healthcheck, alias de rede, hostname/domínio, labels, volume e env), um com
limites/tmpfs/DNS cuspindo log a cada 2 s, um gravando num VHDX, um parado (único estado em que o
**Export** funciona) e dois que terminaram sozinhos, com código 0 e 1, para a lista pintar os dois
desfechos.

**`cenario-nativo.ts` (motor nativo)** prepara só imagens, a tag e os volumes VHDX — a parte
demorada. Os containers do motor nativo têm de ser criados **pelo app**, no diálogo “Executar
container”.

> **Os dois motores têm storage separado — isso não é bug do app.** A CLI grava em
> `%LOCALAPPDATA%\wslc\sessions\wslc-cli-<usuário>\storage.vhdx` e a sessão nativa em
> `%LOCALAPPDATA%\wslc-ui\native-session\storage.vhdx`: dois arquivos, dois mundos. Um container
> criado pela CLI **nunca** aparece no motor nativo, e vice-versa. Como o `wslc.exe` não tem flag
> para endereçar outra sessão (`wslc system session` só faz enter/run/shell/terminate), a única
> porta de entrada do storage nativo é o próprio SDK — daí o `cenario-nativo.ts` usar os módulos de
> `native/` direto (bundle via esbuild, sem Electron). E como o SDK aceita **um processo por
> sessão**, ele exige o app fechado.

**Por que o script nativo não cria containers.** O SDK preview não enumera containers: o app mantém
um `registry` **em memória** (`native/containers.ts`) com os handles vivos, e `listNativeContainers`
itera esse Map. Cada processo só enxerga os containers que ele mesmo criou — um seeder externo cria
containers de verdade, mas eles saem do mundo observável assim que o processo termina. Imagens, tags
e volumes ficam, porque moram no `storage.vhdx` e são relidos a cada sessão.

Dois efeitos colaterais do mesmo preview, medidos:

- **Porta do host é recurso compartilhado entre os motores.** O storage é separado, mas o socket
  não: com `8080` publicado nos dois cenários, o segundo a subir falha com “apenas uma utilização de
  cada endereço de soquete”. Por isso o cenário nativo usa `9080`/`9443`.
- **Container que morre junto com o processo deixa o volume travado.** A remoção passa a responder
  `O volume 'x' está em uso.` — e nem `restart` da sessão solta, porque o registro órfão está no
  storage. Montar continua funcionando; só apagar trava. A saída é **Resetar sessão** em Sistema,
  que zera containers, imagens **e** volumes.

### Modo de demonstração (sem wslc instalado)

Enquanto o WSL pré-release não estiver instalado, dá para desenvolver a UI com dados simulados:

```powershell
$env:WSLC_UI_MOCK = '1'
npm run dev
```

O modo mock cobre o app **inteiro**: ambiente, containers, imagens, volumes e redes em memória
(`mock.ts`), uma sessão nativa fictícia com storage próprio, streams que progridem sozinhos e
terminais que ecoam (`mock-ops.ts`). Nada chama o `wslc.exe`, a DLL ou o shell do Windows — abrir
o Explorer, o navegador ou o settings.yaml vira uma entrada na view de Logs.

Quatro variáveis afinam o dublê (`mock-state.ts`), e é com elas que o E2E testa os caminhos tristes:

| Variável               | Para quê                                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WSLC_UI_MOCK`         | `1` = ambiente pronto; `setup` = máquina sem o WSL/wslc (mostra o portão de instalação)                                                                                 |
| `WSLC_UI_MOCK_FAIL`    | Canais do contrato IPC que devem falhar, separados por vírgula (`volumes:create,images:pull`), mais `engine:native` (criação da sessão) e `native:status` (SDK ausente) |
| `WSLC_UI_MOCK_PICK`    | Caminho devolvido pelos diálogos de arquivo; `cancel` simula o cancelamento                                                                                             |
| `WSLC_UI_MOCK_TICK_MS` | Cadência dos streams e da instalação simulados (padrão 80 ms)                                                                                                           |

## Testes

Dois projetos Vitest (`vitest.config.ts`):

- **main** (ambiente node): parser de tabelas, versões, decodificação, argumentos de run, mock service, streams (processos reais), router IPC (validação Zod nas duas direções) e schemas/contrato.
- **renderer** (happy-dom + Testing Library): stores zustand (stream, containers, volumes, env), hooks (usePolling) e componentes (RunDialog, ContainersView, SetupView) com `window.wslcApi` mockado. As stores são restauradas ao estado inicial entre testes (`test/setup.ts`).

### E2E (Playwright + Electron)

`npm run test:e2e` compila e roda a suíte de `e2e/` contra o **app de verdade** — processo main,
preload e a validação Zod do contrato IPC no caminho. Não há navegador: `_electron.launch` sobe o
Electron compilado em `out/`.

Cada teste sobe a **sua própria instância**, com um `--user-data-dir` temporário. Isso dá estado
limpo (settings e logs), permite semear o motor no `settings.json` antes do app abrir — então o
app já nasce em CLI ou em nativo — e libera o paralelismo, porque o lock de instância única do
Electron é por pasta de dados.

As opções da fixture (`e2e/fixtures/app.ts`) são declaradas por bloco com `test.use`:

```ts
test.use({ engine: 'native', fail: ['volumes:create'], pick: 'cancel' })
```

| Arquivo                   | Cobre                                                                                                                               |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `shell.spec.ts`           | Navegação, recolher o menu, botões da janela, painel de logs (filtro, limpar, ao vivo)                                              |
| `setup.spec.ts`           | Portão de ambiente incompleto, instalação guiada (conclui, falha e sem SDK)                                                         |
| `containers.spec.ts`      | Ciclo de vida nos dois motores, run com portas, detalhes/exec, logs, prune, e as diferenças reais (stats, export, terminal externo) |
| `images.spec.ts`          | Pull/push com progresso, tarballs, tags, registry, catálogo e Docker Hub, build; ausências do motor nativo                          |
| `volumes.spec.ts`         | Volumes nos dois motores, VHDX com tamanho/tipo/dono e a validação do formulário                                                    |
| `networks.spec.ts`        | Redes, conectar/desconectar, prune confirmado e o aviso do motor nativo                                                             |
| `system.spec.ts`          | Ambiente, sessões, troca de motor (ida e volta, persistida) e tuning da sessão nativa                                               |
| `terminal.spec.ts`        | Terminal embutido nos dois motores (eco de linha, sem TTY)                                                                          |
| `eventos-nativos.spec.ts` | Crash dump com o caminho do `.dmp` e o fim inesperado da sessão                                                                     |

Cada área tem um bloco de **caminhos tristes** alimentado por `WSLC_UI_MOCK_FAIL`: listagem que
falha vira alerta na view, ação que falha vira toast com o motivo, e o diálogo que falhou continua
aberto. Os seletores saem de papel + nome acessível (o que um leitor de tela enxerga) e, nos
overlays do HeroUI, do `data-slot` — nunca de classe de Tailwind.

## Licença

Código deste repositório: **MIT** — ver [LICENSE](LICENSE).

### Componentes de terceiros

- **`Microsoft.WSL.Containers`** (`wslcsdk.dll` / `wslcsdk.h`) — SDK da Microsoft, em preview, sob a
  licença do próprio pacote NuGet. **Não é redistribuído aqui**; baixe conforme
  [`vendor/wslcsdk/README.md`](vendor/wslcsdk/README.md).
- **`wslc.exe`** — parte do WSL, distribuída pela Microsoft. Este projeto apenas o consome; não o
  inclui nem o modifica.
- Dependências npm — cada uma sob a sua própria licença (ver `package-lock.json`).

Projeto **não oficial** e sem vínculo com a Microsoft.
