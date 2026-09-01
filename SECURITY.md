# Política de segurança

## Versões cobertas

O projeto está em `0.x` e se apoia num componente da Microsoft em **preview**. Só a última versão
publicada recebe correção; não há backport para tags anteriores.

## Como reportar

**Não abra issue pública** para falha de segurança. Use um destes dois caminhos:

1. [Relato privado no GitHub](https://github.com/blackfoxsoftware/wslc-ui/security/advisories/new) —
   aba **Security → Report a vulnerability**. É o caminho preferido: a conversa fica no repositório,
   privada, e vira um advisory se o caso se confirmar.
2. E-mail para **softwareblackfox@gmail.com**.

Ajuda muito incluir: versão do app (tag ou commit), versão do WSL (`wsl --version`), qual motor (CLI
ou nativo), os passos para reproduzir e o impacto que você consegue demonstrar.

Projeto mantido por uma pessoa, fora do horário comercial: **não há SLA**. Conte com um primeiro
retorno em alguns dias e, se o problema se confirmar, correção na versão seguinte — com crédito nas
notas, se você quiser.

## Modelo de confiança

Saber o que o app é ajuda a calibrar o que é falha de segurança aqui.

É um app **desktop local**: não tem servidor, não tem conta, não coleta telemetria e não faz rede por
si — o tráfego que existe é o que o `wslc` faz por conta própria (pull e push de imagem para o
registry que **você** apontar).

- O renderer não tem Node. Ele fala com o processo main apenas pelo bridge `wslcApi`, e **todo canal
  é validado com Zod nas duas direções** — o que não está no schema não passa.
- `sandbox: false` está ligado, porque o preload precisa de APIs do Node. É uma escolha consciente, e
  é justamente o motivo de o contrato IPC ser fechado por schema.
- Efeitos no Windows (abrir o Explorer, o navegador, o arquivo de configuração) passam pela mesma
  fronteira de IPC, nunca direto do renderer.
- O app faz o que você manda: criar container, executar comando, `exec` num container em execução.
  Isso é a função dele, não escalada de privilégio.

### Conta como vulnerabilidade

- Escapar do contrato IPC: canal ou payload que o schema aceita e não deveria, ou algo que o renderer
  alcance fora do `wslcApi`.
- Injeção nos argumentos passados ao `wslc.exe` ou ao SDK a partir de campo de formulário (nome de
  container, tag, caminho de volume) que execute algo que o usuário não pediu.
- Path traversal ou escrita fora do esperado no import/export/load de tarball e nos volumes VHDX.
- Credencial de registry (do `login`) vazando em log, em disco ou na tela.
- Dependência npm vulnerável que o app realmente alcance em execução.

### Não conta

- Bug do `wslc`, da `wslcsdk.dll` ou do WSL: é código da Microsoft, e o caminho é reportar lá. Se a
  UI puder contornar, abra uma issue normal aqui.
- O app executar o comando que você mesmo digitou no terminal embutido ou no `exec`.
- Ausência de binário assinado: o projeto não distribui instalador (ver [README](README.md#licença)).
