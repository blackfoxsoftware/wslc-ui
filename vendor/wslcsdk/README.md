# wslcsdk (vendorizado)

DLL e header do pacote NuGet **Microsoft.WSL.Containers** (preview), usados pelo backend nativo
(koffi/FFI) em `src/main/services/wslc/native/`.

> **Os binários não estão no repositório.** São redistribuíveis da Microsoft e ficam fora do
> controle de versão (ver `.gitignore`). Baixe-os antes de usar o motor nativo.

## Como obter

```powershell
curl.exe -L -o wslc.nupkg https://www.nuget.org/api/v2/package/Microsoft.WSL.Containers
Expand-Archive .\wslc.nupkg -DestinationPath .\wslc-nupkg
Copy-Item .\wslc-nupkg\runtimes\win-x64\native\wslcsdk.dll .\win-x64\
Copy-Item .\wslc-nupkg\build\native\include\wslcsdk.h   .\include\
```

Estrutura esperada:

```
vendor/wslcsdk/
  include/wslcsdk.h
  win-x64/wslcsdk.dll
```

Sem esses arquivos o app continua funcionando pelo motor **CLI** (`wslc.exe`); a instalação guiada
do próprio app detecta a ausência do SDK e orienta o download.
