# wslcsdk — SDK do WSL Containers (vendorizado)

DLLs e headers do pacote NuGet **[Microsoft.WSL.Containers][pkg]**, usados pelo backend nativo
(koffi/FFI) em `src/main/services/wslc/native/`. Licença **MIT**, © Microsoft Corporation — ver
`LICENSE.txt` e `NOTICE.txt`. Redistribuir é permitido desde que esses avisos acompanhem, que é
por isso que eles estão aqui e vão dentro do instalador.

| Versão | SHA-256 da DLL                                                     | Tamanho   |
| ------ | ------------------------------------------------------------------ | --------- |
| 2.9.3  | `a3881e7d239be9944a64868c323046aa0292d4806c289cb31c50c8df8d5dc68d` | 5.406.520 |
| 2.9.9  | `8d4d55d4283fb32a5909b57e78b576d01363d7b28bb9b2595115e80faf61db5b` | 4.929.888 |

```
vendor/wslcsdk/
  include/2.9.3/wslcsdk.h     LICENSE.txt
  include/2.9.9/wslcsdk.h     NOTICE.txt
  win-x64/2.9.3/wslcsdk.dll
  win-x64/2.9.9/wslcsdk.dll
```

## Por que duas

Porque a versão do SDK precisa acompanhar a do WSL instalado, e isso foi **medido**: nesta máquina,
com WSL **2.9.4**, o SDK **2.9.9** carrega, cria a sessão e lista imagens — e então dá
**segmentation fault** em `WslcGetSessionTerminationEvent`.

O que torna esse caso perigoso é que nada no header denuncia o problema: a declaração daquela função
é byte a byte idêntica nas duas versões, e os 18 structs também. Não há binding que se defenda
disso. O SDK novo simplesmente conversa com um `wslservice` mais velho do que ele espera.

Daí a regra de `native/bundled.ts`: **usar a DLL mais nova que não passe da versão do WSL
instalado**. Com WSL 2.9.4 isso dá a 2.9.3; com 2.9.9 ou mais, a 2.9.9. Sem saber a versão, fica na
mais antiga — errar para baixo custa recurso, errar para cima custa o processo.

Quem quiser fugir da regra escolhe outra DLL na aba **Sistema**.

## O que a 2.9.9 muda

Duas funções novas — `WslcOpenContainer` (abre container existente por nome, ID ou prefixo) e
`WslcSetContainerInitProcessIOCallbacks` — e **duas assinaturas alteradas**:

- `WslcSessionAuthenticate` ganhou `tokenType` **antes** do `errorMessage`;
- `WslcInstallWithDependencies` ganhou `components` e `options` na frente.

O `bindings.ts` detecta qual ABI está carregada pela presença do símbolo `WslcOpenContainer` e
adapta as chamadas (ver `SdkAbi`). É o que permite ao seletor da aba Sistema aceitar qualquer uma
das duas sem quebrar login em registry nem instalação guiada.

## Atualizar / acrescentar uma versão

```powershell
curl.exe -L -o wslc.nupkg https://www.nuget.org/api/v2/package/Microsoft.WSL.Containers/<versão>
Expand-Archive .\wslc.nupkg -DestinationPath .\wslc-nupkg
mkdir .\win-x64\<versão>, .\include\<versão>
Copy-Item .\wslc-nupkg\runtimes\win-x64\native\wslcsdk.dll .\win-x64\<versão>\
Copy-Item .\wslc-nupkg\include\wslcsdk.h                   .\include\<versão>\
Copy-Item .\wslc-nupkg\NOTICE.txt                          .\
Get-FileHash .\win-x64\<versão>\wslcsdk.dll -Algorithm SHA256
```

Depois: acrescente a versão em `BUNDLED_SDKS` (ordenada, da mais antiga para a mais nova) e **faça o
diff do header** contra a anterior antes de confiar. Se alguma assinatura mudar de novo, `SdkAbi`
precisa de um novo marcador — um símbolo que só exista na versão nova.

Sem esses arquivos o app continua funcionando pelo motor **CLI** (`wslc.exe`).

[pkg]: https://www.nuget.org/packages/Microsoft.WSL.Containers
