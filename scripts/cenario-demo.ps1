<#
.SYNOPSIS
  Monta (ou desfaz) um cenário de teste no wslc que acende todas as features da UI.

.DESCRIPTION
  Cria imagens, volumes, redes e seis containers escolhidos para cobrir, juntos,
  cada coluna e cada ação que o app expõe: portas publicadas, healthcheck, labels,
  limites de CPU/memória, tmpfs, DNS, entrypoint/workdir/user, stop-signal,
  volume montado, multi-rede, stream de logs contínuo e os quatro estados de
  container que a lista sabe pintar (running, stopped, exited 0, exited 1).

  O cenário roda no motor CLI. O motor nativo tem storage próprio: a sessão
  "WslcUi" não enxerga nada disto — para povoar o nativo, use o mesmo cenário
  com a UI no motor Nativo (veja o README).

.PARAMETER Reset
  Remove tudo que o cenário cria (containers, redes, volumes e a tag local).
  Não mexe nas imagens baixadas.

.EXAMPLE
  pwsh -File scripts/cenario-demo.ps1
  pwsh -File scripts/cenario-demo.ps1 -Reset
#>
[CmdletBinding()]
param([switch]$Reset)

$ErrorActionPreference = 'Stop'

# O wslc.exe fica em C:\Program Files\WSL, que nem sempre está no PATH — mesma
# resolução que o app faz em src/main/services/wslc/cli.ts.
$wslc = Join-Path $env:ProgramFiles 'WSL\wslc.exe'
if (-not (Test-Path $wslc)) { $wslc = 'wslc.exe' }

$containers = 'loja-web', 'loja-api', 'loja-worker', 'loja-parado', 'loja-concluido', 'loja-quebrado'
$volumes = 'loja-dados', 'loja-cache', 'loja-vhd'
$networks = 'loja-frontend', 'loja-backend'

function Invoke-Wslc {
    <#
      Roda o wslc e mostra a falha, a não ser que ela seja esperada (-AllowFailure,
      usado na limpeza, onde "não encontrado" é o caso normal).

      O parâmetro NÃO pode se chamar $Args: é variável automática do PowerShell e
      seria reescrita com os argumentos não-ligados, rodando o wslc sem argumento.
    #>
    param([Parameter(Mandatory)][string[]]$WslcArgs, [switch]$AllowFailure)

    # stderr de executável não é erro terminante — sem isto o $ErrorActionPreference
    # do topo transformaria qualquer aviso do wslc em exceção.
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $out = & $wslc @WslcArgs 2>&1 } finally { $ErrorActionPreference = $previous }

    if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
        Write-Host "  ! $($out -join ' ')" -ForegroundColor Red
    }
    return $out
}

function Step { param([string]$Text) Write-Host "-> $Text" -ForegroundColor Cyan }

# --------------------------------------------------------------------------
# Limpeza (usada tanto pelo -Reset quanto antes de recriar, p/ ser idempotente)
# --------------------------------------------------------------------------
function Remove-Cenario {
    Step 'removendo containers'
    Invoke-Wslc -AllowFailure -WslcArgs (@('remove', '--force') + $containers) | Out-Null

    Step 'removendo redes'
    Invoke-Wslc -AllowFailure -WslcArgs (@('network', 'remove') + $networks) | Out-Null

    Step 'removendo volumes'
    Invoke-Wslc -AllowFailure -WslcArgs (@('volume', 'remove') + $volumes) | Out-Null

    Step 'removendo a tag local'
    Invoke-Wslc -AllowFailure -WslcArgs @('rmi', 'loja/web:1.0') | Out-Null
}

if ($Reset) {
    Remove-Cenario
    Write-Host "`nCenário desfeito." -ForegroundColor Green
    exit 0
}

Remove-Cenario
Write-Host ''

# --------------------------------------------------------------------------
# Imagens
# --------------------------------------------------------------------------
Step 'baixando imagens (pula as que já existem)'
foreach ($image in 'nginx:alpine', 'alpine:latest', 'busybox:latest') {
    if (-not (& $wslc images --format json | ConvertFrom-Json | Where-Object {
                "$($_.Repository):$($_.Tag)" -eq $image })) {
        Write-Host "   pull $image"
        Invoke-Wslc -WslcArgs @('pull', $image) | Out-Null
    }
}

# Uma segunda tag na mesma imagem: a view de Imagens precisa mostrar as duas
# linhas com o mesmo IMAGE ID, e é o alvo natural do push/rmi por referência.
Step 'marcando nginx:alpine como loja/web:1.0'
Invoke-Wslc -WslcArgs @('tag', 'nginx:alpine', 'loja/web:1.0') | Out-Null

# --------------------------------------------------------------------------
# Volumes: dois "guest" (padrão) e um VHDX, que é o caso com tamanho e HostPath
# --------------------------------------------------------------------------
Step 'criando volumes'
Invoke-Wslc -WslcArgs @('volume', 'create', '--label', 'app=loja', '--label', 'camada=dados', 'loja-dados') | Out-Null
Invoke-Wslc -WslcArgs @('volume', 'create', '--label', 'app=loja', '--label', 'camada=cache', 'loja-cache') | Out-Null
Invoke-Wslc -WslcArgs @('volume', 'create', '--driver', 'vhd', '--opt', 'SizeBytes=536870912',
    '--label', 'app=loja', 'loja-vhd') | Out-Null

