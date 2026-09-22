# Manual Técnico & Padrão de Engenharia de Tráfego BGP Multi-Fabricante
## Arquitetura de Community Tagging de Origem & AS-Path Prepend Controlado

Este documento estabelece o padrão de arquitetura de **Engenharia de Tráfego de Download (Inbound Traffic Engineering)** baseado no modelo em 3 camadas implantado no AS 267943. Ele fornece templates de configuração prontos para produção em todos os principais fabricantes de roteadores de borda do mercado de telecomunicações.

---

## 1. Visão Geral da Arquitetura em 3 Camadas

Em roteadores de alta performance, alterar diretamente o `route-policy` ou `route-map` na saída de um trânsito IP pode causar oscilações, inconsistências operacionais ou exigir alterações manuais complexas em múltiplos pontos da rede.

A **Arquitetura em 3 Camadas de Tagging** resolve isso desacoplando o anúncio da rota da política de saída do peer:

```
[Bloco IP Anunciado (ex: 45.166.28.0/22)]
                  │
                  ▼
  ┌────────────────────────────────────────────────────────┐
  │ Camada 1: RP-TAG-ORIGIN (Política de Origem)           │
  │ Marca tags de controle internas por bloco IP:          │
  │ • SEA 0P (Primário)  -> 1:20030                        │
  │ • PTT-BSB 2x Prepend -> 1:40002                        │
  │ • PTT-SP Bloqueado   -> 0:41000                        │
  └────────────────────────────────────────────────────────┘
                  │
                  ▼
  ┌────────────────────────────────────────────────────────┐
  │ Camada 2: Políticas de Exportação por Peer (FIXAS)     │
  │ Nunca são editadas no dia a dia. Apenas lêem as tags:  │
  │ • Match 0:XXXX0 -> Deny (Bloqueio)                     │
  │ • Match 1:XXXX3 -> Permit + Prepend 3x (3P)            │
  │ • Match 1:XXXX2 -> Permit + Prepend 2x (2P)            │
  │ • Match 1:XXXX1 -> Permit + Prepend 1x (1P)            │
  │ • Match 1:XXXX0 -> Permit + 0 Prepend (Primário)       │
  └────────────────────────────────────────────────────────┘
                  │
                  ▼
  ┌────────────────────────────────────────────────────────┐
  │ Camada 3: Filtro de Remoção de Comunidades Internas    │
  │ Remove todas as tags ^(1|0): e tags de gerência        │
  │ para que nenhuma comunidade privada vaze para a internet│
  └────────────────────────────────────────────────────────┘
                  │
                  ▼
          [Internet / Upstream]
```

### Vantagens Desta Abordagem:
1. **Zero Flap**: Toda alteração é feita na política de origem e propagada via soft-refresh (**RFC 2918 BGP Route Refresh**), sem reiniciar nenhuma sessão BGP.
2. **Ponto Único de Configuração**: Para mudar o prepend de um bloco para todos os upstreams ou para um upstream específico, altera-se apenas uma linha no nó correspondente na política de origem.
3. **Imutabilidade das Políticas dos Peers**: As políticas de exportação dos trânsitos e IXs permanecem estáticas e seguras.
4. **Proteção Anti-Vazamento**: As comunidades de engenharia de tráfego são purgadas no momento da saída para os peers externos.

---

## 2. Matriz Padrão de Comunidades BGP (Topologia Dual-BGP AS 267943)

A convenção adota uma base numérica para identificar a operadora/IX (`<BASE>`), prefixada por `1:` para prepend e `0:` para bloqueio:

| Prefixo | Significado | Comportamento BGP |
| :--- | :--- | :--- |
| `1:<BASE>0` | Primário (0 Prepend) | Anuncia sem saltos adicionais (Caminho mais atrativo) |
| `1:<BASE>1` | 1x Prepend (1P) | Adiciona 1 salto AS local no AS-Path |
| `1:<BASE>2` | 2x Prepend (2P) | Adiciona 2 saltos AS locais no AS-Path |
| `1:<BASE>3` | 3x Prepend (3P) | Adiciona 3 saltos AS locais no AS-Path (Rota de backup) |
| `0:<BASE>0` | Bloqueio Seletivo | Descarta o anúncio (`deny` / `reject`) para aquele peer |

---

### 2.1. Tabela Consolidada de Comunidades por Roteador

