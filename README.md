# 🎓 Academic Record Management DApp

Sistema descentralizado para gestão de registros acadêmicos com foco em **escalabilidade**, **privacidade** e **baixas taxas de transação**. O projeto utiliza orquestração de dados em lote e carteiras embarcadas para uma experiência de usuário simplificada.

## 🔗 Repositórios do Ecossistema

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

## 🧪 Viabilidade Econômica (Rede Polygon)

O sistema foi otimizado para a rede **Polygon**, garantindo custos baixíssimos mesmo em cenários de alta volumetria:

| Cenário | Qtd. Notas | Custo Est. (BRL) |
| --- | --- | --- |
| Cenário 1 | 3 | R$ 0,0292 |
| Cenário 4 | 500 | R$ 0,4992 |

---

## 🛡️ Segurança

* **Cifragem Client-side:** Dados sensíveis são protegidos antes de sair do navegador do usuário.
* **Algoritmos:** AES-256-GCM, PBKDF2 e ECIES.
* **Soberania:** A instituição detém a chave mestra para a guarda de identidades e recuperação de dados.

---

**Projeto desenvolvido como Trabalho de Conclusão de Curso (TCC) no CEFET-RJ.**

---