# --------------------------------------------------------------------------
# Redes: uma com sub-rede explícita, uma interna (sem saída para fora)
# --------------------------------------------------------------------------
Step 'criando redes'
Invoke-Wslc -WslcArgs @('network', 'create', '--subnet', '172.30.0.0/16', '--gateway', '172.30.0.1',
    '--label', 'app=loja', 'loja-frontend') | Out-Null
Invoke-Wslc -WslcArgs @('network', 'create', '--internal', '--label', 'app=loja', 'loja-backend') | Out-Null

# --------------------------------------------------------------------------
# Containers
# --------------------------------------------------------------------------

# 1) O container "cheio": portas publicadas, healthcheck, alias de rede,
#    hostname/domínio, labels, volume e env. É o que exercita Stats, Logs,
#    Terminal, Exec e o Inspect completo.
Step 'subindo loja-web (nginx, portas 8080/8443 + healthcheck)'
Invoke-Wslc -WslcArgs @(
    'run', '-d', '--name', 'loja-web',
    '--network', 'loja-frontend', '--network-alias', 'site',
    '-p', '8080:80', '-p', '8443:443',
    '--hostname', 'web-01', '--domainname', 'loja.local',
    '--health-cmd', 'wget -qO- http://localhost/ >/dev/null || exit 1',
    '--health-interval', '30s', '--health-timeout', '5s',
    '--health-retries', '3', '--health-start-period', '10s',
    '-l', 'app=loja', '-l', 'camada=web',
    '-v', 'loja-cache:/var/cache/nginx',
    '-e', 'AMBIENTE=demo',
    'nginx:alpine') | Out-Null

# Segunda rede no mesmo container: dá o que desconectar na view de Redes.
Step 'conectando loja-web também à rede interna'
Invoke-Wslc -WslcArgs @('network', 'connect', 'loja-backend', 'loja-web') | Out-Null

# 2) O container "de recursos": limites, tmpfs, DNS, entrypoint, workdir e user.
#    O laço infinito alimenta o stream de logs com follow.
Step 'subindo loja-api (limites, tmpfs, DNS, logs contínuos)'
Invoke-Wslc -WslcArgs @(
    'run', '-d', '--name', 'loja-api',
    '--network', 'loja-backend',
    '-v', 'loja-dados:/dados', '-w', '/dados', '-u', '0:0',
    '--cpus', '1', '-m', '256M', '--shm-size', '64M', '--ulimit', 'nofile=1024:2048',
    '--tmpfs', '/cache',
    '--dns', '1.1.1.1', '--dns-search', 'svc.local',
    '-e', 'PORTA=3000', '-e', 'NIVEL_LOG=debug',
    '-l', 'app=loja', '-l', 'camada=api',
    '--entrypoint', '/bin/sh',
    'alpine:latest',
    '-c', 'i=1; while true; do echo "[api] requisicao $i tratada na porta ${PORTA}"; i=$((i+1)); sleep 2; done') | Out-Null

# 3) O container do VHDX: escreve no volume com tamanho fixo e para com SIGKILL,
#    que é o stop-signal que o Inspect mostra diferente do padrão.
Step 'subindo loja-worker (grava no VHDX, stop-signal SIGKILL)'
Invoke-Wslc -WslcArgs @(
    'run', '-d', '--name', 'loja-worker',
    '-v', 'loja-vhd:/dados',
    '--stop-signal', 'SIGKILL',
    '-l', 'app=loja', '-l', 'camada=worker',
    'busybox:latest',
    'sh', '-c', 'i=1; while true; do echo "[worker] lote $i gravado" | tee -a /dados/lotes.log; i=$((i+1)); sleep 3; done') | Out-Null

# 4) Parado de propósito: é o único estado em que o Export funciona, e o que
#    mostra o botão Iniciar em vez de Parar.
Step 'criando loja-parado (parado: alvo do Export e do Iniciar)'
Invoke-Wslc -WslcArgs @(
    'run', '-d', '--name', 'loja-parado',
    '-l', 'app=loja', '-l', 'camada=lote',
    'alpine:latest', 'sleep', '3600') | Out-Null
Invoke-Wslc -WslcArgs @('stop', 'loja-parado') | Out-Null

# 5) e 6) Os dois desfechos de um container que termina sozinho: a lista pinta
#    o código de saída 0 diferente de um diferente de zero.
Step 'criando loja-concluido (saiu com 0) e loja-quebrado (saiu com 1)'
Invoke-Wslc -WslcArgs @('run', '-d', '--name', 'loja-concluido', '-l', 'app=loja',
    'busybox:latest', 'sh', '-c', 'echo "[lote] processamento concluido"; exit 0') | Out-Null
Invoke-Wslc -WslcArgs @('run', '-d', '--name', 'loja-quebrado', '-l', 'app=loja',
    'busybox:latest', 'sh', '-c', 'echo "[lote] falha ao abrir /etc/config.yaml"; exit 1') | Out-Null

# --------------------------------------------------------------------------
Write-Host ''
Step 'estado final'
& $wslc list -a
Write-Host ''
& $wslc volume list
Write-Host ''
& $wslc network list
Write-Host "`nCenário pronto. Abra o app no motor CLI." -ForegroundColor Green