#### Roteador BGP 1 (`BGP-RT.01.PA.PIRB.01`):
| Upstream / Peer | Tipo | Base | Primário (0P) | 1x Prepend | 2x Prepend | 3x Prepend | Bloqueio (Deny) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **SEA Telecom** | Trânsito IP | `2003` | `1:20030` | `1:20031` | `1:20032` | `1:20033` | `0:20030` |
| **PTT Brasília** | IX / PTT | `4000` | `1:40000` | `1:40001` | `1:40002` | `1:40003` | `0:40000` |

#### Roteador BGP 2 (`BGP-RT.02.PA.PMVR.01`):
| Upstream / Peer | Tipo | Base | Primário (0P) | 1x Prepend | 2x Prepend | 3x Prepend | Bloqueio (Deny) |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Wiki Telecom** | Trânsito IP | `2002` | `1:20020` | `1:20021` | `1:20022` | `1:20023` | `0:20020` |
| **PTT São Paulo** | IX / PTT | `4100` | `1:41000` | `1:41001` | `1:41002` | `1:41003` | `0:41000` |
| **PTT Fortaleza (CE)** | IX / PTT | `4400` | `1:44000` | `1:44001` | `1:44002` | `1:44003` | `0:44000` |
| **PTT Belém (PA)** | IX / PTT | `4500` | `1:45000` | `1:45001` | `1:45002` | `1:45003` | `0:45000` |
| **PTT Campinas (SP)** | IX / PTT | `4300` | `1:43000` | `1:43001` | `1:43002` | `1:43003` | `0:43000` |

---

### 2.2. Comunidades Macro & Globais (Ambos os Roteadores)

As comunidades macro permitem controlar múltiplos peers simultaneamente sem precisar listar cada um:

| Comunidade Macro | Escopo | Ação |
| :--- | :--- | :--- |
| `1:10000` | **Global (Todos os Peers)** | Libera o anúncio como Primário (0 Prepend) em **TODAS** as saídas da rede |
| `0:10000` | **Global (Todos os Peers)** | Bloqueia o anúncio em **TODAS** as saídas da rede |
| `1:20000` | **Macro Trânsito IP** | Libera como Primário em todos os Trânsitos IP (SEA e Wiki) |
| `0:20000` | **Macro Trânsito IP** | Bloqueia o anúncio em todos os Trânsitos IP |
| `1:40000` | **Macro IXs / PTTs** | Libera como Primário em todos os PTTs (Brasília, SP, Fortaleza, Belém) |
| `0:40000` | **Macro IXs / PTTs** | Bloqueia o anúncio em todos os PTTs |

> [!TIP]
> **Exemplo Prático de Agilidade no BGP2**:
> No roteador BGP2, configurar na origem `apply community 1:10000` faz com que o bloco saia como primário no Wiki Telecom, PTT-SP, PTT-CE e PTT-BEL com uma única instrução!

---

### 2.3. Interconexão iBGP entre os Roteadores (`IBGP-PRB-PMV`)

Para que os dois roteadores operem em redundância mútua sem loop e sem vazamento de tags internas:

1. **Local-Preference Elevado no iBGP**:
   - Rotas recebidas do parceiro de iBGP recebem `apply local-preference 1000` (garantindo que se a saída local de um BGP falhar, o tráfego transite internamente até o outro BGP).
2. **Identificação de Clientes / Rotas Internas**:
   - IPv4: `65004:110`
   - IPv6: `65007:110`
3. **Filtro Avançado de Limpeza Externa (`INTERNAL-TE`)**:
   - `ip community-filter advanced INTERNAL-TE permit ^(1|0|65004|65007):`
   - Em todas as saídas eBGP (Trânsitos e PTTs), o roteador aplica `apply comm-filter INTERNAL-TE delete`, garantindo que **nenhuma** tag de engenharia de tráfego interna (`1:`, `0:`, `65004:`, `65007:`) escape para a internet.

---

## 3. Implementação por Fabricante

---

### 3.1. HUAWEI (VRP8 / VRP5 - NetEngine, NE40E, NE8000, NE20E)

#### A. Criação dos Prefix-Lists
```text
ip ip-prefix EXACT-V4-2228 index 10 permit 45.166.28.0 22
ip ip-prefix EXACT-V4-2824 index 10 permit 45.166.28.0 24
ip ip-prefix EXACT-V4-2924 index 10 permit 45.166.29.0 24
```

