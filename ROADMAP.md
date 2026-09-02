# Roadmap — motor nativo (wslcsdk.dll via FFI)

Análise da API C completa (`vendor/wslcsdk/include/wslcsdk.h`, SDK 2.9.4) e plano para
implementá-la de ponta a ponta no app, substituindo gradualmente o wrapper da CLI.

## O que a API nativa oferece (e a CLI não)

| Capacidade                                                                       | API | CLI                   |
| -------------------------------------------------------------------------------- | --- | --------------------- |
| Sessão própria com limites (`CpuCount`, `MemoryMB`, `Timeout`, GPU por sessão)   | ✅  | ❌ (sessão implícita) |
| stdout/stderr por **callback** e stdin por handle (terminal embutido de verdade) | ✅  | parcial (pipes)       |
| Progresso de pull/push **estruturado** (bytes, camada, status)                   | ✅  | ❌ (texto)            |
| Eventos: exit de processo, término de sessão, **crash dumps**                    | ✅  | ❌                    |
| Estado do container tipado (`WslcGetContainerState`)                             | ✅  | parse de texto        |
| Volumes VHD nomeados (tamanho fixo/dinâmico, dono uid/gid)                       | ✅  | parcial               |
| Auth de registry com token (`WslcSessionAuthenticate`)                           | ✅  | `login`               |
| Instalação de dependências com progresso (`WslcInstallWithDependencies`)         | ✅  | ❌                    |

## Fundação (feita ✅)

- `vendor/wslcsdk/` — DLL x64 + header oficiais (NuGet `Microsoft.WSL.Containers`).
- `native/bindings.ts` — **toda** a superfície do header vinculada via koffi
  (sessão, container, processo, imagens, storage, auth, install, callbacks).
- `native/locate.ts` + `native/status.ts` — descoberta da DLL e sonda de
  versão/componentes, exibida em Sistema.
- Probe validado nesta máquina: `CoInitializeEx` → `WslcCreateSession` →
  `WslcTerminateSession` → S_OK (sessão real criada via FFI em ~1,7s).

### Regras de marshalling/threading (aprendidas por probe — NÃO violar)

1. **COM**: `CoInitializeEx(NULL, MTA)` antes de qualquer chamada.
2. **Structs opacas** (`Wslc*Settings`) guardam ponteiros internos: alocar com
   `koffi.alloc` e passar o MESMO ponteiro em todas as chamadas — recodificar ⇒ segfault.
3. **Strings e arrays**: as funções `Init*/Set*` guardam o PONTEIRO — Buffers
   (utf16le p/ `PCWSTR`, utf8 p/ `PCSTR`), arrays `PCSTR const*` (argv/env) e
   arrays de structs (ports/volumes) precisam viver até o `Create*` (classe
   `Keep`). Senão: `WSLC_E_INVALID_SESSION_NAME`/lixo.
4. Nome de sessão: alfanumérico (evitar hífens).
5. `errorMessage`/`inspectData` são `CoTaskMemAlloc` — decodificados pelo koffi;
   liberar com `CoTaskMemFree` quando formos ler o ponteiro cru.
6. **TODA chamada ao SDK via `.async` do koffi** (nunca síncrona):
   a) no Electron o main thread é **STA** — objetos criados nos workers MTA dão
   `RPC_E_WRONG_THREAD` (0x8001010E) em chamada síncrona; b) chamada síncrona
   com callback pendente na fila do koffi = **deadlock** (o SDK espera o
   callback, o callback espera o event loop, o loop está preso na chamada).
7. **Port mappings exigem `NetworkingMode = BRIDGED`** explícito (default ⇒
   `E_INVALIDARG` no CreateContainer) e **só TCP** (UDP ⇒ `E_NOTIMPL`).
8. **Init process com callbacks de IO exige start com `START_FLAG_ATTACH`**
   (sem o flag: `E_INVALIDARG`). Callbacks funcionam de threads estrangeiras
   (koffi enfileira pro loop); chunks de 0 bytes são flush/EOF — ignorar.
9. **Sessão é single-process**: `WslcCreateSession` com nome já aberto em OUTRO
   processo ⇒ `ERROR_ALREADY_EXISTS` (0x800700B7). O app usa
   `requestSingleInstanceLock`.
10. **Não há enumeração nem "abrir container por ID"**: registro em memória é a
    única gerência; registros de containers **sobrevivem ao Terminate** (ficam
    no storage) — órfão só some apagando o storage (reset). Por isso o app
    deleta seus containers ao fechar.
11. **Zod v4 no preload precisa de `z.config({ jitless: true })` ANTES de criar
    schemas** (`preload/zod-config.ts`): o JIT do zod sonda `new Function`
    quando a CSP ainda não vale, e explode `EvalError` no primeiro parse —
    derrubando TODOS os eventos main → renderer em silêncio.
12. **Não existe stdin nem PTY no SDK preview**:
    `WslcGetProcessIOHandle(STDIN)` devolve `E_INVALIDARG` até em processo
    VIVO; com callbacks registrados, STDOUT/STDERR viram
    `ERROR_INVALID_STATE` (callbacks consomem os handles, como o header
    avisa); no init process sem ATTACH os três dão `ERROR_NOT_SUPPORTED`.
    Um processo criado sem stdin nasce com EOF (`sh -i` sai na hora).
    Terminal interativo só via **bridge por FIFO** (ver Fase 3).
13. **A CLI 2.9.4 localiza os cabeçalhos** de `container list` (pt-BR:
    "ID DO CONTÊINER", "NOME"…) — parser por nome de coluna quebra. Usar
    `--format json` (containers e stats; `State` usa o MESMO enum numérico do
    SDK, `Protocol` é número IP 6/17). O antigo `stats --no-stream` deixou de
    existir (agora `stats` é snapshot por padrão).
14. **Progresso de imagem** (`WslcContainerImageProgressCallback`): o callback
    devolve HRESULT — retornar **E_ABORT cancela o pull** (a chamada retorna
    0x80004004 e a imagem parcial não fica); a 1ª mensagem usa a **TAG** como
    `id` ("latest") e a última vem com `id` vazio — nenhuma das duas é camada;
    camadas reais seguem pulling → downloading (bytes) → complete →
    extracting → complete. Pull de ref inexistente = 0x80040601 com
    `errorMessage` legível. **Import/load NÃO emitem progresso** (0 mensagens).
    O SDK não tem "save/export" de imagem — exportar é só pela CLI.
