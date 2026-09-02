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
- **UX**: rail de navegação recolhível, confirmações via modal global (`confirm-store`), toasts semânticos (`toast` do HeroUI), menus de ação por linha, Sistema em abas (Ambiente · Motor · API nativa · Atualizações), Imagens em abas Locais/Catálogo e diálogo de execução em cinco abas com sugestões automáticas por imagem
- **Movimento**: trocar de tela e trocar de aba usam view transition, com o eixo do movimento seguindo o eixo do navegador — o rail é vertical, então a página entra por baixo no sentido em que o item desceu; a faixa de abas é horizontal, então o painel entra pelo lado. Cabeçalho, faixa de abas e painéis do rodapé ficam parados: só a região que troca de conteúdo se move (`design/motion.css`). Mudança de layout — o rail recolhendo, o marcador do item ativo — é transição de CSS no elemento de verdade, que interpola o reflow em vez de esticar um snapshot. `prefers-reduced-motion` corta tudo na origem
- **Controles pelo tipo do dado**: lista de valores é `TagsInput` (um chip removível por valor, sem vírgula como sintaxe), número é `NumberField`, uso de CPU/memória é `Meter` (medição, não progresso), campo com seletor de arquivo é `InputGroup` e escolha única é `ToggleButtonGroup` — tudo composto em `design/controls.tsx`, nunca montado à mão na view
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

| Recurso                                                                                                                                                                                                                                      | Onde                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `run` (**todos os flags**: portas/-P, env/--env-file, volumes/tmpfs/--mount, GPU, --rm, -d, rede+aliases+--ip, --pull, hostname/domínio, DNS, user, entrypoint, workdir, labels, cpus/memory/shm, ulimits, healthcheck, stop-signal/timeout) | Diálogo “Executar container” em 5 abas                                                                                         |
| `container create`                                                                                                                                                                                                                           | Chave “Criar sem iniciar” no mesmo diálogo (nasce parado, como no docker)                                                      |
| `container list` / `image list` / `volume list` / `network list` / `stats` / `version` (`--format json`)                                                                                                                                     | Listas e colunas CPU/Memória ao vivo (JSON, imune a locale; fallback p/ tabela)                                                |
| `container inspect` / `image inspect` / `volume inspect`                                                                                                                                                                                     | Drawer de detalhes / menu da imagem / botão da view Volumes                                                                    |
| `exec` (`-u`, `-w`, `-e`, `--env-file`, `-d`)                                                                                                                                                                                                | Comando rápido no drawer (opções atrás do botão “Opções do exec”) + **terminal embutido** (xterm.js) + terminal externo        |
| `container logs` (`--follow`, `-n`, `-t`, `--since`, `--until`) / `image pull` / `push` / `build`                                                                                                                                            | Painel de saída em streaming; o botão abre com cauda, e “Logs com opções…” escolhe o recorte                                   |
| `image build` (`-t`, `-f`, `--build-arg`, `--no-cache`, `--target`, `--secret`, `-o`, `--progress`, `--iidfile`, `-l`, `--pull`)                                                                                                             | Diálogo “Build” em duas abas, com seletor de pasta                                                                             |
| `container cp [-a]`                                                                                                                                                                                                                          | Menu do container → “Copiar arquivos…” (host ↔ container; **entrando, o destino é uma pasta existente** — a wslc não renomeia) |
| `tag`                                                                                                                                                                                                                                        | Menu da imagem → “Nova tag…”                                                                                                   |
| `image save` / `load` / `import`                                                                                                                                                                                                             | Menu da imagem → “Salvar como .tar…”; menu “mais ações” → carregar/importar                                                    |
| `container export`                                                                                                                                                                                                                           | Menu do container → “Exportar filesystem (.tar)…” (**só parado** — a CLI recusa em execução)                                   |
| `container kill`                                                                                                                                                                                                                             | Menu do container → “Encerrar (SIGKILL)” com confirmação                                                                       |
| `login` / `logout` (`--password-stdin`)                                                                                                                                                                                                      | Menu “mais ações” de Imagens → “Login/Logout de registry…”                                                                     |
| `start` / `stop` (`-s`, `-t`) / `rm` (`-f`, `-v`) / `prune`                                                                                                                                                                                  | Ações por linha + menu “mais ações”; a remoção forçada é um botão no aviso da falha                                            |
| `image rm` (`-f`, `--no-prune`)                                                                                                                                                                                                              | Menu da imagem → “Remover”; forçar aparece no aviso quando a imagem está em uso                                                |
| `restart`                                                                                                                                                                                                                                    | **Emulado** com stop + start (a CLI não tem restart)                                                                           |
| `volume create/list/rm/prune` (incl. `-d vhd -o SizeBytes/Fixed/Uid/Gid` e `-l`)                                                                                                                                                             | View Volumes + aba Volumes do run (VHD nos **dois** motores desde a CLI 2.9.9)                                                 |
| `network create` (incl. `--ip-range`) `/list/inspect/remove/prune/disconnect`                                                                                                                                                                | **View Redes** (prune com confirmação na UI — a CLI apaga direto!)                                                             |
| `network connect` (`--network-alias`, `--ip`, `--link`, `--link-local-ip`, `--driver-opt`)                                                                                                                                                   | Diálogo “Conectar container” (as opções chegaram na CLI 2.9.8)                                                                 |
| `system session terminate` / `list`                                                                                                                                                                                                          | View Sistema (encerrar + tabela de sessões ativas)                                                                             |
| `settings` / `settings reset`                                                                                                                                                                                                                | View Sistema → abrir settings.yaml no editor / redefinir                                                                       |
| Portas publicadas                                                                                                                                                                                                                            | Botão “abrir no navegador” (localhost:porta)                                                                                   |