#### B. Criação dos Community-Filters (Templates para BGP1 e BGP2)
```text
# ==========================================
# Comunidades Macro Globais
# ==========================================
ip community-filter basic MATCH-GLOBAL-PRIMARY permit 1:10000
ip community-filter basic MATCH-GLOBAL-BLOCK permit 0:10000
ip community-filter basic MATCH-TRANSIT-PRIMARY permit 1:20000
ip community-filter basic MATCH-TRANSIT-BLOCK permit 0:20000
ip community-filter basic MATCH-PTT-PRIMARY permit 1:40000
ip community-filter basic MATCH-PTT-BLOCK permit 0:40000

# ==========================================
# BGP1: SEA Telecom (Base 2003) & PTT Brasília (Base 4000)
# ==========================================
ip community-filter basic MATCH-SEA-PRIMARY permit 1:20030
ip community-filter basic MATCH-SEA-1P permit 1:20031
ip community-filter basic MATCH-SEA-2P permit 1:20032
ip community-filter basic MATCH-SEA-3P permit 1:20033
ip community-filter basic MATCH-SEA-BLOCK permit 0:20030

ip community-filter basic MATCH-PTTBRA-PRIMARY permit 1:40000
ip community-filter basic MATCH-PTTBRA-1P permit 1:40001
ip community-filter basic MATCH-PTTBRA-2P permit 1:40002
ip community-filter basic MATCH-PTTBRA-3P permit 1:40003
ip community-filter basic MATCH-PTTBRA-BLOCK permit 0:40000

# ==========================================
# BGP2: Wiki Telecom (Base 2002)
# ==========================================
ip community-filter basic MATCH-WIKI-PRIMARY permit 1:20020
ip community-filter basic MATCH-WIKI-PRIMARY permit 1:20000
ip community-filter basic MATCH-WIKI-PRIMARY permit 1:10000
ip community-filter basic MATCH-WIKI-1P permit 1:20021
ip community-filter basic MATCH-WIKI-2P permit 1:20022
ip community-filter basic MATCH-WIKI-3P permit 1:20023
ip community-filter basic MATCH-WIKI-BLOCK permit 0:20020
ip community-filter basic MATCH-WIKI-BLOCK permit 0:20000
ip community-filter basic MATCH-WIKI-BLOCK permit 0:10000

# ==========================================
# BGP2: PTT Belém (Base 4500)
# ==========================================
ip community-filter basic MATCH-PTTBEL-PRIMARY permit 1:45000
ip community-filter basic MATCH-PTTBEL-PRIMARY permit 1:40000
ip community-filter basic MATCH-PTTBEL-PRIMARY permit 1:10000
ip community-filter basic MATCH-PTTBEL-1P permit 1:45001
ip community-filter basic MATCH-PTTBEL-2P permit 1:45002
ip community-filter basic MATCH-PTTBEL-3P permit 1:45003
ip community-filter basic MATCH-PTTBEL-BLOCK permit 0:45000
ip community-filter basic MATCH-PTTBEL-BLOCK permit 0:40000
ip community-filter basic MATCH-PTTBEL-BLOCK permit 0:10000

# ==========================================
# BGP2: PTT Ceará / Fortaleza (Base 4400)
# ==========================================
ip community-filter basic MATCH-PTTCE-PRIMARY permit 1:44000
ip community-filter basic MATCH-PTTCE-PRIMARY permit 1:40000
ip community-filter basic MATCH-PTTCE-PRIMARY permit 1:10000
ip community-filter basic MATCH-PTTCE-1P permit 1:44001
ip community-filter basic MATCH-PTTCE-2P permit 1:44002
ip community-filter basic MATCH-PTTCE-3P permit 1:44003
ip community-filter basic MATCH-PTTCE-BLOCK permit 0:44000
ip community-filter basic MATCH-PTTCE-BLOCK permit 0:40000
ip community-filter basic MATCH-PTTCE-BLOCK permit 0:10000

# ==========================================
# BGP2: PTT São Paulo (Base 4100)
# ==========================================
ip community-filter basic MATCH-PTTSP-PRIMARY permit 1:41000
ip community-filter basic MATCH-PTTSP-PRIMARY permit 1:40000
ip community-filter basic MATCH-PTTSP-PRIMARY permit 1:10000
ip community-filter basic MATCH-PTTSP-1P permit 1:41001
ip community-filter basic MATCH-PTTSP-2P permit 1:41002
ip community-filter basic MATCH-PTTSP-3P permit 1:41003
ip community-filter basic MATCH-PTTSP-BLOCK permit 0:41000
ip community-filter basic MATCH-PTTSP-BLOCK permit 0:40000
ip community-filter basic MATCH-PTTSP-BLOCK permit 0:10000

# ==========================================
# Filtro Avançado de Limpeza Anti-Vazamento
# ==========================================
ip community-filter basic INTERNAL-TE permit 267943:1000
ip community-filter advanced INTERNAL-TE permit ^(1|0|65004|65007):
```

