#!/usr/bin/env bash
# ==============================================================================
# NetPulse Enterprise - Script de Instalação e Inicialização para Servidor Linux
# Suporta: Ubuntu, Debian, AlmaLinux, Rocky Linux, RHEL, Fedora
# ==============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}====================================================================${NC}"
echo -e "${CYAN}   🚀 NetPulse B2B Enterprise - Instalador de Servidor Linux        ${NC}"
echo -e "${CYAN}====================================================================${NC}"

# 1. Verificar privilégios de root / sudo
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}❌ Por favor, execute este script como root ou com sudo:${NC}"
  echo "   sudo bash $0"
  exit 1
fi

# 2. Detectar Sistema Operacional
if [ -f /etc/os-release ]; then
  . /etc/os-release
  OS=$ID
  VERSION=$VERSION_ID
else
  echo -e "${RED}❌ Não foi possível determinar a distribuição Linux (/etc/os-release não encontrado).${NC}"
  exit 1
fi

echo -e "${BLUE}ℹ️  Distribuição detectada: ${OS} (${VERSION})${NC}"

# 3. Instalar Docker caso não esteja instalado
install_docker() {
  echo -e "${YELLOW}📦 Instalando Docker e Docker Compose...${NC}"
  case "$OS" in
    ubuntu|debian)
      apt-get update -y
      apt-get install -y ca-certificates curl gnupg lsb-release
      mkdir -p /etc/apt/keyrings
      curl -fsSL https://download.docker.com/linux/$OS/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg --yes
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
      apt-get update -y
      apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      ;;
    centos|rhel|almalinux|rocky)
      yum install -y yum-utils
      yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      systemctl enable --now docker
      ;;
    fedora)
      dnf -y install dnf-plugins-core
      dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
      dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      systemctl enable --now docker
      ;;
    *)
      echo -e "${RED}Distribuição não reconhecida automaticamente para instalar Docker. Instale o Docker manualmente e execute o script novamente.${NC}"
      exit 1
      ;;
  esac
}

if ! command -v docker &> /dev/null; then
  install_docker
else
  echo -e "${GREEN}✅ Docker já instalado: $(docker --version)${NC}"
fi

# Iniciar serviço do Docker
systemctl start docker
systemctl enable docker

# 4. Validar Docker Compose
if ! docker compose version &> /dev/null; then
  echo -e "${YELLOW}Instalando docker-compose-plugin...${NC}"
  if [ "$OS" = "ubuntu" ] || [ "$OS" = "debian" ]; then
    apt-get update -y && apt-get install -y docker-compose-plugin
  else
    yum install -y docker-compose-plugin || true
  fi
fi

# 5. Criar arquivo .env se não existir
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo -e "${YELLOW}⚙️  Gerando arquivo de configuração .env com credenciais seguras...${NC}"
  DB_PASS=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 20 ; echo '')
  JWT_KEY=$(head /dev/urandom | tr -dc A-Za-z0-9 | head -c 32 ; echo '')
  cat <<EOF > .env
POSTGRES_DB=netpulse
POSTGRES_USER=netpulse
POSTGRES_PASSWORD=${DB_PASS}
DATABASE_URL=postgres://netpulse:${DB_PASS}@localhost:5432/netpulse?sslmode=disable
JWT_SECRET=${JWT_KEY}
PORT=8080
EOF
  echo -e "${GREEN}✅ Arquivo .env gerado com sucesso!${NC}"
else
  echo -e "${BLUE}ℹ️  Arquivo .env já existente preservado.${NC}"
fi

# 6. Subir PostgreSQL no Docker
echo -e "${YELLOW}🐳 Subindo PostgreSQL via Docker Compose...${NC}"
docker compose up -d postgres

# 7. Aguardar PostgreSQL estar pronto (Healthcheck)
echo -n "⏳ Aguardando banco de dados inicializar..."
for i in {1..30}; do
  if docker exec netpulse_postgres pg_isready -U netpulse -d netpulse >/dev/null 2>&1; then
    echo -e " ${GREEN}Pronto!${NC}"
    break
  fi
  echo -n "."
  sleep 1
done

# 8. Mensagem de Conclusão com Credenciais
echo ""
echo -e "${GREEN}====================================================================${NC}"
echo -e "${GREEN}   🎉 NetPulse B2B Enterprise instalado e pronto para rodar!        ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo ""
echo -e "${CYAN}📌 Status dos Containers:${NC}"
docker compose ps
echo ""
echo -e "${CYAN}🔑 Usuários Padrão para Demonstração e Teste:${NC}"
echo -e "   👑 ${YELLOW}Administrador:${NC} admin@netpulse.com       / admin123"
echo -e "   🛠️ ${YELLOW}Operador NOC:${NC}  operador@netpulse.com    / operador123"
echo -e "   👁️ ${YELLOW}Visualizador:${NC}  diretoria@netpulse.com   / diretoria123"
echo ""
echo -e "${CYAN}Para subir o backend Go na máquina:${NC}"
echo "   export DATABASE_URL=\"postgres://netpulse:\$(grep POSTGRES_PASSWORD .env | cut -d= -f2)@localhost:5432/netpulse?sslmode=disable\""
echo "   cd backend && go run ./cmd/api"
echo ""