15. **Push e auth de registry**: `registryAuth` é OBRIGATÓRIO no push (NULL ⇒
    `E_INVALIDARG`) — é o blob **X-Registry-Auth** do Docker (base64 de JSON:
    `{username,password,serveraddress}` ou `{identitytoken}`; anônimo =
    base64 de `"{}"`). No push o `status` das mensagens vem SEMPRE 0 — o
    estágio é derivado dos bytes (0/0 → aguardando; bytes → enviando; 0/0
    depois → concluído; `current` pode passar de `total`); 1ª/última mensagem
    têm `id` vazio (sem a regra do TAG-as-id do pull) e **E_ABORT cancela o
    push também**. Só registries locais (`127.0.0.1:<portaWindows>`) aceitam
    HTTP — o resto exige HTTPS ("server gave HTTP response to HTTPS client");
    o IP do container/bridge NÃO funciona como alvo. `WslcSessionAuthenticate`
    devolve S_OK + token VAZIO ("") em registry sem auth e 0x80004005 com
    mensagem legível ("incorrect username or password") para credencial
    errada — perfeito para validar login. O token é CoTaskMemAlloc (ANSI).
16. **Volumes VHD**: `WslcCreateSessionVhdVolume` cria
    `<storage>\volumes\<nome>.vhdx` — o SDK NÃO enumera volumes; **listar =
    readdir desse diretório**. Owner uid/gid é honrado com
    `WSLC_VHD_REQ_FLAG_OWNER` (ls -ldn mostra o dono no container). Duplicata
    = 0x800700B7 SEM mensagem; delete de inexistente = 0x80040604 com
    mensagem já localizada ("Volume não encontrado: ..."). Anexar um volume
    nomeado INEXISTENTE a um container NÃO falha: vira volume "guest" dentro
    do storage.vhdx — persiste entre containers, não é enumerável, mas o
    `WslcDeleteSessionVhdVolume` o apaga (S_OK).
17. **Crash dumps, termination reason e install** (Fase 6, por probe):
    o callback de `WslcRegisterSessionCrashDumpCallback` dispara para qualquer
    processo NÃO-init de container morto por sinal de core dump — MESMO com
    `ulimit -c 0` (o core_pattern é o pipe `|/wsl-capture-crash %t %E %p %s`,
    que ignora RLIMIT_CORE); o init (PID 1) ignora sinais fatais entregues via
    kill (sai 0, sem dump). No info: `dumpPath` é caminho WINDOWS
    (`%LOCALAPPDATA%\temp\wslc-crashes\wsl-crash-<epoch>-<pid>-<proc>-<sinal>.dmp`,
    arquivo real ~240KB; a pasta também recebe `saved-state-*.vmrs` do WSL),
    `processName` vem com "/" trocado por "!" ("!bin!busybox"), `pid` é do
    namespace do container e `timestamp` é epoch em SEGUNDOS; SIGABRT também
    gera; o unsubscribe funciona (0 callbacks depois).
    `WslcGetSessionTerminationReason` em sessão VIVA = 0x8007139F
    (ERROR_INVALID_STATE); após Terminate próprio = S_OK + SHUTDOWN(1).
    **`wsl --shutdown` NÃO derruba a sessão wslc** (a VM dela é separada das
    distros — o MESMO handle continua listando imagens e rodando containers;
    o termination event não sinaliza) — término externo real é crash/reboot.
    `WslcInstallWithDependencies` em máquina completa é no-op idempotente
    (S_OK em ~2ms, zero callbacks; `WslcGetMissingComponents` = 0) — só emite
    callback para componente efetivamente instalado.
18. **Cobertura 100% — tuning, extras de container e cantos da CLI** (Fase 7,
    por probe): **tuning de sessão FUNCIONA e vale a cada create pós-terminate**
    — `SetSessionSettingsCpuCount(1)` ⇒ `nproc` 1; `Memory(512)` ⇒ `free` ~395MB
    (overhead do WSL); `Vhd(4096MB)` ⇒ `df /` ~3952MB; `FeatureFlags(ENABLE_GPU
0x4)` + flag GPU do container ⇒ `/dev/dxg` presente. Recriar a MESMA sessão
    (nome+storage) após Terminate com valores novos APLICA os novos valores.
    **`SetSessionSettingsTimeout` NÃO é idle-timeout** (sessão ociosa com 8s não
    terminou em 30s) e **timeout=1ms TRAVA `WslcCreateSession` para sempre** —
    deliberadamente NÃO exposto na UI. **`WSLC_CONTAINER_FLAG_PRIVILEGED` (0x4)
    é aceito (S_OK) mas SEM efeito observável** no preview (CapEff idêntico,
    mount continua negado) — não exposto. Hostname/DomainName do container e
    WorkingDirectory do processo (init E exec) funcionam. **Kill nativo** =
    `WslcStopContainer(sinal, timeout=0)` (o enum só tem HUP/INT/QUIT/KILL/TERM).
    CLI (medido na 2.9.4; ver regra 19 para o que a 2.9.9 mudou):
    **`network prune` NÃO aceita `--force`** (o `-f` dele é `--filter`!) e
    apaga SEM confirmação; `network connect` não tem `--alias` (só o run tem
    `--network-alias`); `network inspect` NÃO lista os containers conectados
    (o vínculo aparece no `container inspect`); remover rede com endpoints
    ativos = ERROR_SHARING_VIOLATION. **`container export` recusa container EM
    EXECUÇÃO** (só parado; diferente do docker). `system session list` tem
    cabeçalhos LOCALIZADOS e sem `--format json` (parsear pelas colunas
    numéricas); `session run/shell` fora de um `session enter` =
    ERROR_INVALID_HANDLE, e `enter <storage>` exige storage de sessão JÁ
    existente — trio interativo de terminal, sem mapeamento de UI seguro
    (entrar no storage do app violaria a regra 9). `logout` sem login prévio =
    erro "Não conectado" (ok=false). **Matar à força o processo que segura a
    sessão pode PERDER os registros de imagem do storage** e deixá-lo instável
    (crash no pull seguinte) — reset do storage resolve.