#### C. Política de Origem (`RP-TAG-V4-ORIGIN`)
```text
# Exemplo no BGP1 (PIRB):
route-policy RP-TAG-V4-ORIGIN permit node 10
 if-match ip-prefix EXACT-V4-2228
 apply community 267943:1000 1:20030 1:40000 additive

# Exemplo no BGP2 (PMVR):
route-policy RP-TAG-V4-ORIGIN permit node 10
 if-match ip-prefix EXACT-V4-2228
 apply community 1:10000
# (1:10000 libera como primário automaticamente para Wiki, PTT-SP, PTT-CE e PTT-BEL!)
#
route-policy RP-TAG-V4-ORIGIN permit node 40
 if-match ip-prefix EXACT-V4-2824
 apply community 267943:1000 1:20031 1:40000 1:41000 additive
```

#### D. Políticas de Exportação dos Peers (Fixas)
```text
# Política de Saída SEA Telecom
route-policy RP-UPL-SEA-V4-OUT deny node 5
 if-match community-filter MATCH-SEA-BLOCK
#
route-policy RP-UPL-SEA-V4-OUT permit node 10
 if-match community-filter MATCH-SEA-3P
 apply as-path 267943 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-UPL-SEA-V4-OUT permit node 20
 if-match community-filter MATCH-SEA-2P
 apply as-path 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-UPL-SEA-V4-OUT permit node 30
 if-match community-filter MATCH-SEA-1P
 apply as-path 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-UPL-SEA-V4-OUT permit node 40
 if-match community-filter MATCH-SEA-PRIMARY
 apply comm-filter INTERNAL-TE delete
#
# ==========================================
# Políticas de Saída BGP2: Wiki Telecom
# ==========================================
route-policy RP-UPL-WIKI-V4-OUT deny node 5
 if-match community-filter MATCH-WIKI-BLOCK
#
route-policy RP-UPL-WIKI-V4-OUT permit node 10
 if-match community-filter MATCH-WIKI-3P
 apply as-path 267943 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-UPL-WIKI-V4-OUT permit node 20
 if-match community-filter MATCH-WIKI-2P
 apply as-path 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-UPL-WIKI-V4-OUT permit node 30
 if-match community-filter MATCH-WIKI-1P
 apply as-path 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-UPL-WIKI-V4-OUT permit node 40
 if-match community-filter MATCH-WIKI-PRIMARY
 apply comm-filter INTERNAL-TE delete
#
# ==========================================
# Políticas de Saída BGP2: PTT Belém (PA)
# ==========================================
route-policy RP-IX-PTTBEL-V4-OUT deny node 5
 if-match community-filter MATCH-PTTBEL-BLOCK
#
route-policy RP-IX-PTTBEL-V4-OUT permit node 10
 if-match community-filter MATCH-PTTBEL-3P
 apply as-path 267943 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTBEL-V4-OUT permit node 20
 if-match community-filter MATCH-PTTBEL-2P
 apply as-path 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTBEL-V4-OUT permit node 30
 if-match community-filter MATCH-PTTBEL-1P
 apply as-path 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTBEL-V4-OUT permit node 40
 if-match community-filter MATCH-PTTBEL-PRIMARY
 apply comm-filter INTERNAL-TE delete
#
# ==========================================
# Políticas de Saída BGP2: PTT Ceará (CE)
# ==========================================
route-policy RP-IX-PTTCE-V4-OUT deny node 5
 if-match community-filter MATCH-PTTCE-BLOCK
#
route-policy RP-IX-PTTCE-V4-OUT permit node 10
 if-match community-filter MATCH-PTTCE-3P
 apply as-path 267943 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTCE-V4-OUT permit node 20
 if-match community-filter MATCH-PTTCE-2P
 apply as-path 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTCE-V4-OUT permit node 30
 if-match community-filter MATCH-PTTCE-1P
 apply as-path 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTCE-V4-OUT permit node 40
 if-match community-filter MATCH-PTTCE-PRIMARY
 apply comm-filter INTERNAL-TE delete
#
# ==========================================
# Políticas de Saída BGP2: PTT São Paulo (SP)
# ==========================================
route-policy RP-IX-PTTSP-V4-OUT deny node 5
 if-match community-filter MATCH-PTTSP-BLOCK
#
route-policy RP-IX-PTTSP-V4-OUT permit node 10
 if-match community-filter MATCH-PTTSP-3P
 apply as-path 267943 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTSP-V4-OUT permit node 20
 if-match community-filter MATCH-PTTSP-2P
 apply as-path 267943 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTSP-V4-OUT permit node 30
 if-match community-filter MATCH-PTTSP-1P
 apply as-path 267943 additive
 apply comm-filter INTERNAL-TE delete
#
route-policy RP-IX-PTTSP-V4-OUT permit node 40
 if-match community-filter MATCH-PTTSP-PRIMARY
 apply comm-filter INTERNAL-TE delete
```

