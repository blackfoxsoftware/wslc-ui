# Como contribuir

Obrigado pelo interesse. Este é um projeto **não oficial**, sem vínculo com a Microsoft, e o `wslc`
em que ele se apoia está em **preview** — a API pode mudar entre releases do WSL. Vale saber disso
antes de investir tempo em algo grande.

Antes de abrir uma PR com mudança de peso (feature nova, mudança de arquitetura, dependência nova),
**abra uma issue primeiro**. É mais rápido concordar no rumo em três comentários do que numa PR de
mil linhas.

## O fluxo, em uma frase

**Toda PR entra na `dev`.** A `main` só recebe o merge da `dev`, e é esse merge que publica a
release. O CI recusa PR que aponte para a `main` sem vir da `dev`, e o ruleset da `main` não aceita
push direto. O fluxo completo, com o que cada ruleset cobra, está no
[README](README.md#fluxo-de-trabalho-e-releases).

```powershell
git switch dev
git pull
git switch -c feat/o-que-voce-vai-fazer
# ... trabalho ...
gh pr create --base dev
```

## Ambiente

- **Windows 11** — o alvo é Windows, e não há como fugir: a UI conversa com o `wslc.exe` e com a
  `wslcsdk.dll`.
- **Node.js 20+** (o CI roda em 24).
- **WSL 2.9.3 ou superior** (pré-release): `wsl --update --pre-release`. **Opcional** — veja abaixo.

```powershell
npm install
npm run dev
```

Se o Electron não subir e a pasta `node_modules/electron/dist` estiver vazia, o npm bloqueou o script
de instalação do pacote. Resolve com:

```powershell
node node_modules/electron/install.js
```

### Sem WSL instalado

Dá para mexer no app **inteiro** sem o WSL: o modo de demonstração dubla os dois motores, os streams
e os terminais.

```powershell
$env:WSLC_UI_MOCK = '1'
npm run dev
```

É o mesmo modo que o E2E usa, então uma contribuição de UI pode ser desenvolvida e testada sem tocar
em container nenhum. As variáveis que afinam o dublê (incluindo injeção de falha por canal) estão no
[README](README.md#modo-de-demonstração-sem-wslc-instalado).

O motor **nativo** (FFI) é a única parte que precisa de máquina real: a `wslcsdk.dll` não é
redistribuída aqui, e os testes de integração dela se auto-desligam quando ela não está presente —
inclusive no CI. Para tê-la, siga o [`vendor/wslcsdk/README.md`](vendor/wslcsdk/README.md).

## Antes de abrir a PR

```powershell
npm run check      # typecheck, lint, formatação, testes de unidade e patchnotes.json
npm run test:e2e   # build + Playwright contra o app Electron (se a mudança pega na UI)
```

O CI roda exatamente isso, em `windows-latest`. O E2E leva uns 4 minutos lá; localmente, com 4
workers, menos.

## Convenções

**Formatação e lint não se discutem**: `oxfmt` e `oxlint` decidem. `npm run format` e
`npm run lint:fix` antes de commitar; nada de ajuste manual de estilo na PR.

**Comentário explica o _porquê_, nunca o _quê_.** O código já diz o que faz. Comentário bom aqui é o
que registra uma decisão, uma limitação medida do preview ou uma armadilha — por exemplo, por que o
terminal roda em modo linha, ou por que o `export` só funciona com o container parado. Em português,
como o resto do projeto.

**O contrato IPC é a fronteira.** Canal novo ou campo novo significa schema Zod em `src/shared/`, e
os **dois motores** implementados (ou o motivo documentado quando um deles não dá conta). O router
valida nas duas direções: se não está no schema, não passa.

**Teste na altura certa.** Lógica pura e parsers em Vitest; comportamento de tela em Testing Library;
jornada do usuário em Playwright. Nos testes de UI, seletor sai de **papel + nome acessível** (o que
um leitor de tela enxerga) ou de `data-slot` nos overlays do HeroUI — **nunca** de classe do
Tailwind.

**UI usa o design system.** Componentes e tokens em `src/renderer/src/design`; HeroUI v3 por baixo.
Não introduza uma quinta variação de raio de borda.

## `patchnotes.json`

Se a mudança é visível para quem usa o app, acrescente uma linha no `patchnotes.json`, na entrada da
versão em aberto — é dali que sai o corpo da release, e o CI valida o arquivo. Categorias:
`adicionado`, `alterado`, `corrigido`, `removido`, `seguranca`.

Refatoração interna, teste e ajuste de CI não entram: as notas são para quem usa, não para quem
mantém.

## Mensagens de commit

Em português, no imperativo, primeira linha curta (até ~70 caracteres) e sem ponto final. O corpo,
quando houver, explica **por que** a mudança é assim — a alternativa que você descartou vale mais que
a descrição do diff.

A mensagem termina na última linha de conteúdo: este repositório não usa bloco de trailers.

```
Corrige o export de container parado

O wslc recusa export de container em execução, e a UI mostrava o erro cru do
CLI. Agora o botão fica desabilitado com o motivo no tooltip.
```

## Segurança

Não abra issue pública para vulnerabilidade. O caminho está no [SECURITY.md](SECURITY.md).

## Licença

Ao contribuir, você concorda em licenciar a contribuição sob a
[licença MIT](LICENSE) do projeto.