19. **A CLI muda de contrato entre versões — reauditar a cada salto** (02/09/2026,
    2.9.4 → 2.9.9, tudo medido nesta máquina). **O `--format json` virou NDJSON**
    (um objeto por linha, sem array em volta) e `network list` renomeou `Id` para
    `ID` — `JSON.parse` da saída inteira morre em "Unexpected non-whitespace
    character after JSON", que foi como a view Redes quebrou. Por isso tudo passa
    por `parseJsonLines`, que aceita as duas formas. **NENHUM dos quatro `prune`
    aceita `--force`** (não é só o de redes): passá-lo é erro de uso e a limpeza
    nem roda — e `image`/`volume prune` precisam de `--all`, senão limpam só as
    pendentes / os anônimos. **`stats --no-stream` deixou de existir** (era o
    nosso fallback, então `stats` vinha sempre vazio, sem erro). Ganharam
    `--format json`: `image list`, `volume list` e `version`; `container list`
    ganhou `StateChangedAt` e `stats` ganhou `PIDs`. **`volume create` ganhou
    `-d/-o/-l`**, e o driver `vhd` aceita as MESMAS opções do SDK (`SizeBytes`
    obrigatório, `Fixed`, `Uid`+`Gid` só em par) — o disco virtual deixou de ser
    exclusivo do motor nativo. Três afirmações da regra 18 CAÍRAM: `network
connect` agora tem `--network-alias`, `--ip`, `--link`, `--link-local-ip` e
    `--driver-opt`; `network inspect` AGORA lista os containers conectados (mapa
    `Containers` com nome, IPv4 e MAC); e existe uma opção **global `--session
<nome>`** que alcança a sessão viva do app (`wslc --session WslcUi volume
list` devolveu os VHDX que a UI criou) — a CLI não está mais isolada do
    storage nativo. Continuam valendo: `container export` recusa container em
    execução (WSLC_E_CONTAINER_IS_RUNNING, e deixa um .tar de 0 byte para trás) e
    `system session list` segue sem `--format json`, com cabeçalhos localizados.
    Lição de teste: fixture de CLI é CAPTURA LITERAL, nunca JSON escrito à mão —
    o teste de redes passava contra um formato que a CLI nunca devolveu.

