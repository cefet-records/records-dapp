// components/institution/AddBatchCourses.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

// Estrutura de payload baseada no contrato BatchCoursePayload
interface BatchCoursePayload {
  code: string;
  name: string;
  courseType: string;
  numberOfSemesters: bigint; // int (representado como BigInt em JS)
}

// URL do novo endpoint API para buscar os cursos
const BATCH_API_URL = '/api/courses-batch';


export function AddBatchCourses() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetchingDB, setIsFetchingDB] = useState<boolean>(false); // NOVO ESTADO para DB
  const [courseBatch, setCourseBatch] = useState<BatchCoursePayload[]>([]); // Armazena dados do DB

  const institutionAddress = connectedAddress || ("0x" as Address);

  const { data: hash, error: writeError, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    },
  });

  // --- FUNÇÃO PARA BUSCAR DADOS DO POSTGRES ---
  const fetchCoursesFromDB = useCallback(async (): Promise<BatchCoursePayload[]> => {
    setInternalStatusMessage("Buscando cursos no banco de dados...");
    setIsFetchingDB(true);

    try {
      const response = await fetch(BATCH_API_URL);

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Erro ao buscar cursos (Status: ${response.status})`);
      }

      const data: BatchCoursePayload[] = await response.json();
      return data;

    } catch (error) {
      console.error("Erro ao comunicar com API de Batch (Cursos):", error);
      const msg = `Falha na comunicação DB: ${error instanceof Error ? error.message : String(error)}`;
      setInternalStatusMessage(msg);
      throw error;
    } finally {
      setIsFetchingDB(false);
    }
  }, []);


  const sendBatchTransaction = useCallback((batchData: BatchCoursePayload[]) => {
    if (!isConnected || !institutionAddress || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Carteira de instituição não conectada ou inválida.");
      return;
    }
    if (batchData.length === 0) {
      setInternalStatusMessage("Erro: O lote de cursos está vazio.");
      return;
    }

    // Casting explícito para o tipo array de structs esperado pelo wagmi
    const typedBatchData = batchData as unknown as readonly {
      code: string;
      name: string;
      courseType: string;
      numberOfSemesters: bigint;
    }[];

    writeContract({
      ...wagmiContractConfig,
      functionName: "addBatchCourses",
      args: [
        institutionAddress, // address _institutionAddress
        typedBatchData      // BatchCoursePayload[] _coursesInfo
      ],
    });
  }, [isConnected, institutionAddress, writeContract]);


  const handleBatchIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalStatusMessage("");
    setCourseBatch([]); // Limpa o lote anterior

    if (!isConnected || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Conecte a carteira da instituição.");
      return;
    }

    try {
      // 1. BUSCAR DADOS DO BANCO DE DADOS
      const batchData = await fetchCoursesFromDB();
      setCourseBatch(batchData);

      if (batchData.length > 0) {
        setInternalStatusMessage(`✅ ${batchData.length} cursos carregados do DB. Enviando transação em lote...`);
        // 2. ENVIAR PARA A BLOCKCHAIN
        sendBatchTransaction(batchData);
      } else {
        setInternalStatusMessage("Nenhum curso encontrado no DB.");
      }

    } catch (error) {
      // O erro já foi setado dentro de fetchCoursesFromDB
    }
  };


  useEffect(() => {
    if (isConfirmed) {
      setInternalStatusMessage("✅ Lote de cursos adicionado com sucesso!");
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
    <div className="add-batch-courses-container p-4 bg-white rounded-lg shadow-md border-l-4 border-purple-500">
      <h3 className="text-xl font-bold mb-3 text-gray-700">Ingestão em Lote de Cursos (PostgreSQL)</h3>
      <p className="text-sm text-gray-600 mb-4">
        Busca cursos no banco de dados e os registra na blockchain.
      </p>

      <form className="form space-y-3" onSubmit={handleBatchIngestion}>
        <button
          type="submit"
          disabled={isButtonDisabled}
          className="w-full p-2 text-white font-semibold rounded transition duration-150"
          style={{ backgroundColor: isButtonDisabled ? '#CE93D8' : '#7B1FA2' }}
        >
          {isFetchingDB ? "Buscando Cursos do DB..." : isProcessing ? "Processando Lote..." : "Adicionar Lote de Cursos"}
        </button>
      </form>

      {internalStatusMessage && (
        <p className={`mt-3 text-sm font-semibold ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'text-red-500' : 'text-green-700'}`}>
          {internalStatusMessage}
        </p>
      )}

      {courseBatch.length > 0 && !isProcessing && (
        <p className="text-xs text-gray-600 mt-2">
          Lote processado: {courseBatch.length} cursos carregados.
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