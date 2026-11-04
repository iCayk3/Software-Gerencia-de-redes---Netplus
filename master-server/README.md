# NetPulse Central Master Server

Servidor centralizado de **emissão de licenças criptográficas**, controle de capacidade de roteadores e **acompanhamento de frota em tempo real (Fleet Tracking)** para instalações On-Premise do NetPulse em provedores de internet (ISPs).

---

## 🌟 Recursos Principais

1. **Dashboard Web Integrado (Zero Dependências Externas):**
   - Binário compilado único em Go com interface gráfica Tailwind/HTML5 embutida.
   - Visão em tempo real de quem está online, roteadores monitorados, uptime e versões ativas.
2. **Emissão e Gestão de Licenças:**
   - Emissão de novas chaves com 1 clique (`NP-PRO-10DEV-XXXX-2027`).
   - Planos flexíveis: **Trial**, **Starter**, **Pro ISP** e **Enterprise** (sem limite de roteadores).
   - Renovação rápida (+30 dias ou +1 ano) e suspensão/bloqueio remoto de inadimplentes.
3. **Protocolo de Heartbeat Leve (`POST /api/v1/heartbeat`):**
   - As instâncias NetPulse Edge nos provedores enviam telemetria segura periodicamente.
   - O Master responde com as capacidades ativas e status da licença.
   - Suporte a **Tolerância Offline (Offline Grace Period)** de até 14 dias para o provedor não parar mesmo sem internet.

---

## 🚀 Como Executar na sua VPS / Nuvem

### 1. Usando Docker Compose (Recomendado)

```bash
# Na pasta master-server:
cp .env.example .env

# Altere a senha no .env se desejar
docker compose up -d --build
```

O painel estará disponível em:
👉 **`http://seu-ip-ou-dominio:8090`**

### 2. Executando Diretamente o Binário Go

```bash
cd master-server
go run .
# Ou compile o binário:
go build -o master.bin .
./master.bin
```

---

## 🔗 Como Conectar uma Instância de Provedor ao Master

No servidor do provedor (NetPulse Edge), adicione a variável no `.env`:

```env
MASTER_SERVER_URL=https://master.seusite.com.br
```

Assim que a instância do provedor iniciar, ela se conectará automaticamente ao seu Master Server e aparecerá na lista de instâncias ativas do seu painel!