**Cobertura 100%** (auditada contra a árvore de `--help` da CLI 2.9.9 em 02/09/2026). Fora da UI,
por decisão documentada: `system session enter/run/shell` (fluxo interativo de terminal —
`run`/`shell` só funcionam dentro de um `enter`, que anexa a um storage de sessão existente),
`container attach` (substituído de propósito por `exec -i sh -i`), `--cidfile`/`-i`/`-t` do run
(sem sentido numa UI: o app já mostra o ID e tem terminal próprio), o `-` do `container cp` (a
origem por stdin: um diálogo não tem stdin para oferecer) e o `-f/--filter` das listagens (a UI
já filtra do lado dela, sobre a lista que tem em mãos). Detalhes nas regras 18 a 20 do ROADMAP.

O que é **só do motor CLI** — porque o SDK nativo não tem equivalente — some da tela quando o
motor nativo está ativo, em vez de falhar depois de clicado: `container cp` (não há nenhuma API de
cópia entre as 62 do header), `image build`, `image save`, `container export` e as opções de
recorte do `container logs` (no SDK o log chega inteiro por callback). Já `container stop -s/-t` e
o `-w`/`-e` do exec valem nos dois: o SDK recebe sinal, espera, diretório de trabalho e
variáveis.

### O `--format json` da CLI muda de forma entre versões

A CLI é instalada pelo Windows Update, não por nós — o app não escolhe qual versão vai encontrar, e
o formato do `--format json` **já mudou uma vez**:

| CLI   | Saída de `network list --format json`                   |
| ----- | ------------------------------------------------------- |
| 2.9.4 | um array JSON, com o campo `Id`                         |
| 2.9.9 | **NDJSON** — um objeto por linha, sem array, campo `ID` |

Um `JSON.parse` da saída inteira morre na segunda linha
(`Unexpected non-whitespace character after JSON at position N`), e foi exatamente assim que a view
Redes quebrou. Por isso nenhum ponto do código chama `JSON.parse` na saída da CLI direto: tudo passa
por `parseJsonLines` (`services/wslc/json-lines.ts`), que aceita as duas formas, e por `jsonList`,
que devolve `null` quando a CLI recusa a opção — sinal para cair no parser de tabela.

A lição vale para os testes: os fixtures de `real.test.ts` são **capturas literais** da saída da
2.9.9, não JSON escrito à mão. O teste antigo de redes usava um array inventado, que aquela versão
nunca devolveu — por isso a mudança passou batida até aparecer na tela de quem usa.

