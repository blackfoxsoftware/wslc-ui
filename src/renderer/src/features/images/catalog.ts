export type CatalogCategory =
  | 'base'
  | 'languages'
  | 'databases'
  | 'web'
  | 'messaging'
  | 'devops'
  | 'monitoring'
  | 'ai'
  | 'apps'

export const CATEGORY_LABELS: Record<CatalogCategory, string> = {
  base: 'Base & Utilitários',
  languages: 'Linguagens & Runtimes',
  databases: 'Bancos de dados & Busca',
  web: 'Web & Proxy',
  messaging: 'Mensageria & Cache',
  devops: 'DevOps & Ferramentas',
  monitoring: 'Monitoramento',
  ai: 'IA & Ciência de dados',
  apps: 'Apps prontos'
}

export const CATEGORIES = Object.keys(CATEGORY_LABELS) as CatalogCategory[]

export interface CatalogImage {
  ref: string
  name: string
  description: string
  category: CatalogCategory
  /** Mapeamentos host:container sugeridos ao executar. */
  ports?: string[]
  /** Variáveis KEY=valor sugeridas (valor é um palpite editável). */
  env?: string[]
  /** Sugere habilitar GPU (--gpus all). */
  gpus?: boolean
}

/** Catálogo curado de imagens populares, com sugestões de execução. */
export const IMAGE_CATALOG: CatalogImage[] = [
  // ---------- Base & Utilitários ----------
  {
    ref: 'hello-world:latest',
    name: 'Hello World',
    description: 'Teste mínimo para validar a instalação.',
    category: 'base'
  },
  {
    ref: 'alpine:latest',
    name: 'Alpine',
    description: 'Linux minimalista (~5 MB), ideal como base.',
    category: 'base'
  },
  { ref: 'ubuntu:latest', name: 'Ubuntu', description: 'Base Ubuntu LTS oficial.', category: 'base' },
  {
    ref: 'debian:stable-slim',
    name: 'Debian Slim',
    description: 'Debian estável em versão enxuta.',
    category: 'base'
  },
  { ref: 'fedora:latest', name: 'Fedora', description: 'Base Fedora oficial.', category: 'base' },
  {
    ref: 'archlinux:latest',
    name: 'Arch Linux',
    description: 'Rolling release para quem gosta de viver no limite.',
    category: 'base'
  },
  {
    ref: 'rockylinux:9',
    name: 'Rocky Linux 9',
    description: 'Compatível com RHEL, foco em servidores.',
    category: 'base'
  },
  {
    ref: 'almalinux:9',
    name: 'AlmaLinux 9',
    description: 'Alternativa comunitária ao RHEL.',
    category: 'base'
  },
  {
    ref: 'busybox:latest',
    name: 'BusyBox',
    description: 'Utilitários Unix essenciais em uma única imagem.',
    category: 'base'
  },
  {
    ref: 'kalilinux/kali-rolling:latest',
    name: 'Kali Linux',
    description: 'Distribuição para testes de segurança.',
    category: 'base'
  },
  {
    ref: 'traefik/whoami:latest',
    name: 'whoami',
    description: 'Servidor de eco HTTP para testar rede e portas.',
    category: 'base',
    ports: ['8080:80']
  },

  // ---------- Linguagens & Runtimes ----------
  {
    ref: 'node:lts',
    name: 'Node.js (LTS)',
    description: 'Runtime JavaScript para apps e builds.',
    category: 'languages'
  },
  { ref: 'python:3', name: 'Python 3', description: 'Runtime Python oficial.', category: 'languages' },
  {
    ref: 'golang:latest',
    name: 'Go',
    description: 'Toolchain Go para compilar e rodar aplicações.',
    category: 'languages'
  },
  { ref: 'rust:latest', name: 'Rust', description: 'Toolchain Rust com cargo.', category: 'languages' },
  {
    ref: 'eclipse-temurin:21',
    name: 'Java 21 (Temurin)',
    description: 'JDK Eclipse Temurin, o OpenJDK de referência.',
    category: 'languages'
  },
  {
    ref: 'php:8-apache',
    name: 'PHP 8 + Apache',
    description: 'PHP com Apache embutido. Porta 80.',
    category: 'languages',
    ports: ['8080:80']
  },
  { ref: 'ruby:latest', name: 'Ruby', description: 'Runtime Ruby oficial.', category: 'languages' },
  {
    ref: 'mcr.microsoft.com/dotnet/sdk:8.0',
    name: '.NET SDK 8',
    description: 'SDK .NET da Microsoft para builds e dev.',
    category: 'languages'
  },
  {
    ref: 'denoland/deno:latest',
    name: 'Deno',
    description: 'Runtime TypeScript/JavaScript seguro por padrão.',
    category: 'languages'
  },
  {
    ref: 'oven/bun:latest',
    name: 'Bun',
    description: 'Runtime JavaScript rápido com bundler embutido.',
    category: 'languages'
  },
  { ref: 'gcc:latest', name: 'GCC', description: 'Toolchain C/C++ GNU.', category: 'languages' },
  {
    ref: 'elixir:latest',
    name: 'Elixir',
    description: 'Elixir sobre a BEAM (Erlang VM).',
    category: 'languages'
  },

  // ---------- Bancos de dados & Busca ----------
  {
    ref: 'postgres:latest',
    name: 'PostgreSQL',
    description: 'Banco relacional avançado. Porta 5432.',
    category: 'databases',
    ports: ['5432:5432'],
    env: ['POSTGRES_PASSWORD=postgres']
  },
  {
    ref: 'mysql:latest',
    name: 'MySQL',
    description: 'Banco relacional. Porta 3306.',
    category: 'databases',
    ports: ['3306:3306'],
    env: ['MYSQL_ROOT_PASSWORD=root']
  },
  {
    ref: 'mariadb:latest',
    name: 'MariaDB',
    description: 'Fork comunitário do MySQL. Porta 3306.',
    category: 'databases',
    ports: ['3306:3306'],
    env: ['MARIADB_ROOT_PASSWORD=root']
  },
  {
    ref: 'mongo:latest',
    name: 'MongoDB',
    description: 'Banco de documentos NoSQL. Porta 27017.',
    category: 'databases',
    ports: ['27017:27017']
  },
  {
    ref: 'couchdb:latest',
    name: 'CouchDB',
    description: 'Banco de documentos com sync. Porta 5984.',
    category: 'databases',
    ports: ['5984:5984'],
    env: ['COUCHDB_USER=admin', 'COUCHDB_PASSWORD=admin']
  },
  {
    ref: 'cassandra:latest',
    name: 'Cassandra',
    description: 'Banco colunar distribuído. Porta 9042.',
    category: 'databases',
    ports: ['9042:9042']
  },
  {
    ref: 'neo4j:latest',
    name: 'Neo4j',
    description: 'Banco de grafos. UI na 7474, Bolt na 7687.',
    category: 'databases',
    ports: ['7474:7474', '7687:7687'],
    env: ['NEO4J_AUTH=neo4j/senha-segura']
  },
  {
    ref: 'influxdb:latest',
    name: 'InfluxDB',
    description: 'Séries temporais. Porta 8086.',
    category: 'databases',
    ports: ['8086:8086']
  },
  {
    ref: 'clickhouse/clickhouse-server:latest',
    name: 'ClickHouse',
    description: 'OLAP colunar ultrarrápido. HTTP na 8123.',
    category: 'databases',
    ports: ['8123:8123']
  },
  {
    ref: 'cockroachdb/cockroach:latest',
    name: 'CockroachDB',
    description: 'SQL distribuído compatível com Postgres.',
    category: 'databases',
    ports: ['26257:26257', '8081:8080']
  },
  {
    ref: 'surrealdb/surrealdb:latest',
    name: 'SurrealDB',
    description: 'Banco multi-modelo moderno. Porta 8000.',
    category: 'databases',
    ports: ['8000:8000']
  },
  {
    ref: 'elasticsearch:8.15.0',
    name: 'Elasticsearch',
    description: 'Busca e análise de texto. Porta 9200.',
    category: 'databases',
    ports: ['9200:9200'],
    env: ['discovery.type=single-node', 'xpack.security.enabled=false']
  },
  {
    ref: 'getmeili/meilisearch:latest',
    name: 'Meilisearch',
    description: 'Busca instantânea leve. Porta 7700.',
    category: 'databases',
    ports: ['7700:7700'],
    env: ['MEILI_MASTER_KEY=chave-mestra']
  },
  {
    ref: 'qdrant/qdrant:latest',
    name: 'Qdrant',
    description: 'Banco vetorial para IA/RAG. Porta 6333.',
    category: 'databases',
    ports: ['6333:6333']
  },
  {
    ref: 'chromadb/chroma:latest',
    name: 'Chroma',
    description: 'Banco vetorial para embeddings. Porta 8000.',
    category: 'databases',
    ports: ['8000:8000']
  },

  // ---------- Web & Proxy ----------
  {
    ref: 'nginx:latest',
    name: 'NGINX',
    description: 'Servidor web e proxy reverso. Porta 80.',
    category: 'web',
    ports: ['8080:80']
  },
  {
    ref: 'httpd:latest',
    name: 'Apache httpd',
    description: 'Servidor web Apache. Porta 80.',
    category: 'web',
    ports: ['8080:80']
  },
  {
    ref: 'caddy:latest',
    name: 'Caddy',
    description: 'Servidor web com HTTPS automático. Porta 80.',
    category: 'web',
    ports: ['8080:80']
  },
  {
    ref: 'traefik:latest',
    name: 'Traefik',
    description: 'Proxy reverso cloud-native. Dashboard na 8080.',
    category: 'web',
    ports: ['8090:8080']
  },
  { ref: 'haproxy:latest', name: 'HAProxy', description: 'Balanceador de carga TCP/HTTP.', category: 'web' },
  {
    ref: 'varnish:latest',
    name: 'Varnish',
    description: 'Cache HTTP de alta performance. Porta 80.',
    category: 'web',
    ports: ['8080:80']
  },

  // ---------- Mensageria & Cache ----------
  {
    ref: 'redis:latest',
    name: 'Redis',
    description: 'Cache e store chave-valor em memória. Porta 6379.',
    category: 'messaging',
    ports: ['6379:6379']
  },
  {
    ref: 'valkey/valkey:latest',
    name: 'Valkey',
    description: 'Fork aberto do Redis (Linux Foundation).',
    category: 'messaging',
    ports: ['6379:6379']
  },
  {
    ref: 'memcached:latest',
    name: 'Memcached',
    description: 'Cache distribuído em memória. Porta 11211.',
    category: 'messaging',
    ports: ['11211:11211']
  },
  {
    ref: 'rabbitmq:management',
    name: 'RabbitMQ',
    description: 'Broker AMQP. UI de gestão na 15672.',
    category: 'messaging',
    ports: ['5672:5672', '15672:15672']
  },
  {
    ref: 'apache/kafka:latest',
    name: 'Kafka',
    description: 'Streaming de eventos (modo KRaft). Porta 9092.',
    category: 'messaging',
    ports: ['9092:9092']
  },
  {
    ref: 'nats:latest',
    name: 'NATS',
    description: 'Mensageria leve e rápida. Porta 4222.',
    category: 'messaging',
    ports: ['4222:4222']
  },
  {
    ref: 'eclipse-mosquitto:latest',
    name: 'Mosquitto',
    description: 'Broker MQTT para IoT. Porta 1883.',
    category: 'messaging',
    ports: ['1883:1883']
  },

  // ---------- DevOps & Ferramentas ----------
  {
    ref: 'jenkins/jenkins:lts',
    name: 'Jenkins',
    description: 'Automação de CI/CD. Porta 8080.',
    category: 'devops',
    ports: ['8085:8080']
  },
  {
    ref: 'gitea/gitea:latest',
    name: 'Gitea',
    description: 'Git self-hosted leve. Porta 3000.',
    category: 'devops',
    ports: ['3000:3000']
  },
  {
    ref: 'sonarqube:community',
    name: 'SonarQube',
    description: 'Qualidade e análise de código. Porta 9000.',
    category: 'devops',
    ports: ['9000:9000']
  },
  {
    ref: 'registry:2',
    name: 'Docker Registry',
    description: 'Registry de imagens self-hosted. Porta 5000.',
    category: 'devops',
    ports: ['5000:5000']
  },
  {
    ref: 'localstack/localstack:latest',
    name: 'LocalStack',
    description: 'AWS local para desenvolvimento. Porta 4566.',
    category: 'devops',
    ports: ['4566:4566']
  },
  {
    ref: 'hashicorp/vault:latest',
    name: 'Vault',
    description: 'Gestão de segredos. Porta 8200.',
    category: 'devops',
    ports: ['8200:8200'],
    env: ['VAULT_DEV_ROOT_TOKEN_ID=root']
  },
  {
    ref: 'minio/minio:latest',
    name: 'MinIO',
    description: 'Object storage S3-compatível. API 9000, UI 9001.',
    category: 'devops',
    ports: ['9000:9000', '9001:9001'],
    env: ['MINIO_ROOT_USER=admin', 'MINIO_ROOT_PASSWORD=senha-segura']
  },
  {
    ref: 'codercom/code-server:latest',
    name: 'code-server',
    description: 'VS Code no navegador. Porta 8080.',
    category: 'devops',
    ports: ['8443:8080'],
    env: ['PASSWORD=senha-segura']
  },

  // ---------- Monitoramento ----------
  {
    ref: 'prom/prometheus:latest',
    name: 'Prometheus',
    description: 'Coleta e consulta de métricas. Porta 9090.',
    category: 'monitoring',
    ports: ['9090:9090']
  },
  {
    ref: 'grafana/grafana:latest',
    name: 'Grafana',
    description: 'Dashboards de métricas e logs. Porta 3000.',
    category: 'monitoring',
    ports: ['3001:3000']
  },
  {
    ref: 'netdata/netdata:latest',
    name: 'Netdata',
    description: 'Monitoramento em tempo real. Porta 19999.',
    category: 'monitoring',
    ports: ['19999:19999']
  },
  {
    ref: 'louislam/uptime-kuma:latest',
    name: 'Uptime Kuma',
    description: 'Monitor de uptime bonito. Porta 3001.',
    category: 'monitoring',
    ports: ['3001:3001']
  },

  // ---------- IA & Ciência de dados ----------
  {
    ref: 'pytorch/pytorch:latest',
    name: 'PyTorch',
    description: 'ML com CUDA, combine com GPU.',
    category: 'ai',
    gpus: true
  },
  {
    ref: 'tensorflow/tensorflow:latest-gpu',
    name: 'TensorFlow (GPU)',
    description: 'ML com aceleração CUDA.',
    category: 'ai',
    gpus: true
  },
  {
    ref: 'ollama/ollama:latest',
    name: 'Ollama',
    description: 'LLMs locais (Llama, Mistral…). Porta 11434.',
    category: 'ai',
    ports: ['11434:11434'],
    gpus: true
  },
  {
    ref: 'ghcr.io/open-webui/open-webui:main',
    name: 'Open WebUI',
    description: 'Chat web para LLMs locais (Ollama).',
    category: 'ai',
    ports: ['3002:8080']
  },
  {
    ref: 'jupyter/base-notebook:latest',
    name: 'Jupyter Notebook',
    description: 'Notebooks Python no navegador. Porta 8888.',
    category: 'ai',
    ports: ['8888:8888']
  },

  // ---------- Apps prontos ----------
  {
    ref: 'wordpress:latest',
    name: 'WordPress',
    description: 'CMS mais usado do mundo (requer MySQL).',
    category: 'apps',
    ports: ['8080:80']
  },
  {
    ref: 'ghost:latest',
    name: 'Ghost',
    description: 'Plataforma de publicação moderna. Porta 2368.',
    category: 'apps',
    ports: ['2368:2368']
  },
  {
    ref: 'nextcloud:latest',
    name: 'Nextcloud',
    description: 'Nuvem privada de arquivos. Porta 80.',
    category: 'apps',
    ports: ['8080:80']
  },
  {
    ref: 'n8nio/n8n:latest',
    name: 'n8n',
    description: 'Automação de workflows low-code. Porta 5678.',
    category: 'apps',
    ports: ['5678:5678']
  },
  {
    ref: 'vaultwarden/server:latest',
    name: 'Vaultwarden',
    description: 'Servidor Bitwarden leve. Porta 80.',
    category: 'apps',
    ports: ['8080:80']
  },
  {
    ref: 'jellyfin/jellyfin:latest',
    name: 'Jellyfin',
    description: 'Servidor de mídia livre. Porta 8096.',
    category: 'apps',
    ports: ['8096:8096']
  },
  {
    ref: 'homeassistant/home-assistant:stable',
    name: 'Home Assistant',
    description: 'Automação residencial. Porta 8123.',
    category: 'apps',
    ports: ['8123:8123']
  },
  {
    ref: 'adguard/adguardhome:latest',
    name: 'AdGuard Home',
    description: 'Bloqueio de anúncios via DNS. UI na 3000.',
    category: 'apps',
    ports: ['3003:3000']
  },
  {
    ref: 'pihole/pihole:latest',
    name: 'Pi-hole',
    description: 'DNS sinkhole para bloquear anúncios.',
    category: 'apps',
    ports: ['8080:80'],
    env: ['WEBPASSWORD=senha-segura']
  },
  {
    ref: 'filebrowser/filebrowser:latest',
    name: 'File Browser',
    description: 'Gerenciador de arquivos web. Porta 80.',
    category: 'apps',
    ports: ['8080:80']
  },
  {
    ref: 'corentinth/it-tools:latest',
    name: 'IT Tools',
    description: 'Caixa de ferramentas para devs. Porta 80.',
    category: 'apps',
    ports: ['8080:80']
  },
  {
    ref: 'excalidraw/excalidraw:latest',
    name: 'Excalidraw',
    description: 'Quadro branco colaborativo. Porta 80.',
    category: 'apps',
    ports: ['8080:80']
  },
  {
    ref: 'lscr.io/linuxserver/webtop:ubuntu-kde',
    name: 'Webtop (KDE)',
    description: 'Desktop Linux completo no navegador. Porta 3000.',
    category: 'apps',
    ports: ['3000:3000']
  }
]

/** Busca a entrada do catálogo para uma referência de imagem. */
export function catalogEntry(ref: string): CatalogImage | undefined {
  return IMAGE_CATALOG.find((item) => item.ref === ref)
}
