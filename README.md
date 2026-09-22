# NetPulse - Gerenciador de Roteamento BGP & OSPF (Huawei, Datacom, MikroTik)

Plataforma full-stack em **Go** e **React** projetada para provedores (ISPs) e redes corporativas para monitorar, diagnosticar e gerenciar sessões **BGP** e vizinhanças **OSPF** através de conexões diretas via **SSH** com as fabricantes:

- **Huawei (VRP)**: Roteadores de Borda (NE8000 F1A, NE40) e Switches Core (Série CloudEngine / S6730).
- **Datacom (DmOS Moderno)**: Switches e Roteadores com sistema operacional DmOS.
- **MikroTik (RouterOS v6 & v7)**: Roteadores CCR e x86 com seleção da versão no cadastro.

---

## 🛠️ Arquitetura do Sistema

```text
Projeto software de redes/
├── backend/
│   ├── cmd/
│   │   └── api/
│   │       └── main.go          # Ponto de entrada do servidor Go
│   ├── internal/
│   │   ├── api/                 # Handlers HTTP, middlewares de CORS/Log e roteador
│   │   ├── drivers/             # Drivers por fabricante (Huawei, Datacom, MikroTik v6/v7)
│   │   ├── models/              # Estruturas de dados (Devices, BGPSession, OSPFNeighbor)
│   │   ├── network/             # Lógica de diagnóstico (Ping, Scanner de portas, DNS)
│   │   ├── sshclient/           # Motor SSH (ciphers amplos, timeouts, pty, sessões interativas)
│   │   └── storage/             # Armazenamento thread-safe do inventário em JSON
│   ├── go.mod
│   └── go.sum
├── data/
│   └── devices.json             # Inventário persistido de equipamentos e credenciais
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx           # Barra superior com status live do backend e abas
│   │   │   ├── DeviceManager.tsx    # Cadastro, edição e teste de conexão SSH
│   │   │   ├── BGPManager.tsx       # Painel de sessões BGP, estados e contadores
│   │   │   ├── OSPFManager.tsx      # Painel de vizinhos OSPF, áreas e papéis DR/BDR
│   │   │   ├── TerminalView.tsx     # Console CLI direto com atalhos por fabricante
│   │   │   └── DiagnosticsView.tsx  # Ferramentas auxiliares (Ping, Portas, DNS)
│   │   ├── services/
│   │   │   └── api.ts               # Cliente HTTP e tipagens TypeScript
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

---

## 🚀 Como Iniciar

Abra dois terminais na pasta raiz do projeto:

### 1. Iniciar o Backend (Go)

```powershell
cd backend
go run ./cmd/api
```
*(Inicia o servidor na porta `8080`)*

### 2. Iniciar o Frontend (React)

```powershell
cd frontend
npm run dev
```
*(Acesse o painel no navegador em `http://localhost:5173`)*

---

## 📡 Recursos Implementados

### 1. Inventário de Equipamentos (`/api/devices`)
- Cadastro com Nome, IP/Host, Porta SSH (padrão 22), Fabricante e Modelo.
- Botão **"Testar SSH"**: Realiza handshake SSH, mede a latência em milissegundos e captura a versão do banner do roteador.
- Atalho para abrir direto no Terminal SSH ou no painel BGP.

### 2. Painel BGP (`/api/devices/{id}/bgp` & `/api/bgp/all`)
- Visualização de todas as sessões BGP ou filtradas por equipamento.
- Métricas: Total de Peers, Estabelecidas, Sessões Caídas/Em Alerta e Total de Prefixos Recebidos.
- Filtros rápidos por estado: *Todas*, *Estabelecidas*, *Caídas / Idle*.
- Visualizador da linha original da CLI (`raw_output`) para auditoria técnica.

### 3. Painel OSPF (`/api/devices/{id}/ospf` & `/api/ospf/all`)
- Adjacências OSPF por roteador: Router-ID do vizinho, IP, Interface, Área OSPF.
- Detecção de papéis: `DR`, `BDR`, `DROther` ou `Point-to-Point`.
- Indicadores visuais de estado: `Full` (verde), `2-Way`, `Init` (alerta).

### 4. Terminal e Console SSH Direto (`/api/devices/{id}/exec`)
- Execução de comandos ad-hoc em tempo real no equipamento selecionado.
- Botões de atalho rápido específicos por fabricante:
  - **Huawei**: `display bgp peer`, `display ospf peer brief`, `display ip routing-table`, `display interface brief`, `display cpu-usage`
  - **Datacom**: `show ip bgp summary`, `show ip ospf neighbor`, `show ip route`, `show interface brief`, `show system resources`
  - **MikroTik v7**: `/routing/bgp/session/print detail without-paging`, `/routing/ospf/neighbor/print detail without-paging`, `/ip/route/print without-paging`
  - **MikroTik v6**: `/routing bgp peer print status without-paging`, `/routing ospf neighbor print without-paging`
- Desativação automática de paginação de terminal (`screen-length 0 temporary` e `terminal length 0`).

### 5. Diagnósticos Auxiliares
- Ping ICMP/TCP contínuo ou pontual com histórico de latência.
- Scanner de portas TCP concorrente.
- Resolução de registros DNS (A, AAAA, MX, TXT, CNAME).

### 6. Motor de Telemetria & Detecção de Anomalias (`/api/telemetry/*` & `/api/alerts`)
- **Coletor em Segundo Plano (*Background Collector*):** Ciclos periódicos de leitura concorrente (padrão a cada 45s) com cache em memória para navegação instantânea.
- **Detecção Automática de Falhas:**
  - Queda de roteadores (*Device Offline*).
  - Queda de sessões BGP (*BGP Peer Down / Flap*).
  - Queda de prefixos recebidos para 0 (*Prefix Drop*).
  - Queda de adjacências OSPF (*OSPF Down / Init*).
  - Auto-recuperação (*Auto-resolve*): o alerta é marcado como resolvido automaticamente assim que o peer/link normaliza.
- **Servidor Syslog UDP Embutido (Porta 1514):**
  - Ouve notificações de queda e restabelecimento enviadas diretamente pelos roteadores Huawei, Datacom e MikroTik em tempo real.
- **Central de Alertas no Frontend:**
  - Badge dinâmico de alertas ativos no cabeçalho com indicador pulsante.
  - Filtro por estado (Ativos, Reconhecidos, Resolvidos, Todos).
  - Botão para o operador **"Reconhecer" (Ack)** o alerta.
  - Gráfico de tendência temporal de prefixos e peers BGP.
  - Guia rápido integrado com comandos prontos de configuração Syslog por fabricante.