#### E. Política de Interconexão iBGP (`IBGP-PRB-PMV-IN`)
```text
# Aplicada na entrada da sessão iBGP entre os dois roteadores:
route-policy IBGP-PRB-PMV-IN permit node 10
 if-match ip-prefix ACEITA-IBGP-PRB-PMV
 apply local-preference 1000
 apply community 65004:110 additive
#
# Para IPv6:
route-policy IPV6-IBGP-PRB-PMV-IN permit node 10
 apply local-preference 1000
 apply community 65007:110 additive
```

#### F. Associação no BGP & Anúncio
```text
bgp 267943
 # Injeção dos blocos locais com tagging
 network 45.166.28.0 255.255.252.0 route-policy RP-TAG-V4-ORIGIN
 network 45.166.28.0 255.255.255.0 route-policy RP-TAG-V4-ORIGIN

 # Sessão iBGP com o segundo roteador (ex: BGP2 -> BGP1)
 peer 10.254.254.1 as-number 267943
 peer 10.254.254.1 description IBGP-PMV-PRB
 peer 10.254.254.1 connect-interface LoopBack0
 peer 10.254.254.1 route-policy IBGP-PRB-PMV-IN import
 peer 10.254.254.1 advertise-community

 # Sessões eBGP com Upstreams / PTTs
 peer 187.16.216.X as-number 28573
 peer 187.16.216.X description WIKI-TELECOM
 peer 187.16.216.X route-policy RP-UPL-WIKI-V4-OUT export
 peer 187.16.216.X advertise-community
```

#### G. Comando de Aplicação Zero Flap
```text
refresh bgp all export
```

---

### 3.2. MIKROTIK ROUTEROS v7 (CCR2004, CCR2116, CCR2216, CHR)

#### A. Política de Origem (`bgp-origin-tag`)
```text
/routing/filter/rule/add chain=bgp-origin-tag rule="if (dst == 45.166.28.0/22) { bgp-communities.add 267943:1000; bgp-communities.add 1:20030; bgp-communities.add 1:40000; accept; }"
/routing/filter/rule/add chain=bgp-origin-tag rule="if (dst == 45.166.28.0/24) { bgp-communities.add 267943:1000; bgp-communities.add 1:20031; bgp-communities.add 1:40000; accept; }"
```

#### B. Política de Saída SEA Telecom (`sea-out`)
```text
/routing/filter/rule/add chain=sea-out rule="if (bgp-communities.any 0:20030) { reject; }"
/routing/filter/rule/add chain=sea-out rule="if (bgp-communities.any 1:20033) { set bgp-path.prepend 3; bgp-communities.delete [find where text~\"^(1|0):\"]; accept; }"
/routing/filter/rule/add chain=sea-out rule="if (bgp-communities.any 1:20032) { set bgp-path.prepend 2; bgp-communities.delete [find where text~\"^(1|0):\"]; accept; }"
/routing/filter/rule/add chain=sea-out rule="if (bgp-communities.any 1:20031) { set bgp-path.prepend 1; bgp-communities.delete [find where text~\"^(1|0):\"]; accept; }"
/routing/filter/rule/add chain=sea-out rule="if (bgp-communities.any 1:20030) { bgp-communities.delete [find where text~\"^(1|0):\"]; accept; }"
```

#### C. Associação no BGP & Anúncio
```text
/routing/bgp/connection/set [find name="peer-sea"] output.filter-chain=sea-out
```

#### D. Comando de Aplicação Zero Flap
```text
/routing/bgp/connection/refresh
```

---

### 3.3. MIKROTIK ROUTEROS v6 (CCR1009, CCR1016, CCR1036, CCR1072)

#### A. Política de Origem
```text
/routing filter add chain=bgp-origin-tag prefix=45.166.28.0/22 set-bgp-communities=267943:1000,1:20030,1:40000 action=accept
/routing filter add chain=bgp-origin-tag prefix=45.166.28.0/24 set-bgp-communities=267943:1000,1:20031,1:40000 action=accept
```