Outras diferenças medidas na 2.9.9: `stats --no-stream` **deixou de existir** (era o nosso fallback,
e passá-lo hoje é erro de uso); `container list` ganhou `StateChangedAt` (é dele que sai o
“Encerrado há 6 horas”); `stats` ganhou `PIDs`; `image list`, `volume list` e `version` ganharam
`--format json`; e `volume create` ganhou `-d/-o/-l`, com o driver `vhd` aceitando as mesmas opções
do SDK nativo.

### Quando a wslc muda, ela muda para ficar igual ao docker

As duas releases entre a 2.9.4 e a 2.9.9 são, quase inteiras, PRs de **paridade com o docker**: o
[#41160](https://github.com/microsoft/WSL/pull/41160) alinhou o parser de argumentos (é de onde saiu
o sumiço do `--force` nos prunes), o [#41070](https://github.com/microsoft/WSL/pull/41070) deu ao
`network connect` os cinco flags do docker, o [#40835](https://github.com/microsoft/WSL/pull/40835)
trouxe o `container cp` inteiro e o [#41133](https://github.com/microsoft/WSL/pull/41133) trocou o
build por `docker buildx build`. Na dúvida sobre um formato ou uma flag, **o comportamento do docker
é o melhor palpite** — e vale conferir a release note (`gh release view <versão> --repo
microsoft/WSL`) antes de medir na mão.

Onde a wslc **não** é igual ao docker, e a diferença custa caro: o `-n` do `container logs` (o
docker usa `--tail`), o `-t` do `container stop` (que ali é `--time`), o `-f` de `volume rm` e
`network rm` (que é idempotência, "não erre se não existir", e **não** remoção forçada) e o `-f` do
`network prune` (que é `--filter`).

## Motor nativo (wslcsdk via FFI)

Além da CLI, o app carrega a **API C nativa** (`wslcsdk.dll`, do NuGet `Microsoft.WSL.Containers`)
via **koffi**: toda a superfície do header está vinculada em
`src/main/services/wslc/native/bindings.ts`, e a view Sistema mostra o status do SDK.

### A DLL vem junto — e são duas

O app **empacota** o SDK (`vendor/wslcsdk/`, licença MIT da Microsoft) e escolhe qual usar em tempo
de execução, porque a versão do SDK precisa **casar** com a do WSL instalado. Isso foi medido nesta
máquina, nas duas direções:

|           | WSL 2.9.4                                        | WSL 2.9.9                                         |
| --------- | ------------------------------------------------ | ------------------------------------------------- |
| SDK 2.9.3 | funciona                                         | `WSLC_E_SDK_UPDATE_NEEDED` já no `WslcGetVersion` |
| SDK 2.9.9 | **segfault** em `WslcGetSessionTerminationEvent` | funciona                                          |

SDK novo demais é o caso perigoso: **nada no header denuncia** — a declaração da função que quebra é
byte a byte idêntica nas duas versões, e os 18 structs também. Não há binding que se defenda; o
processo simplesmente morre. Daí a regra em `native/bundled.ts`: usar a DLL mais nova que **não
passe** da versão do WSL. Quem quiser outra escolhe o arquivo na aba **Sistema** — o app sonda a DLL
(carrega, lê, descarrega) antes de aceitar, e a troca vale ao reabrir, porque a sessão viva segura
handles da atual.

A 2.9.9 também mudou **duas assinaturas** sem mudar nada visível (`WslcSessionAuthenticate` ganhou
`tokenType`; `WslcInstallWithDependencies` ganhou `components` e `options`), o que corromperia login
em registry e instalação guiada em silêncio. O `bindings.ts` detecta a ABI pela presença do símbolo
`WslcOpenContainer` e adapta as chamadas.

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
│           ├── real.ts          # Implementação real (wslc.exe; listas via --format json)
│           ├── json-lines.ts    # Parser do --format json (NDJSON da 2.9.9 ou array da 2.9.4)
│           ├── mock.ts          # Modo demonstração (WSLC_UI_MOCK=1; =setup simula sem ambiente)
│           ├── ops.ts           # Fronteiras injetáveis: motor nativo, streams e efeitos externos
│           ├── real-ops.ts      # Fiação das fronteiras no mundo real (FFI, spawn, shell, diálogos)
│           ├── mock-ops.ts      # Dublê das fronteiras (sessão nativa fictícia, streams simulados)
│           ├── mock-state.ts    # Ajustes do modo demo: injeção de falha, diálogos, cadência
│           ├── cli.ts           # execFile sem shell + decodificação UTF-16LE/UTF-8
│           ├── table.ts         # Parser de tabelas estilo docker (fallback p/ CLIs antigas)
│           ├── args.ts          # pushOpt/pushEach: flag só entra com valor não vazio
│           ├── run-args.ts      # Argumentos de `wslc run` / `container create` (todos os flags)
│           ├── stream-args.ts   # Argumentos de `image build` e `container logs` (montados no IPC)
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

O app fala com o mundo por cinco portas, e **todas são injetáveis**: o serviço da CLI
(`WslcService`), o motor nativo, os streams de longa duração, os efeitos externos (diálogos do
Electron, shell do Windows, busca no Docker Hub) e o auto-updater. Em produção elas são a
implementação real; sob `WSLC_UI_MOCK` viram dublês. É o que permite exercitar o app inteiro — inclusive o motor nativo —
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
npm run check          # typecheck + lint + format:check + test + patchnotes
npm run patchnotes     # valida o patchnotes.json (--notas gera as notas da release)
npm run dist           # instalador NSIS + portátil em dist/ (electron-builder)
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

Três projetos Vitest (`vitest.config.ts`):

- **main** (ambiente node): parser de tabelas, versões, decodificação, argumentos de run, mock service, streams (processos reais), router IPC (validação Zod nas duas direções) e schemas/contrato.
- **ferramentas** (node): o validador e o gerador de notas do `patchnotes.json` (`scripts/`).
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

| Arquivo                   | Cobre                                                                                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shell.spec.ts`           | Navegação, recolher o menu, botões da janela, painel de logs (filtro, limpar, ao vivo)                                                                                                 |
| `setup.spec.ts`           | Portão de ambiente incompleto, instalação guiada (conclui, falha e sem SDK)                                                                                                            |
| `containers.spec.ts`      | Ciclo de vida nos dois motores, run com portas, `container create`, cópia de arquivos, logs com recorte, detalhes/exec, prune, e as diferenças reais (stats, export, terminal externo) |
| `images.spec.ts`          | Pull/push com progresso, tarballs, tags, registry, catálogo e Docker Hub, build (simples e avançado), remoção forçada; ausências do motor nativo                                       |
| `volumes.spec.ts`         | Volumes nos dois motores, VHDX com tamanho/tipo/dono, labels na CLI e a validação do formulário                                                                                        |
| `networks.spec.ts`        | Redes, faixa de IPs, conectar com alias/IP, desconectar, prune confirmado e o aviso do motor nativo                                                                                    |
| `system.spec.ts`          | Ambiente, sessões, troca de motor (ida e volta, persistida) e tuning da sessão nativa                                                                                                  |
| `terminal.spec.ts`        | Terminal embutido nos dois motores (eco de linha, sem TTY)                                                                                                                             |
| `eventos-nativos.spec.ts` | Crash dump com o caminho do `.dmp` e o fim inesperado da sessão                                                                                                                        |

Cada área tem um bloco de **caminhos tristes** alimentado por `WSLC_UI_MOCK_FAIL`: listagem que
falha vira alerta na view, ação que falha vira toast com o motivo, e o diálogo que falhou continua
aberto. Os seletores saem de papel + nome acessível (o que um leitor de tela enxerga) e, nos
overlays do HeroUI, do `data-slot` — nunca de classe de Tailwind.

## Fluxo de trabalho e releases

Duas branches, e uma regra que o CI cobra:

- **`dev`** — integração. **Toda PR entra aqui.**
- **`main`** — o que está liberado. Só recebe o merge da `dev`, e é esse merge que dispara o release.

Uma PR aberta contra a `main` a partir de qualquer coisa que não seja a `dev` falha no job _Alvo da
PR_. A intenção é que a `main` só ande junto com uma tag.

Quem vai mexer no código: o [CONTRIBUTING.md](CONTRIBUTING.md) tem ambiente, convenções e o que
rodar antes de abrir a PR. O projeto adota o [Código de Conduta](CODE_OF_CONDUCT.md), e falha de
segurança segue o [SECURITY.md](SECURITY.md) — nunca por issue pública.

### O que o GitHub cobra (rulesets)

O fluxo acima não é convenção: está aplicado no repositório, em três rulesets.

| Ruleset                                 | Alvo              | Cobra                                                                                                                                                                                                                         |
| --------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main: entra pela dev, com CI verde`    | `refs/heads/main` | PR obrigatória (nada de push direto), _Alvo da PR_ + _Verificações_ + _E2E_ verdes, conversas resolvidas, review desfeito a cada push novo, merge **só por merge commit** — é o que faz a `main` guardar o histórico da `dev` |
| `dev: sem force-push, CI verde nas PRs` | `refs/heads/dev`  | _Verificações_ e _E2E_ verdes para entrar por PR. Push direto continua liberado, para iterar                                                                                                                                  |
| `tags de versão: imutáveis`             | `refs/tags/v*`    | Tag de release não se move e não se apaga: o que foi publicado fica publicado                                                                                                                                                 |

As duas branches também estão protegidas contra force-push e contra remoção. Nenhum ruleset tem
exceção de bypass, nem para o dono do repositório — a `main` anda por PR e ponto. E nenhum deles
atrapalha o release: o workflow **cria** a tag, e criar não é mover nem apagar.

Não há aprovação obrigatória (`0` reviews), senão um mantenedor solo não conseguiria fechar a própria
PR; o que segura de verdade é o CI verde. Branch de trabalho é apagada automaticamente no merge — a
`dev` sobrevive porque o ruleset dela proíbe remoção.

### CI (`.github/workflows/ci.yml`)

Roda em toda PR (para `dev` e para `main`) e em todo push na `dev`, em `windows-latest` — o alvo é
Windows: os testes lidam com caminhos do Windows e o E2E sobe o Electron de verdade.

| Job              | O que faz                                                                          |
| ---------------- | ---------------------------------------------------------------------------------- |
| **Alvo da PR**   | Cobra a regra das branches (só em PR)                                              |
| **Verificações** | `typecheck`, `lint`, `format:check`, `npm test` e a validação do `patchnotes.json` |
| **E2E**          | `npm run build` + Playwright contra o app Electron; o relatório sobe como artefato |

Os testes de integração FFI se auto-desligam no CI (`describe.skipIf(locateWslcSdk() === null)`): a
`wslcsdk.dll` não é versionada e nenhum runner tem WSL. Sobra o que faz sentido validar fora da
máquina de desenvolvimento — e o E2E cobre os **dois motores** de qualquer forma, porque o modo de
demonstração dubla o SDK.

### `patchnotes.json`

As notas de cada versão são escritas à mão, em português, no `patchnotes.json` — o release não lê
mensagens de commit. A lista vai da versão **mais nova para a mais antiga**:

```json
{
  "versoes": [
    {
      "versao": "0.2.0",
      "data": "2026-09-15",
      "titulo": "Uma linha de resumo (opcional).",
      "mudancas": {
        "adicionado": ["..."],
        "alterado": ["..."],
        "corrigido": ["..."],
        "removido": ["..."],
        "seguranca": ["..."]
      }
    }
  ]
}
```

```powershell
npm run patchnotes                            # valida o arquivo e confere a versão do package.json
npm run patchnotes -- --notas                 # o markdown que vira o corpo da release
npm run patchnotes -- --notas --versao 0.1.0
```

A validação é rígida de propósito (semver, ordem, datas reais, categorias conhecidas, itens de uma
linha), porque um erro aqui só apareceria na hora de publicar. Ela está no `npm run check` e no CI,
então uma versão sem notas não passa da PR.

### Release (`.github/workflows/release.yml`)

Publicar uma versão é **subir o `version` do `package.json` e escrever as notas dela no
`patchnotes.json`, na mesma PR**. O merge da `dev` na `main` faz o resto:

1. valida as notas e lê a versão do `package.json`;
2. se a tag `v<versao>` já existe, o run **não faz nada** — um push na `main` que não bumpou a versão
   (um ajuste de README, por exemplo) não republica nem sobrescreve release alguma;
3. roda o CI inteiro no estado da `main` que vai virar tag;
4. cria a tag anotada `v<versao>` e publica a release com o corpo gerado do `patchnotes.json`.

Entre o passo 3 e o 4 o workflow **empacota** (instalador NSIS e portátil) e roda um teste de fumaça
que abre o `.exe` de verdade — asar, koffi desempacotado e DLL em `resources/` são três coisas que só
existem no app empacotado e que o E2E, rodando contra `out/`, nunca tocaria. Empacotar antes de criar
a tag é de propósito: uma config quebrada não pode deixar uma tag publicada sem binário.

Os dois `.exe` sobem como assets da release. **Não são assinados**: o SmartScreen vai avisar "editor
desconhecido" e exigir _Mais informações → Executar assim mesmo_.

Versão com sufixo (`0.2.0-rc.1`) sai marcada como pré-lançamento.

### Atualização automática

Da 0.3.0 em diante o app se atualiza sozinho a partir das releases deste repositório
(`electron-updater` com o provedor GitHub). Quem estiver na 0.2.0 precisa instalar a 0.3.0 à mão —
a primeira versão que recebe atualização é a primeira que já traz o updater dentro.

O que o app faz depende de como ele foi instalado:

| Situação                | O que acontece                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Instalado pelo setup    | Checa ao abrir e a cada 6 h, baixa em segundo plano e **aplica quando o app fecha**. Dá para aplicar na hora pela aba Sistema. |
| Portátil                | Checa, avisa e leva para a release. Trocar o `.exe` é de quem usa — que é o ponto de ser portátil.                             |
| Rodando do código-fonte | Desligado: não há instalação para atualizar por cima.                                                                          |

Só versões estáveis contam. Um `0.4.0-rc.1` continua publicado no GitHub, mas o updater o ignora.

O que faz isso funcionar é o **`latest.yml`** que o `electron-builder` gera e o workflow anexa à
release: é o índice que o app consulta. Sem ele, a release fica completa para quem baixa à mão e
invisível para quem já tem o app instalado — falha silenciosa que só apareceria uma versão depois.
Por isso o job de empacotamento **falha** se o arquivo não existir, e o teste de fumaça confere que o
`app-update.yml` foi embutido no pacote.

Instalar pela aba Sistema não é um `quitAndInstall` seco: o app encerra a sessão nativa **antes** de
entregar o processo ao instalador. O NSIS fecha quem demora, e um processo morto assim deixa a sessão
"WslcUi" órfã no WSL.

O ciclo inteiro é exercitável sem release nenhuma: `WSLC_UI_MOCK_UPDATE=portable|disabled` escolhe o
modo e `WSLC_UI_MOCK_FAIL=updates:check,updates:download` reproduz os dois caminhos tristes.

## Licença

Código deste repositório: **MIT** — ver [LICENSE](LICENSE).

### Componentes de terceiros

- **`Microsoft.WSL.Containers`** (`wslcsdk.dll`) — SDK da Microsoft, em preview, sob licença **MIT**
  (© Microsoft Corporation). É **redistribuído aqui**, no repositório e dentro do instalador, com
  `LICENSE.txt` e `NOTICE.txt` do próprio pacote — ver
  [`vendor/wslcsdk/README.md`](vendor/wslcsdk/README.md).
- **`wslc.exe`** — parte do WSL, distribuída pela Microsoft. Este projeto apenas o consome; não o
  inclui nem o modifica.
- Dependências npm — cada uma sob a sua própria licença (ver `package-lock.json`).

Projeto **não oficial** e sem vínculo com a Microsoft.
