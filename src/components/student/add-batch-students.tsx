// components/institution/AddBatchStudents.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

// Estrutura de payload baseada no contrato BatchStudentPayload
interface BatchStudentPayload {
  studentAddress: Address;
  institutionAddress: Address;
}

// URL do nosso novo endpoint API para buscar os estudantes
const BATCH_API_URL = '/api/students-batch';


export function AddBatchStudents() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetchingDB, setIsFetchingDB] = useState<boolean>(false); // NOVO ESTADO
  const [studentBatch, setStudentBatch] = useState<BatchStudentPayload[]>([]); // Armazena dados do DB

  // Usaremos connectedAddress como o endereço da instituição
  const institutionAddress = connectedAddress || ("0x" as Address);

  const { data: hash, error: writeError, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    },
  });

  // --- FUNÇÃO PARA BUSCAR DADOS DO POSTGRES ---
  const fetchStudentsFromDB = useCallback(async (instAddress: Address): Promise<BatchStudentPayload[]> => {
    setInternalStatusMessage("Buscando estudantes no banco de dados...");
    setIsFetchingDB(true);

    try {
      const response = await fetch(`${BATCH_API_URL}?institutionAddress=${instAddress}`);

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Erro ao buscar estudantes (Status: ${response.status})`);
      }

      const data: BatchStudentPayload[] = await response.json();
      return data;

    } catch (error) {
      console.error("Erro ao comunicar com API de Batch:", error);
      const msg = `Falha na comunicação DB: ${error instanceof Error ? error.message : String(error)}`;
      setInternalStatusMessage(msg);
      throw error; // Propagar o erro para o handler principal
    } finally {
      setIsFetchingDB(false);
    }
  }, []);


  const sendBatchTransaction = useCallback((batchData: BatchStudentPayload[]) => {
    if (batchData.length === 0) {
      setInternalStatusMessage("Erro: O lote de estudantes está vazio.");
      return;
    }

    // Casting explícito para o tipo array de structs esperado pelo wagmi
    const typedBatchData = batchData as unknown as readonly {
      studentAddress: Address;
      institutionAddress: Address;
    }[];

    writeContract({
      ...wagmiContractConfig,
      functionName: "addBatchStudents",
      args: [typedBatchData], // A função recebe apenas o array de payloads
    });

  }, [writeContract]);


  const handleBatchIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalStatusMessage("");
    setStudentBatch([]); // Limpa o lote anterior

    if (!isConnected || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Conecte a carteira da instituição.");
      return;
    }

    try {
      // 1. BUSCAR DADOS DO BANCO DE DADOS
      const batchData = await fetchStudentsFromDB(institutionAddress);
      setStudentBatch(batchData);

      if (batchData.length > 0) {
        setInternalStatusMessage(`✅ ${batchData.length} estudantes carregados do DB. Enviando transação em lote...`);
        // 2. ENVIAR PARA A BLOCKCHAIN
        sendBatchTransaction(batchData);
      } else {
        setInternalStatusMessage("Nenhum estudante novo encontrado no DB para esta instituição.");
      }

    } catch (error) {
      // O erro já foi setado dentro de fetchStudentsFromDB
    }
  };


  useEffect(() => {
    if (isConfirmed) {
      setInternalStatusMessage("✅ Lote de estudantes adicionado com sucesso!");
    } else if (writeError || confirmError) {
      const error = writeError || confirmError;
      if (error) {
        const message = (error as any).shortMessage || error.message || "Erro desconhecido";
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
    <div className="add-batch-students-container p-4 bg-white rounded-lg shadow-md border-l-4 border-blue-500">
      <h3 className="text-xl font-bold mb-3 text-gray-700">Ingestão em Lote de Estudantes (PostgreSQL)</h3>
      <p className="text-sm text-gray-600 mb-4">
        Busca estudantes associados à instituição conectada no banco de dados e os registra na blockchain.
      </p>

      <form className="form space-y-3" onSubmit={handleBatchIngestion}>
        <button
          type="submit"
          disabled={isButtonDisabled}
          className="w-full p-2 text-white font-semibold rounded transition duration-150"
          style={{ backgroundColor: isButtonDisabled ? '#90CAF9' : '#1976D2' }}
        >
          {isFetchingDB ? "Buscando Estudantes do DB..." : isProcessing ? "Processando Lote..." : "Adicionar Lote de Estudantes"}
        </button>
      </form>

      {internalStatusMessage && (
        <p className={`mt-3 text-sm font-semibold ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'text-red-500' : 'text-green-700'}`}>
          {internalStatusMessage}
        </p>
      )}

      {studentBatch.length > 0 && !isProcessing && (
        <p className="text-xs text-gray-600 mt-2">
          Lote processado: {studentBatch.length} estudantes.
        </p>
      )}

      {hash && (
        <p className="transaction-hash text-xs mt-2 text-gray-500">
          Hash: {hash}
        </p>
      )}
    </div>
  );
}