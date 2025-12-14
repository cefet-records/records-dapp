// components/institution/AddGlobalBatchDisciplines.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

// Estrutura de payload baseada no novo struct FullDisciplinePayload do contrato
interface FullDisciplinePayload {
  courseCode: string; // O curso ao qual esta disciplina pertence
  disciplineCode: string;
  name: string;
  syllabus: string;
  workload: bigint;
  creditCount: bigint;
}

// URL do novo endpoint API para buscar as disciplinas
const BATCH_API_URL = '/api/disciplines-batch';


export function AddGlobalBatchDisciplines() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetchingDB, setIsFetchingDB] = useState<boolean>(false); // NOVO ESTADO para DB
  const [disciplinesBatch, setDisciplinesBatch] = useState<FullDisciplinePayload[]>([]); // Armazena dados do DB

  const institutionAddress = connectedAddress || ("0x" as Address);

  const { data: hash, error: writeError, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    },
  });

  // --- FUNÇÃO PARA BUSCAR DADOS DO POSTGRES ---
  const fetchDisciplinesFromDB = useCallback(async (): Promise<FullDisciplinePayload[]> => {
    setInternalStatusMessage("Buscando disciplinas no banco de dados...");
    setIsFetchingDB(true);

    try {
      const response = await fetch(BATCH_API_URL);

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Erro ao buscar disciplinas (Status: ${response.status})`);
      }

      const data: FullDisciplinePayload[] = await response.json();
      return data;

    } catch (error) {
      console.error("Erro ao comunicar com API de Batch (Disciplinas):", error);
      const msg = `Falha na comunicação DB: ${error instanceof Error ? error.message : String(error)}`;
      setInternalStatusMessage(msg);
      throw error;
    } finally {
      setIsFetchingDB(false);
    }
  }, []);


  const sendBatchTransaction = useCallback((batchData: FullDisciplinePayload[]) => {
    if (!isConnected || !institutionAddress || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Carteira de instituição não conectada ou inválida.");
      return;
    }
    if (batchData.length === 0) {
      setInternalStatusMessage("Erro: O lote de disciplinas está vazio.");
      return;
    }

    // 1. Casting explícito para o tipo array de structs esperado pelo wagmi
    const typedBatchData = batchData as unknown as readonly {
      courseCode: string;
      disciplineCode: string;
      name: string;
      syllabus: string;
      workload: bigint;
      creditCount: bigint;
    }[];

    writeContract({
      ...wagmiContractConfig,
      functionName: "addGlobalBatchDisciplines",
      args: [
        institutionAddress, // address _institutionAddress
        typedBatchData      // FullDisciplinePayload[] _fullDisciplinesInfo
      ],
    });
  }, [isConnected, institutionAddress, writeContract]);


  const handleBatchIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalStatusMessage("");
    setDisciplinesBatch([]); // Limpa o lote anterior

    if (!isConnected || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Conecte a carteira da instituição.");
      return;
    }

    try {
      // 1. BUSCAR DADOS DO BANCO DE DADOS
      const batchData = await fetchDisciplinesFromDB();
      setDisciplinesBatch(batchData);

      if (batchData.length > 0) {
        setInternalStatusMessage(`✅ ${batchData.length} disciplinas carregadas do DB. Enviando transação em lote...`);
        // 2. ENVIAR PARA A BLOCKCHAIN
        sendBatchTransaction(batchData);
      } else {
        setInternalStatusMessage("Nenhuma disciplina encontrada no DB.");
      }

    } catch (error) {
      // O erro já foi setado dentro de fetchDisciplinesFromDB
    }
  };


  useEffect(() => {
    if (isConfirmed) {
      setInternalStatusMessage(`✅ Lote global de disciplinas adicionado com sucesso!`);
    } else if (writeError || confirmError) {
      const error = writeError || confirmError;
      if (error) {
        const message = (error as any).shortMessage || error.message || "Detalhes do erro não disponíveis.";
        setInternalStatusMessage(`Erro: ${message}`);
      } else {
        setInternalStatusMessage(`Erro: Ocorreu um erro, mas a mensagem está vazia.`);
      }
    } else if (isPending) {
      setInternalStatusMessage("Aguardando confirmação na carteira...");
    } else if (isConfirming) {
      setInternalStatusMessage("Transação enviada, aguardando confirmação...");
    }
  }, [isPending, writeError, isConfirming, isConfirmed, confirmError]);

  // O status isProcessing agora inclui o carregamento do DB
  const isProcessing = isPending || isConfirming || isFetchingDB;
  const isButtonDisabled = isProcessing || !isConnected || !isAddress(institutionAddress);


  return (
    <div className="add-global-batch-disciplines-container p-4 bg-white rounded-lg shadow-lg border-l-4 border-yellow-500">
      <h3 className="text-xl font-bold mb-3 text-gray-700">Ingestão Global de Disciplinas (PostgreSQL)</h3>
      <p className="text-sm text-gray-600 mb-4">
        Busca disciplinas no banco de dados e as registra na blockchain.
      </p>

      <form className="form space-y-3" onSubmit={handleBatchIngestion}>
        <button
          type="submit"
          disabled={isButtonDisabled}
          className="w-full p-2 text-white font-semibold rounded transition duration-150"
          style={{ backgroundColor: isButtonDisabled ? '#FFEB3B' : '#FBC02D', color: isButtonDisabled ? '#BDBDBD' : '#333' }}
        >
          {isFetchingDB ? "Buscando Disciplinas do DB..." : isProcessing ? "Processando Lote Global..." : "Adicionar Lote de Disciplinas"}
        </button>
      </form>

      {internalStatusMessage && (
        <p className={`mt-3 text-sm font-semibold ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'text-red-500' : 'text-green-700'}`}>
          {internalStatusMessage}
        </p>
      )}

      {disciplinesBatch.length > 0 && !isProcessing && (
        <p className="text-xs text-gray-600 mt-2">
          Lote processado: {disciplinesBatch.length} disciplinas carregadas.
        </p>
      )}

      {hash && (
        <p className="transaction-hash text-xs mt-2 text-gray-500">
          Hash da Transação: {hash}
        </p>
      )}
    </div>
  );
}