#### B. Política de Saída SEA Telecom
```text
/routing filter add chain=sea-out bgp-communities=0:20030 action=discard
/routing filter add chain=sea-out bgp-communities=1:20033 set-bgp-prepend=3 action=accept
/routing filter add chain=sea-out bgp-communities=1:20032 set-bgp-prepend=2 action=accept
/routing filter add chain=sea-out bgp-communities=1:20031 set-bgp-prepend=1 action=accept
/routing filter add chain=sea-out bgp-communities=1:20030 action=accept
```

#### C. Comando de Aplicação Zero Flap
```text
/routing bgp peer refresh-all
```

---

### 3.4. CISCO IOS-XE (ASR 1000, Catalyst 8000, ISR 4000, CSR1000v)

#### A. Prefix-List & Community-Lists
```text
ip prefix-list EXACT-V4-2228 permit 45.166.28.0/22
ip prefix-list EXACT-V4-2824 permit 45.166.28.0/24

ip community-list standard MATCH-SEA-BLOCK permit 0:20030
ip community-list standard MATCH-SEA-3P permit 1:20033
ip community-list standard MATCH-SEA-2P permit 1:20032
ip community-list standard MATCH-SEA-1P permit 1:20031
ip community-list standard MATCH-SEA-PRIMARY permit 1:20030

ip community-list expanded INTERNAL-TE permit ^(1|0):
ip community-list expanded INTERNAL-TE permit 267943:1000
```

#### B. Route-Map de Origem
```text
route-map RP-TAG-V4-ORIGIN permit 10
 match ip address prefix-list EXACT-V4-2228
 set community 267943:1000 1:20030 1:40000 additive
!
route-map RP-TAG-V4-ORIGIN permit 40
 match ip address prefix-list EXACT-V4-2824
 set community 267943:1000 1:20031 1:40000 additive
```

#### C. Route-Map de Exportação SEA Telecom
```text
route-map RP-UPL-SEA-V4-OUT deny 5
 match community MATCH-SEA-BLOCK
!
route-map RP-UPL-SEA-V4-OUT permit 10
 match community MATCH-SEA-3P
 set as-path prepend 267943 267943 267943
 set comm-list INTERNAL-TE delete
!
route-map RP-UPL-SEA-V4-OUT permit 20
 match community MATCH-SEA-2P
 set as-path prepend 267943 267943
 set comm-list INTERNAL-TE delete
!
route-map RP-UPL-SEA-V4-OUT permit 30
 match community MATCH-SEA-1P
 set as-path prepend 267943
 set comm-list INTERNAL-TE delete
!
route-map RP-UPL-SEA-V4-OUT permit 40
 match community MATCH-SEA-PRIMARY
 set comm-list INTERNAL-TE delete
```

#### D. Associação no BGP & Comando Zero Flap
```text
router bgp 267943
 neighbor 170.82.183.217 route-map RP-UPL-SEA-V4-OUT out
 neighbor 170.82.183.217 send-community both
!
# Comando Soft Refresh Zero Flap:
clear ip bgp * soft out
```

---

### 3.5. CISCO IOS-XR (ASR 9000, NCS 5500, NCS 540, 8000 Series)

#### A. Sets & Prefix-Sets
```text
prefix-set EXACT-V4-2228
  45.166.28.0/22
end-set

community-set MATCH-SEA-BLOCK
  0:20030
end-set

community-set MATCH-SEA-3P
  1:20033
end-set

community-set MATCH-SEA-2P
  1:20032
end-set

community-set MATCH-SEA-1P
  1:20031
end-set

community-set MATCH-SEA-PRIMARY
  1:20030
end-set

community-set INTERNAL-TE
  267943:1000,
  1:*,
  0:*
end-set
```

#### B. Route-Policy de Origem & Exportação
```text
route-policy RP-TAG-V4-ORIGIN
  if destination in EXACT-V4-2228 then
    set community (267943:1000, 1:20030, 1:40000) additive
    pass
  endif
end-policy

route-policy RP-UPL-SEA-V4-OUT
  if community matches-any MATCH-SEA-BLOCK then
    drop
  elseif community matches-any MATCH-SEA-3P then
    prepend as-path 267943 3
    delete community in INTERNAL-TE
    pass
  elseif community matches-any MATCH-SEA-2P then
    prepend as-path 267943 2
    delete community in INTERNAL-TE
    pass
  elseif community matches-any MATCH-SEA-1P then
    prepend as-path 267943 1
    delete community in INTERNAL-TE
    pass
  elseif community matches-any MATCH-SEA-PRIMARY then
    delete community in INTERNAL-TE
    pass
  endif
end-policy
```