20. **Existe changelog oficial — ler ANTES de auditar na mão** (02/09/2026).
    Entre a 2.9.4 e a 2.9.9 saíram só duas releases, e as notas delas explicam
    tudo o que medimos: [2.9.8](https://github.com/microsoft/WSL/releases/tag/2.9.8)
    e [2.9.9](https://github.com/microsoft/WSL/releases/tag/2.9.9). O NDJSON e o
    keyset novo vieram de PRs de PARIDADE COM O DOCKER — #41377 (network
    list/inspect/prune), #41413 (volume list) e, principalmente, **#41160
    "Align WSLC argument parser with Docker flag and value semantics"**, que é
    de onde saiu o sumiço do `--force` nos prune. A regra prática: **quando a
    wslc muda, ela muda PARA FICAR IGUAL AO DOCKER** — na dúvida sobre um
    formato ou uma flag, o comportamento do docker é o melhor palpite.
    A 2.9.8 também trouxe `wslc container cp` (**comando inteiro que a auditoria
    da regra 18 não tinha**, porque foi feita contra uma lista nossa e não
    contra a árvore de `--help` da CLI — enumerar recursivamente, sempre), o
    idle-terminate das VMs de sessão por usuário (#41077) e, com ele, o erro
    novo **WSLC_E_VM_NOT_RUNNING (0x80040610)**. Há **referência oficial da API
    C** em `doc/docs/api-reference/c/` do microsoft/WSL: dela saiu a tabela de
    HRESULTs que o app agora traduz (`hrText` em `native/bindings.ts`) e a
    página **"Not Yet Implemented APIs"** — que, conferida contra a 2.9.9, está
    **meio desatualizada**, e por isso doc oficial também se mede: ela lista
    `WSLC_VHD_TYPE_FIXED` e UDP em `WslcSetContainerSettingsPortMappings` como
    E_NOTIMPL, mas **o VHD FIXO funciona** (`WslcCreateSessionVhdVolume` com
    fixed=true devolveu S_OK e um .vhdx de 71 MB pré-alocado contra 37 MB do
    dinâmico; pela CLI, `-o Fixed=true` deu 109 MB contra 37 MB), enquanto
    **UDP continua E_NOTIMPL de verdade** (0x80004001, medido chamando o
    setter direto). Ou seja: a UI está certa ao oferecer "Fixo" e certa ao
    recusar UDP com mensagem própria. O caso do fixo nunca tinha sido
    exercitado no motor nativo — os testes só usavam `fixed: false` —, e agora
    tem teste em `native/volumes.test.ts`.

21. **A wslc copia o docker, mas os nomes curtos NÃO batem** (02/09/2026, ao
    fechar a cobertura da 2.9.9 — cada um destes foi lido no `--help` do próprio
    comando, não presumido do docker). `container logs` usa **`-n`**, não
    `--tail`. `container stop` usa **`-t/--time`**, não `--timeout` (o
    `--stop-timeout` do run é outro parâmetro, do container). `image build` usa
    `-o` para **`--output`** (a spec do `docker buildx`), enquanto em `volume
create` e `network create` o `-o` é **`--opt`**. E o mais perigoso: o **`-f`
    de `volume rm` e `network rm` é "não gere erro se não existir"** —
    idempotência, NÃO remoção forçada. Só `container rm` e `image rm` têm `-f`
    de força de verdade. Confundir os dois faria a UI prometer o que a CLI não
    faz; por isso o app usa o `-f` de volume/rede só na remoção em massa, onde
    a lista pode ter envelhecido entre ler e remover.

    O **`container cp` não é simétrico**, e não é igual ao docker (medido na
    2.9.9 contra o `loja-web`): **entrando**, o destino tem que ser uma PASTA
    que já existe — um caminho de arquivo dá `Could not find the file … in
container` (ERROR_PATH_NOT_FOUND) se não existir, e `extraction point is not
a directory` (E_FAIL) se existir, ou seja, a CLI **não renomeia**;
    **saindo**, o destino pode ser um arquivo novo, que ela cria. Copiar pasta
    inteira funciona nos dois sentidos, e o `-a` é aceito. O diálogo diz "Pasta
    de destino" só do lado que entra, porque é onde a regra morde.

    Onde a força existe, ela **não virou item de menu**: a ação normal continua
    lá, e quando a CLI recusa por "em execução" / "em uso", o botão _Remover
    mesmo assim_ aparece no próprio aviso da falha — quem clica já leu o
    motivo. O dublê de `mock.ts` segue as mesmas duas regras, senão esse
    caminho só existiria contra a máquina de verdade.

    Sem `--tail` o `container logs` despeja o log **inteiro** desde o primeiro
    byte: o botão da lista pede uma cauda (500 linhas) e o título do painel diz
    qual recorte está vendo, porque a diferença entre "o log todo" e "as últimas
    500" não aparece em lugar nenhum na tela. No motor nativo não há recorte
    nenhum — o SDK entrega o log por callback —, então lá o título não promete.

    O que é **só da CLI** some da tela no motor nativo em vez de falhar depois
    de clicado: `container cp` (não existe API de cópia entre as 62 do header),
    `image build`, `image save`, `container export` e as opções do `logs`. Já
    `container stop -s/-t` e o `-w`/`-e` do `exec` valem nos DOIS: o
    `WslcStopContainer` recebe sinal e espera, e o process settings tem
    `WorkingDirectory` e `EnvVariables`. O `-u` do exec não tem equivalente.

22. **Componente do HeroUI tem contrato de ESTRUTURA, não só de props**
    (02/09/2026, adotando abas e campos novos). A variante `secondary` das
    abas é escrita em `.tabs--secondary > .tabs__list-container`: **filho
    direto**. Aninhar o `Tabs.ListContainer` dentro do `<PageHeader>` fazia o
    `variant="secondary"` não pegar em nada — a classe estava no lugar certo, e
    ainda assim saía a variante primária (pílula + trilho pintado), sem nenhum
    erro. Por isso `PageHeader` ganhou `flush` (fecha sem borda) em vez de um
    slot de abas: a faixa fica FORA dele, irmã do cabeçalho. Vale também para
    a composição interna: `NumberField.Group` espera
    `Decrement → Input → Increment`, e com o campo primeiro o input colapsa e
    o `+` vai para a outra ponta da linha. Quando um componente do HeroUI sai
    errado sem erro no console, conferir a ÁRVORE antes das props — e ler o CSS
    da variante em `node_modules/@heroui/styles/dist/components/`.

23. **`step` do `NumberField` arredonda o valor confirmado** (02/09/2026,
    medido: o campo de cauda dos logs gravava 1 em vez de 20). O passo do React
    Aria não é só das setas — ele **snappa** o número no commit para o múltiplo
    mais próximo a partir do `minValue`. Com `step={100}` e `minValue={1}`,
    digitar 20 grava 1; com `step={512}`, digitar 2048 grava 2049. Nos campos
    em MB o passo cômodo de clicar não vale alterar o que a pessoa escreveu:
    **nenhum campo do app passa `step`**. Dois vizinhos do mesmo componente:
    `formatOptions={{ useGrouping: false }}` é obrigatório (em pt-BR o
    formatador escreve 2048 como "2.048", que num campo técnico lê como dois e
    pouco), e vazio é `NaN` no React Aria — a conversão para `undefined` mora
    no `NumberInput`, para nenhuma tela precisar saber.

24. **Atributo JSX não processa escape: `\\` são DUAS barras na tela**
    (02/09/2026, visto num screenshot). `placeholder="C:\\Users\\eu"` não é uma
    string de JavaScript — é texto de atributo, e o app mostrava
    `C:\\Users\\eu`. Cinco placeholders e dicas de caminho do Windows estavam
    assim. Barra simples em atributo; a duplicação só é necessária dentro de
    `{'...'}`. E o corolário de teste: **`fill` do Playwright não serve para
    `NumberField`** — ele grava o `value` do DOM direto, o React Aria continua
    com o texto antigo em estado próprio e, no Enter, cai no `minValue`. Campo
    numérico se preenche digitando (`pressSequentially`), e campo de lista
    (`TagsInput`) só confirma com Enter: por isso `fixtures/ui.ts` tem
    `fillNumber`, `fillTags` e `clearField` em vez de só `fillField`.

25. **`view-transition-name` repetido DESCARTA a transição inteira, calado**
    (02/09/2026, ao levar as abas para o design system). Dois elementos vivos
    com o mesmo nome e o Chrome pula a transição toda — sem erro na tela, sem
    erro no console; o sintoma é só "parou de animar". O caso real do app: um
    diálogo com abas (run, build) abre EM CIMA de uma view com abas (Imagens), e
    os dois painéis coexistem. Por isso o nome do painel é único por instância
    (`viewTransitionName(useId())`, saneado — `«r0»` não é custom-ident válido) e
    quem carrega a animação é `view-transition-class`, não o nome. O jeito de
    testar isso sem olhar pixel: **transição descartada rejeita `ready`**, então
    `e2e/transicoes.spec.ts` afirma o veredito da promessa.

26. **`animation: none` num `::view-transition-group` mata o morph automático**
    (02/09/2026). Para mexer só no tempo, mexer só em `animation-duration` e
    `animation-timing-function` — zerar o `animation` inteiro tira a
    interpolação de caixa que o UA faz sozinho (é ela que acomoda o cabeçalho
    entre uma view com descrição e uma sem). E em `::view-transition-old`,
    `animation: none` NÃO esconde o snapshot antigo: sem animação ele fica em
    opacity 1 até a transição toda acabar, e o conteúdo velho reaparece pelos
    buracos do novo — quem não participa leva `animation: none` **com**
    `opacity: 0`. Corolário do tempo: saída mais curta que a entrada exige
    `animation-fill-mode: forwards`, ou no fim da saída o antigo volta a
    opacity 1 e pisca.

27. **View transition é para região que troca de CONTEÚDO; layout é transição de
    CSS** (02/09/2026, medido nos dois). Onde não existe elemento comum entre o
    antes e o depois — a página numa troca de tela, o painel numa troca de aba —
    só o snapshot resolve, porque não há como animar a saída de algo que o React
    já desmontou. Onde o elemento CONTINUA lá e só muda de tamanho ou de lugar —
    o rail recolhendo, o marcador do item ativo, um painel do rodapé crescendo —
    o snapshot é pior: ele congela um layout e o UA o estica
    (`inline-size: 100%; block-size: auto` é o padrão), então texto reflowado
    aparece dobrado e rótulo flutua sem o corte do container. Um vizinho da
    mesma família: o HeroUI **já usa** view transition na fila de toasts, sem
    tipo nenhum (`@heroui/styles/.../toast.css`), então toda a coreografia do app
    vive dentro de `:active-view-transition-type(...)` — o tipo é a fronteira
    entre as duas.

## Fases

1. **Sessão gerenciada** ✅ (concluída) — `native/session.ts`: singleton da
   sessão `WslcUi` (storage `%LOCALAPPDATA%/wslc-ui/native-session`), criada
   sob demanda com chamadas **assíncronas** (`fn.async` do koffi — MTA
   implícito nos worker threads, sem travar o event loop), termination event
   monitorado por poll (`WaitForSingleObject`) com evento
   `native:session-ended` → toast no renderer. `WslcListSessionImages` +
   `WslcDeleteSessionImage` alimentam a view de Imagens quando o motor é
   nativo (mapeamento puro em `native/images.ts`; array CoTaskMemAlloc
   liberado com `CoTaskMemFree`). Toggle "Motor: CLI / Nativo" em Sistema,
   persistido em `settings.json` (userData); falha ao criar a sessão faz
   fallback para a CLI com o motivo no toast. Ao fechar o app o handle é
   **liberado sem terminar** a sessão (reaproveitada pelo nome).
2. **Containers nativos** ✅ (concluída) — `native/containers.ts`: registro em
   memória de handles + `RunContainerOptions` → `WslcContainerSettings`
   completo (argv/env do init process, port mappings TCP com BRIDGED, bind
   mounts e named volumes, flags AUTO_REMOVE/GPU). Ciclo de vida inteiro:
   run (create+start ATTACH), list com estado real, start/stop(SIGTERM+10s)/
   restart/remove(FORCE), prune, **exec one-shot** (WslcCreateContainerProcess
   com callbacks), inspect JSON, **logs por callback** (ring buffer 512KB com
   stream ao vivo no painel). Parsing puro em `native/run-spec.ts`. Cleanup no
   fechamento do app (containers deletados — sem órfãos) e ação "Resetar
   sessão nativa" em Sistema (terminate + wipe do storage). No motor nativo,
   stats fica vazio (SDK não expõe) e o terminal externo é ocultado (Fase 3).
3. **Processos & terminal embutido** ✅ (concluída) — o plano original (stdin
   via `WslcGetProcessIOHandle`) foi REFUTADO por probe (regra 12: não há
   stdin nem PTY no preview). Solução entregue: **terminal embutido
   (xterm.js) nos DOIS motores**, em modo linha com disciplina local no
   renderer (`lib/terminal-input.ts`: eco, backspace, Ctrl+C/L, histórico ↑↓).
   Backends: CLI = `wslc exec -i <id> sh -i` com pipes
   (`terminal-cli.ts`); nativo = **bridge por FIFO** (`native/terminal.ts`):
   um processo persistente roda `mkfifo; exec 3<>fifo; exec sh -i <fifo`
   (saída via callbacks; o fd 3 impede EOF/bloqueio) e cada linha digitada é
   entregue por um exec curto `printf '%s\n' "$0" > fifo` — serializado por
   fila com exit callback. Shell REAL e persistente (cd/export mantêm
   estado); sem tty, apps full-screen não rodam. Registro comum em
   `terminals.ts`; canais `terminal:open/write/close` + eventos
   `terminal:data/exit`. Bônus da fase: **sistema de logs** do app
   (`services/logger.ts`: ring buffer 2000 + arquivo rotacionado em
   `userData/logs` + evento `logs:entry`) com painel retrátil no rodapé do
   AppShell (`components/logs-panel.tsx`) — filtros por nível/categoria/texto;
   instrumentado em CLI, streams, sessão/containers nativos, motor, terminal
   e erros de IPC. Foi ele que pegou a regra 13 em produção.
   Gotchas de UI: o Portal do Radix monta filhos num efeito próprio (useRef
   null no primeiro efeito — usar callback ref + state para o host do xterm)
   e o auto-focus do Sheet rouba o foco do terminal
   (`onOpenAutoFocus={preventDefault}`).
4. **Imagens com progresso real** ✅ (concluída) — `native/image-ops.ts`:
   **pull nativo com progresso estruturado por camada**
   (`WslcContainerImageProgressCallback` + acumulador puro em
   `native/progress.ts`, snapshots limitados a 1/120ms) exibido como barras
   no painel de stream (`streams:progress` no contrato); "Parar e fechar"
   cancela de verdade (callback devolve E_ABORT — regra 14). Tag nativa
   (`WslcTagSessionImage`), **load** de tarball OCI
   (`WslcLoadSessionImageFromFile`) e **import** de tarball rootfs
   (`WslcImportSessionImageFromFile`) roteados por motor; no motor CLI os
   mesmos fluxos usam `image load -i` / `image import` / `tag`. **Save**
   (`image save -o` + diálogo nativo de salvar) só existe na CLI — o SDK não
   expõe exportação; push/inspect/build/prune ficam ocultos no motor nativo
   (operariam na sessão errada). Diálogos de arquivo genéricos no contrato
   (`system:pick-file`/`system:pick-save`). Validação: testes FFI reais
   (pull+progresso+cancelamento, tag, import) e smoke 14/14 no app real.
5. **Registry & volumes VHD** ✅ (concluída) — **push nativo com progresso
   por camada** (`WslcPushSessionImage` via o mesmo esqueleto do pull em
   `native/image-ops.ts`; status derivado dos bytes — regra 15; "Parar e
   fechar" cancela com E_ABORT) e **login em registry**
   (`WslcSessionAuthenticate` + diálogo em Imagens): as credenciais ficam SÓ
   EM MEMÓRIA (`native/registry.ts`) e viram o blob X-Registry-Auth usado
   pelo push e pelo pull (pull anônimo continua NULL); no motor CLI o mesmo
   diálogo roda `wslc login --password-stdin` (senha fora da linha de
   comando). **Volumes VHD** (`native/volumes.ts`): criar com tamanho/tipo
   (dinâmico/fixo)/dono uid-gid no diálogo da view Volumes, listar por
   readdir de `<storage>\volumes` (regra 16 — só volumes VHD aparecem; a view
   avisa sobre os "guest") e remover com as mensagens localizadas do SDK;
   "remover sem uso" fica oculto no nativo (o SDK não rastreia uso).
   Validação: probe com registry:2 real rodando como container nativo
   (BRIDGED 15000→5000), testes FFI (login/push caminhos de erro, volumes
   create/list/delete) e smoke 16/16 com push real + catálogo conferido por
   HTTP.
6. **Resiliência** ✅ (concluída) — **crash dumps**: inscrição registrada
   junto com a criação da sessão (`session.ts`; mapeamento puro em
   `native/crash-dumps.ts` — "!"→"/", nome do sinal, timestamp em s) e
   liberada no terminate/release; callback → log warn + evento
   `native:crash-dump` → toast no AppShell com processo/pid/sinal, caminho do
   .dmp e ação **"Mostrar dump"** (`shell.showItemInFolder` via
   `system:show-item`). **Termination reason** validado (regra 17) — o
   watchTermination da Fase 1 já o lia; `wsl --shutdown` nem derruba a sessão.
   **Instalação guiada**: `native/install.ts` (`WslcInstallWithDependencies`
   com progresso por componente → evento `setup:install-progress`; só precisa
   da DLL vendorada, sem sessão) exposta no SetupView — botão "Instalar
   componentes automaticamente" com barra de progresso, aviso de reboot da
   VMP e alternativa manual preservada; erros orientam para
   `wsl --update --pre-release` (a instalação pode exigir admin — caminho não
   testável em máquina completa). `WSLC_UI_MOCK=setup` simula ambiente
   incompleto para desenvolver/testar o SetupView no app real. Validação:
   probe em 2 rodadas, testes FFI (crash real com .dmp conferido no disco;
   install idempotente sem callbacks) e smokes 16/16 + 6/6 com screenshots.
7. **Cobertura 100% (CLI + SDK)** ✅ (concluída, 01/09/2026) — fechamento de
   TODAS as lacunas apontadas pela auditoria (regra 18): **view Redes**
   (`features/networks/`: list `--format json`, criar com driver/subnet/
   gateway/internal/labels, inspecionar, conectar/desconectar container por
   diálogo, remover e prune — a UI confirma porque a CLI não; no motor nativo
   a view avisa que containers nativos usam só a bridge NAT), **RunDialog
   completo** (5 abas: rede+aliases+DNS+env-file+`-P`, tmpfs, recursos
   cpus/memory/shm/ulimits, healthcheck completo, entrypoint/workdir/user/
   labels/stop-signal/stop-timeout; hostname/domainname/workdir/entrypoint
   valem TAMBÉM no motor nativo via setters do SDK — campos só-CLI somem no
   nativo), **kill** (CLI `container kill -s`; nativo StopContainer timeout 0),
   **export do filesystem** (só container PARADO — a CLI recusa em execução;
   oculto no nativo), **logout de registry** (CLI `logout`; nativo descarta as
   credenciais em memória), **volume inspect** (CLI JSON; nativo = metadados
   do .vhdx), **sessões wslc** (tabela em Sistema via parser localizado em
   `sessions.ts`; enter/run/shell documentados como fluxo de terminal),
   **settings.yaml do wslc** (abrir no editor + reset com confirmação) e
   **tuning da sessão nativa** (CPU/memória/VHD/GPU persistidos em
   `settings.json` → `setNativeSessionTuning` → aplicados no create; "Salvar"
   com motor nativo ativo reinicia a sessão na hora via `restartNativeSession`
   — terminate+create mantendo imagens). Validação: 2 sondas FFI + sondas CLI,
   263 testes (novos FFI: kill nativo, hostname/domain/workdir/entrypoint,
   tuning cpu=1 aplicado e revertido via restart, inspect de VHD) e smokes
   30/30 + visual 3/3 com screenshots conferidos.

8. **Design system próprio sobre HeroUI v3** ✅ (concluída, 01/09/2026) — troca
   completa do shadcn/ui pelo **HeroUI v3** (React Aria + Tailwind v4) e criação
   de um design system em `src/renderer/src/design/`: tokens (`theme.css`),
   material e forma (`glass.css`) e composições (layout, controls, overlays,
   data, feedback). As features passam a importar só de `@/design`. Decisões:
   **um raio de 6px em toda a interface** (o HeroUI vem com pílula — override
   por classe), **fundo neutro e opaco**, **vidro só onde existe algo atrás para
   desfocar** (overlays flutuantes e a barra fixa por onde o conteúdo rola),
   **uma superfície por tela** (agrupar é hairline, não card sobre card),
   **ciano da marca (#00B5CC) reservado para ação principal e estado ativo** e
   tipografia nativa do Windows (Segoe UI Variable + Cascadia Mono, zero fonte
   baixada e nada esbarrando na CSP). O layout virou full-bleed: title bar,
   rail recolhível e conteúdo, sem moldura flutuante. Saíram 15 dependências
   (radix-ui, sonner, recharts, cmdk, vaul, react-hook-form…) e os 70 arquivos
   de `components/ui/`; o sparkline virou SVG de 40 linhas. Validação:
   `npm run check` verde (263 testes) e tour de screenshots por tela e overlay
   no app real.
9. **Painel de dados e limpeza de ruído** ✅ (concluída, 01/09/2026) — ajustes
   pedidos depois de rodar o app. A tabela virou o **painel da view de lista**:
   moldura hairline com fundo de superfície, cabeçalho fixo em faixa reta
   (o HeroUI arredonda as pontas em 32px — o override precisa repetir as
   MESMAS propriedades lógicas, `border-start-start-radius` e companhia:
   `border-radius: 0` num seletor mais específico não vence a longhand
   lógica), hover com faixa discreta e fio de acento na primeira célula,
   filtros na faixa superior e contagem no rodapé. `PageShell fill` +
   `DataTable fill`: a página não rola mais, quem rola são as linhas — sem
   isso o container flex fica com altura automática (`min-h-full`) e o
   `flex-1` da tabela não tem o que dividir, então ela vaza para fora da
   janela. Sumiram o bloco de versões do rail (já estão em Sistema) e o ícone
   da marca (ficou só a assinatura tipográfica). Ação de criar/baixar virou
   `IconAction` primário com tooltip. Texto de ajuda entre parênteses saiu dos
   rótulos e virou `hint` (ícone ⓘ + tooltip) em todos os formulários. Rail
   recolhido: o item é centralizado pelo `<li>`, porque o `Tooltip.Trigger`
   embrulha o link num `<div>` que só ocupa a largura do conteúdo — com
   `justify-center` dentro do link os ícones ficavam colados na borda. Sistema
   passou a usar a largura inteira (grade de duas colunas). Por fim, a **escala
   de superfície foi reduzida a três níveis** (`--background` → `--surface` →
   `--well`): o rail perdeu o tint próprio, `surface-secondary`/`tertiary`
   viraram apelido de `--surface` (o cabeçalho da tabela é o mesmo fundo do
   painel, separado por hairline), `--segment` virou apelido de `--default`,
   `inset-well` passou a usar o fundo dos campos e o `Group` ganhou o mesmo
   fundo do `DataTable`. Auditoria por `getComputedStyle` em cada tela para
   contar os fundos realmente pintados. Depois disso, **campo e modal entraram
   na mesma rampa**: o campo virou um degrau acima do painel (opaco — o
   translúcido mudava de tom conforme o container e bagunçava os `color-mix`
   de hover/foco do HeroUI), `field-row` passou a valer para linha de controle
   e `field-group` (hairline, sem fundo) para grupo que embrulha campos; o
   `--overlay` saiu de uma cor escolhida no olho (`rgb(22 24 29)`) para
   `color-mix(--surface 88%)` e o grão dos overlays ganhou versão suave
   (alpha 0.055 ≈ 0.1 × 0.55, a força do grão da janela), que era o que fazia
   o modal ler como outra cor. A faixa fixa da view deixou de ser vidro
   (`glass-bar` → `page-bar`, opaca + o mesmo grão): o `backdrop-filter` alisa
   o grão do fundo e a média do ruído sobe, então a faixa lia mais clara que a
   tela — e, com as listas rolando dentro do painel, o blur não tinha mais
   função. "Mostrar parados" virou `IconToggle` (ícone + tooltip, estado no
   fundo de acento), composição nova em `design/controls.tsx` que a barra de
   logs também passou a usar.
10. **Sistema em abas e controles certos para cada dado** ✅ (concluída,
    02/09/2026). A view Sistema era uma página só com blocos heterogêneos numa
    grade de duas colunas onde metade ocupava as duas — escada com buracos —, e
    a escolha de motor (que decide o comportamento do app INTEIRO) ficava
    abaixo da dobra como uma linha de `<dl>` no quarto bloco. Virou quatro
    abas, cada uma respondendo a uma pergunta: **Ambiente** (o que está
    instalado), **Motor** (quem executa e o que se perde trocando), **API
    nativa** (qual DLL e com que limites de VM) e **Atualizações**. O painel
    rola por dentro (`PageShell fill`), então a faixa de abas não sai da tela.
    O maior ganho não foram as abas: o parágrafo de oito linhas que descrevia
    em prosa a cobertura de cada motor virou **matriz de 14 linhas**
    (`features/system/capabilities.ts`, tirada do roteamento real de
    `ipc/index.ts`) — a pergunta "perco o quê?" passou a ser uma varredura de
    olho, e ficou visível o que a prosa escondia (crash dump é o único recurso
    só-nativo). A aba de Referências foi removida. Depois disso, **11
    componentes do HeroUI que o app reimplementava à mão**, dos quais 5 já
    entraram: `TagsInput` sobre `TagGroup` nos **14 campos** que eram texto
    "separe por vírgula" (cada valor virou chip removível), `NumberInput` sobre
    `NumberField` nos **11 campos** numéricos que eram `TextInput` +
    `Number.parseInt`, `Meter` no lugar de `ProgressBar` em `Metric` (uso de
    CPU é medição, não progresso rumo a uma conclusão), `InputGroup` nos 4
    pares campo+botão montados com `flex items-end gap-2`, e
    `ToggleButtonGroup` na escolha de motor (dois `ToggleButton` soltos são
    duas chaves independentes para o leitor de tela; com `selectionMode`
    "single" virou `radiogroup`). Ficam para depois: `Form`+`FieldError` (hoje
    a validação só desabilita o botão, sem dizer por quê), `Disclosure` no
    painel de logs, `Fieldset`/`SwitchGroup` no lugar da utility `field-group`,
    `DateField` no recorte por data dos logs, `Toolbar` na barra de filtros e
    `Link` na âncora crua do portão de instalação. Mínimo da janela subiu de
    940×600 para **1180×700** (largura tirada do conteúdo real: rail de 224px +
    tabela de containers ≈ 950px sem rolagem horizontal; altura parou em 700
    porque tela de 768px menos barra de tarefas ainda é comum). Validação:
    `npm run check` (383 testes) + E2E 181/181 e tour de screenshots no app
    real por aba, diálogo e controle novo.

11. **Movimento: view transitions onde a região troca de conteúdo** ✅
    (concluída, 02/09/2026). Toda troca de estado visual era corte seco. Entrou
    uma primitiva só (`lib/view-transition.ts`) e uma camada de coreografia
    (`design/motion.css`), com a regra de leitura: **em toda troca, quase tudo é
    fixo** — barra de título, rail, cabeçalho, faixa de abas e painéis do rodapé
    ficam onde estão; o que muda é uma região. Então nada anima por padrão
    (`::view-transition-old(root)` desligado) e a região que se move é nomeada
    de propósito. O truque que dispensou refactor de estrutura: **elemento
    nomeado é excluído do snapshot do ancestral nomeado** — nomear `PageShell`
    (`page`) e `PageHeader` (`page-header`) já separou "o corpo" de "a barra",
    sem wrapper novo em view nenhuma. O eixo do movimento é o **eixo do
    navegador**: o rail é vertical, então trocar de tela desliza 8px em Y no
    sentido do rail (`defaultViewTransition.types` em `main.tsx` →
    `navTransitionTypes`, sobre a ordem de `navigation.ts`, agora fonte única);
    a faixa de abas é horizontal, então trocar de aba desliza 10px em X
    (wrapper `design/tabs.tsx` — as 4 telas com abas não mudaram uma linha).
    Saída em 110ms contra entrada em 180ms, porque dois textos em cross-fade
    pelo mesmo tempo ficam ilegíveis. **O que NÃO virou view transition, por
    medição:** recolher o rail e abrir os painéis do rodapé. Ali a mudança é de
    layout, e substituir o reflow por snapshot **dobra o texto** (grade de duas
    colunas tem a segunda coluna em x diferente antes e depois, e o cross-fade
    mostra as duas) e deixa rótulo flutuando sem o corte do container — o
    `transition-[width]` que já existia interpola layout de verdade e não tem
    nenhum dos dois artefatos. O marcador do item ativo do rail virou UM
    elemento medido atrás da lista, que desliza por transição de CSS (medido:
    y 48 → 164 aos 40% do caminho) e acompanha o layout **sem** transição
    enquanto o rail fecha, senão fica correndo atrás de um alvo em movimento.
    Validação: `npm run check` (404 testes) + E2E **187/187** com o movimento
    LIGADO (nenhuma instabilidade, então a fixture não desliga animação) +
    `e2e/transicoes.spec.ts`, que mede a fiação e não pixel.

**Fase 10 — E2E do app inteiro (feita ✅)** — suíte Playwright (`e2e/`) contra o
Electron compilado, cobrindo cada feature nos DOIS motores, com caminho feliz e
triste. Para isso as fronteiras do processo main viraram interface injetável
(`services/wslc/ops.ts`): antes só a CLI tinha dublê, então metade do app — o
motor nativo inteiro (FFI), os streams de longa duração (spawn do wslc.exe) e os
efeitos externos (diálogos do Electron, shell do Windows, busca no Docker Hub) —
estava fora de alcance de teste. Agora `WSLC_UI_MOCK` troca as quatro portas:
`mock-ops.ts` tem uma sessão nativa fictícia com storage próprio (reiniciar
mantém as imagens e perde os containers; resetar perde os dois, como no SDK
real), streams que progridem sozinhos com progresso por camada, terminais que
ecoam, e efeitos externos que viram entrada de log em vez de abrir janelas do
Windows. `mock-state.ts` acrescenta injeção de falha por canal do contrato
(`WSLC_UI_MOCK_FAIL=volumes:create`), caminho/cancelamento dos diálogos de
arquivo e cadência dos streams — é o que torna o caminho triste reproduzível
sem derrubar nada de verdade. Cada teste sobe uma instância do app com
`--user-data-dir` próprio, o que dá estado limpo, motor semeado no
`settings.json` antes do app abrir e paralelismo (o lock de instância única do
Electron é por pasta de dados). No caminho, uma brecha real foi fechada: o
`setWindowOpenHandler` chamava `shell.openExternal` direto, fora do IPC — os
links de referência em Sistema abririam o navegador até em modo demo.

### O que a 2.9.9 do SDK mudou (medido)

`WslcOpenContainer` **levanta a limitação principal** documentada acima: um container criado numa
execução do app pode ser reaberto por nome ou ID em outra. Medido: soltar a sessão derruba o
container para EXITED, mas o registro fica; reabrir devolve um handle utilizável, e `Start` o põe
de volta em RUNNING. O app passou a lembrar em disco (`native/known.ts`) os containers que criou e a
reabri-los, em vez de apagá-los ao fechar — o que só era necessário porque, sem abrir por ID, eles
virariam órfãos invisíveis. Na ABI 2.9.3 o comportamento antigo continua.

Continua **não havendo enumeração** de containers: o único jeito de reencontrá-los é o app lembrar
os nomes.

E há uma armadilha nova, já tratada em `native/bundled.ts`: o SDK precisa CASAR com a versão do WSL.
SDK novo demais dá segfault (`WslcGetSessionTerminationEvent` num WSL mais antigo); SDK velho demais
é recusado com `WSLC_E_SDK_UPDATE_NEEDED` em qualquer chamada. Duas assinaturas também mudaram sem
mudança visível no header — ver `SdkAbi`.

**Cobertura 100% da superfície do wslc 2.9.9 (CLI e SDK)** — auditada contra a
árvore de `--help` da CLI, recursivamente, e contra as 62 funções do header.
Tudo está na UI, implementado nos dois motores quando possível, ou documentado
com o motivo quando não: `session enter/run/shell` (interativos de terminal —
regra 18), `--cidfile`/`-i`/`-t` do run (sem sentido numa UI: o app já mostra o
ID e tem terminal próprio), o `-` do `container cp` (origem por stdin: um
diálogo não tem stdin para oferecer), o `-f/--filter` das listagens (a UI já
filtra do lado dela, sobre a lista que tem em mãos), `SetSessionSettingsTimeout`
(trava o create — regra 18), `WSLC_CONTAINER_FLAG_PRIVILEGED` (sem efeito no
preview — regra 18) e as variantes de buffer
`WslcImportSessionImage`/`WslcLoadSessionImage` (as `…FromFile` cobrem o mesmo
caso).

**Decidido:** a opção global `--session <nome>` (regra 19) alcança a sessão
viva do app pela CLI, o que derrubava o comentário no topo do
`scripts/cenario-nativo.ts`. O script **continua usando o SDK**, e o comentário
foi corrigido: `--session` só alcança sessão VIVA — com o app aberto —, e o app
aberto é justamente o que impede o seeder de rodar (um processo por sessão). O
SDK é o único caminho que funciona com o app fechado, que é quando semear faz
sentido. Expor a escolha de sessão na UI fica fora de escopo por ora.

Riscos do preview: header avisa que a API pode quebrar entre releases — a DLL
vendorizada fixa a versão; atualizar `vendor/` junto com o NuGet.
