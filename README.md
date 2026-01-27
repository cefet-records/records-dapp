# 🎓 Academic Record Management DApp

**Título do TCC:** Aplicação de Tecnologias Descentralizadas para Gestão de Registros Acadêmicos e Transferência de Créditos
**Alunos:**
* Gabriel Franco Barreto Cavalcanti
* Gilmar Santos Neto
* Juan Carvalho Silva de Lima
**Semestre de Defesa:** 2025-2

[PDF do TCC](./public/tcc.pdf)

# TL;DR

Este projeto é composto por três módulos independentes que trabalham de forma integrada. Certifique-se de clonar todos para a execução completa:

* 🖥️ **DApp (Este repositório):** Interface Web3 para usuários e instituições.
* 📜 **[Smart Contracts](https://github.com/cefet-records/records-smart-contract):** Contratos inteligentes em Solidity e ambiente de desenvolvimento Hardhat.
* ⚙️ **[Records Batch](https://github.com/cefet-records/records-batch):** Pipeline de dados e orquestração de processos em lote com Apache Airflow.

---

## 🛠️ Pré-requisitos

Antes de iniciar, certifique-se de possuir:

* [Node.js](https://nodejs.org/) (v18+)
* [Docker & Docker Compose](https://www.docker.com/)
* Conta ativa na [Dynamic.xyz](https://www.dynamic.xyz/)
* [Ngrok](https://ngrok.com/) instalado

---

## 📦 Guia de Instalação e Execução

### 1. Smart Contracts ([Acessar Repo](https://github.com/cefet-records/records-smart-contract))

Abra o repositório dos contratos e inicie o nó local:

```bash
cd records-smart-contract
npm install
npx hardhat node

```

Em um novo terminal, realize o deploy:

```bash
npx hardhat ignition deploy ./ignition/modules/AcademicRecordStorage.ts --network localhost

```

### 2. DApp (Interface Frontend)

Neste repositório, instale as dependências e inicie o servidor:

```bash
npm install
npm run dev

```

**Conexão com Dynamic (MPC):** É obrigatório expor a porta local para permitir a integração com as chaves de segurança da Dynamic:

```bash
npx ngrok http 3000

```

> ⚠️ **Atenção:** É necessário configurar o domínio gerado pelo ngrok no painel administrativo da Dynamic para habilitar as carteiras embarcadas.

### 3. Records Batch ([Acessar Repo](https://github.com/cefet-records/records-batch))

Abra o repositório de orquestração e inicie os containers:

```bash
cd records-batch
docker-compose up -d

```

Acesse o painel em `localhost:8080` para gerenciar os disparos via CSV.

---

# Descrição Geral

Sistema descentralizado para gestão de registros acadêmicos com foco em **escalabilidade**, **privacidade** e **baixas taxas de transação**. O projeto utiliza orquestração de dados em lote e carteiras embarcadas para uma experiência de usuário simplificada.

# Funcionalidades

* **Gestão Institucional de Registos em Lote**
  * Ingestão automatizada de grandes volumes de dados de estudantes, cursos e disciplinas.
  * Processamento de notas de forma coletiva para redução drástica de custos de rede.
  * Validação de integridade e unicidade dos dados antes da persistência na blockchain.
* **Privacidade e Proteção de Dados Sensíveis**
  * Cifragem de ponta a ponta (*client-side*) utilizando o esquema ECIES.
  * Proteção da identidade do estudante (nome e documentos) fora da rede pública.
  * Implementação de motor criptográfico local com AES-256-GCM e PBKDF2.
* **Soberania de Identidade e Carteira Embarcada**
  * Integração com *Embedded Wallets* (Dynamic MPC) para abstração da complexidade Web3.
  * Gestão de chaves privadas baseada em Senha Mestra de conhecimento exclusivo do titular.
  * Independência de extensões de navegador ou bibliotecas de carteiras legadas.
* **Controlo de Acesso Condicional**
  * Fluxo descentralizado para solicitação de acesso por visitantes externos.
  * Mecanismo de recifragem direcionada para partilha segura de históricos acadêmicos.
  * Trilha de auditoria imutável de todas as concessões de acesso realizadas.
* **Otimização de Custos e Escalabilidade**
  * Agregação de transações (*batching*) para diluição das taxas de *gas*.
  * Compatibilidade com redes EVM de camada 2 (Polygon) para viabilidade económica.
  * Orquestração de pipelines de dados via Apache Airflow integrada ao DApp.