#### C. Comando Soft Refresh Zero Flap
```text
clear bgp * soft out
```

---

### 3.6. JUNIPER JUNOS (MX204, MX480, MX960, PTX, vMX)

#### A. Definição de Comunidades & Prefix-Lists
```text
set policy-options prefix-list EXACT-V4-2228 45.166.28.0/22
set policy-options prefix-list EXACT-V4-2824 45.166.28.0/24

set policy-options community MATCH-SEA-BLOCK members 0:20030
set policy-options community MATCH-SEA-3P members 1:20033
set policy-options community MATCH-SEA-2P members 1:20032
set policy-options community MATCH-SEA-1P members 1:20031
set policy-options community MATCH-SEA-PRIMARY members 1:20030

set policy-options community INTERNAL-TE members [ 267943:1000 1:.* 0:.* ]
```

#### B. Política de Origem
```text
set policy-options policy-statement RP-TAG-V4-ORIGIN term BLOCK-2228 from prefix-list EXACT-V4-2228
set policy-options policy-statement RP-TAG-V4-ORIGIN term BLOCK-2228 then community add [ 267943:1000 1:20030 1:40000 ]
set policy-options policy-statement RP-TAG-V4-ORIGIN term BLOCK-2228 then accept
```

#### C. Política de Exportação SEA Telecom
```text
set policy-options policy-statement RP-UPL-SEA-V4-OUT term BLOCK from community MATCH-SEA-BLOCK
set policy-options policy-statement RP-UPL-SEA-V4-OUT term BLOCK then reject

set policy-options policy-statement RP-UPL-SEA-V4-OUT term 3P from community MATCH-SEA-3P
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 3P then as-path-prepend "267943 267943 267943"
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 3P then community delete INTERNAL-TE
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 3P then accept

set policy-options policy-statement RP-UPL-SEA-V4-OUT term 2P from community MATCH-SEA-2P
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 2P then as-path-prepend "267943 267943"
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 2P then community delete INTERNAL-TE
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 2P then accept

set policy-options policy-statement RP-UPL-SEA-V4-OUT term 1P from community MATCH-SEA-1P
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 1P then as-path-prepend "267943"
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 1P then community delete INTERNAL-TE
set policy-options policy-statement RP-UPL-SEA-V4-OUT term 1P then accept

set policy-options policy-statement RP-UPL-SEA-V4-OUT term PRIMARY from community MATCH-SEA-PRIMARY
set policy-options policy-statement RP-UPL-SEA-V4-OUT term PRIMARY then community delete INTERNAL-TE
set policy-options policy-statement RP-UPL-SEA-V4-OUT term PRIMARY then accept
```

#### D. Comando Soft Refresh Zero Flap
```text
clear bgp neighbor 170.82.183.217 soft-out
```

---

### 3.7. DATACOM DmOS (DM4000, DM4250, DM4270, DM4370, DM4770)

#### A. Prefix-List & Community-List
```text
ip prefix-list EXACT-V4-2228 seq 10 permit 45.166.28.0/22

ip community-list standard MATCH-SEA-BLOCK seq 10 permit 0:20030
ip community-list standard MATCH-SEA-3P seq 10 permit 1:20033
ip community-list standard MATCH-SEA-2P seq 10 permit 1:20032
ip community-list standard MATCH-SEA-1P seq 10 permit 1:20031
ip community-list standard MATCH-SEA-PRIMARY seq 10 permit 1:20030
```

#### B. Route-Map de Origem
```text
route-map RP-TAG-V4-ORIGIN permit 10
 match ip address prefix-list EXACT-V4-2228
 set community 267943:1000 1:20030 1:40000 additive
```

#### C. Route-Map de Exportação SEA Telecom
```text
route-map RP-UPL-SEA-V4-OUT deny 5
 match community MATCH-SEA-BLOCK
!
route-map RP-UPL-SEA-V4-OUT permit 10
 match community MATCH-SEA-3P
 set as-path prepend 267943 267943 267943
!
route-map RP-UPL-SEA-V4-OUT permit 20
 match community MATCH-SEA-2P
 set as-path prepend 267943 267943
!
route-map RP-UPL-SEA-V4-OUT permit 30
 match community MATCH-SEA-1P
 set as-path prepend 267943
!
route-map RP-UPL-SEA-V4-OUT permit 40
 match community MATCH-SEA-PRIMARY
```

#### D. Comando Soft Refresh Zero Flap
```text
clear bgp ipv4 unicast * soft out
```

---

### 3.8. NOKIA SR-OS (7750 SR, 7250 IXR, 7950 XRS)

#### A. Prefix-List & Community Definitions
```text
configure router policy-options
    prefix-list "EXACT-V4-2228"
        prefix 45.166.28.0/22 exact
    exit
    community "MATCH-SEA-BLOCK" member "0:20030"
    community "MATCH-SEA-3P" member "1:20033"
    community "MATCH-SEA-2P" member "1:20032"
    community "MATCH-SEA-1P" member "1:20031"
    community "MATCH-SEA-PRIMARY" member "1:20030"
    community "INTERNAL-TE" member "regex:^[01]:"
```

#### B. Policy-Statement de Exportação
```text
    policy-statement "RP-UPL-SEA-V4-OUT"
        entry 5
            from
                community "MATCH-SEA-BLOCK"
            exit
            action reject
        exit
        entry 10
            from
                community "MATCH-SEA-3P"
            exit
            action accept
                as-path-prepend 267943 3
                community delete "INTERNAL-TE"
            exit
        exit
        entry 20
            from
                community "MATCH-SEA-2P"
            exit
            action accept
                as-path-prepend 267943 2
                community delete "INTERNAL-TE"
            exit
        exit
        entry 30
            from
                community "MATCH-SEA-1P"
            exit
            action accept
                as-path-prepend 267943 1
                community delete "INTERNAL-TE"
            exit
        exit
        entry 40
            from
                community "MATCH-SEA-PRIMARY"
            exit
            action accept
                community delete "INTERNAL-TE"
            exit
        exit
    exit
```

#### C. Comando Soft Refresh Zero Flap
```text
clear router bgp neighbor 170.82.183.217 soft-out
```

---

### 3.9. ARISTA EOS (7280R, 7500R, 7050X, vEOS)

#### A. Prefix-List & Community-List
```text
ip prefix-list EXACT-V4-2228 seq 10 permit 45.166.28.0/22

ip community-list MATCH-SEA-BLOCK permit 0:20030
ip community-list MATCH-SEA-3P permit 1:20033
ip community-list MATCH-SEA-2P permit 1:20032
ip community-list MATCH-SEA-1P permit 1:20031
ip community-list MATCH-SEA-PRIMARY permit 1:20030
ip community-list regexp INTERNAL-TE permit ^(1|0):
```

#### B. Route-Map de Exportação SEA Telecom
```text
route-map RP-UPL-SEA-V4-OUT deny 5
 match community MATCH-SEA-BLOCK
!
route-map RP-UPL-SEA-V4-OUT permit 10
 match community MATCH-SEA-3P
 set as-path prepend 267943 267943 267943
 set community delete INTERNAL-TE
!
route-map RP-UPL-SEA-V4-OUT permit 20
 match community MATCH-SEA-2P
 set as-path prepend 267943 267943
 set community delete INTERNAL-TE
!
route-map RP-UPL-SEA-V4-OUT permit 30
 match community MATCH-SEA-1P
 set as-path prepend 267943
 set community delete INTERNAL-TE
!
route-map RP-UPL-SEA-V4-OUT permit 40
 match community MATCH-SEA-PRIMARY
 set community delete INTERNAL-TE
```

#### C. Comando Soft Refresh Zero Flap
```text
clear ip bgp * soft out
```

---

## 4. Checklist Operacional & Boas Práticas

1. **Nunca force `clear ip bgp *` sem o modificador `soft` ou `refresh`**:
   - Sempre utilize Route-Refresh (**RFC 2918**). Sessões BGP com operadoras e IXs **NUNCA** devem ser reiniciadas (hard reset) para atualizar prepends.
2. **Validação de Propagação**:
   - Após aplicar um prepend (ex: 2x Prepend no SEA), aguarde de 30 a 90 segundos para a convergência global da internet.
   - Utilize looking glasses públicos (ex: Hurricane Electric BGP Toolkit, BGP Looking Glass Brasil) para confirmar o aumento do AS-Path observado por redes externas.
3. **Bloqueio Seletivo com Cuidado**:
   - Ao usar `0:<BASE>0` (Bloqueio), certifique-se de que o prefixo continua sendo anunciado por pelo menos mais **um** outro trânsito ou PTT/IX para evitar que o bloco fique inalcançável (blackhole).
4. **Stripping Obrigatório**:
   - Jamais deixe de configurar a regra de remoção de comunidades `INTERNAL-TE` no final das policies de saída. Comunidades não padronizadas podem causar descartes ou comportamentos inesperados em operadoras terceiras.
