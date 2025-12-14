// components/AddBatchGrade.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

// Define a estrutura do payload esperado pela função addBatchGrades no contrato
interface BatchGradePayload {
  studentAddress: Address; // Garante que o tipo Address é usado
  courseCode: string;
  disciplineCode: string;
  semester: number; // uint8
  year: number;     // uint16
  grade: number;    // uint8
  attendance: number; // uint8
  status: boolean;
}

// URL do novo endpoint API para buscar as notas
const BATCH_API_URL = '/api/grades-batch';


export function AddBatchGrade() {
  const { address: connectedAddress, isConnected } = useAccount();
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetchingDB, setIsFetchingDB] = useState<boolean>(false); // NOVO ESTADO para DB
  const [gradesBatch, setGradesBatch] = useState<BatchGradePayload[]>([]); // Armazena dados do DB

  const institutionAddress = connectedAddress || ("0x" as Address);

  const { data: hash, error: writeError, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    },
  });

  // --- FUNÇÃO PARA BUSCAR DADOS DO POSTGRES ---
  const fetchGradesFromDB = useCallback(async (instAddress: Address): Promise<BatchGradePayload[]> => {
    setInternalStatusMessage("Buscando notas no banco de dados...");
    setIsFetchingDB(true);

    try {
      // Passa o endereço da instituição como parâmetro de consulta para filtrar as notas
      const response = await fetch(`${BATCH_API_URL}?institutionAddress=${instAddress}`);

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || `Erro ao buscar notas (Status: ${response.status})`);
      }

      const data: BatchGradePayload[] = await response.json();
      return data;

    } catch (error) {
      console.error("Erro ao comunicar com API de Batch (Notas):", error);
      const msg = `Falha na comunicação DB: ${error instanceof Error ? error.message : String(error)}`;
      setInternalStatusMessage(msg);
      throw error;
    } finally {
      setIsFetchingDB(false);
    }
  }, []);


  // Função para montar e enviar a transação
  const sendBatchTransaction = useCallback((batchData: BatchGradePayload[]) => {
    if (!isConnected || !institutionAddress || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Carteira de instituição não conectada ou inválida.");
      return;
    }
    if (batchData.length === 0) {
      setInternalStatusMessage("Erro: O lote de notas está vazio.");
      return;
    }

    // Validação básica dos dados antes de enviar
    for (const item of batchData) {
      if (!isAddress(item.studentAddress)) {
        setInternalStatusMessage(`Erro: Endereço de estudante inválido no lote: ${item.studentAddress}`);
        return;
      }
      // Não é necessário validar > 255 se você estiver seguro dos tipos Solidity, 
      // mas é bom garantir que são números inteiros positivos se forem mapear para uints.
      if (item.grade < 0 || item.attendance < 0) {
        setInternalStatusMessage("Erro: Notas e frequências devem ser positivas.");
        return;
      }
    }

    // Casting explícito para o tipo array de structs esperado pelo wagmi
    const typedBatchData = batchData as unknown as readonly {
      studentAddress: Address;
      courseCode: string;
      disciplineCode: string;
      semester: number;
      year: number;
      grade: number;
      attendance: number;
      status: boolean;
    }[];


    writeContract({
      ...wagmiContractConfig,
      functionName: "addBatchGrades",
      args: [
        institutionAddress, // address _institutionAddress
        typedBatchData,     // BatchGradePayload[] _gradesInfo
      ],
    });
  }, [isConnected, institutionAddress, writeContract]);


  // Handler para buscar os dados do DB e iniciar a transação
  const handleBatchIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalStatusMessage("");
    setGradesBatch([]);

    if (!isConnected || !institutionAddress || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Conecte a carteira da instituição para iniciar a ingestão.");
      return;
    }

    try {
      // 1. BUSCAR DADOS DO BANCO DE DADOS
      const batchData = await fetchGradesFromDB(institutionAddress);
      setGradesBatch(batchData);

      if (batchData.length > 0) {
        setInternalStatusMessage(`✅ ${batchData.length} notas carregadas do DB. Enviando transação em lote...`);
        // 2. Enviar a transação
        sendBatchTransaction(batchData);
      } else {
        setInternalStatusMessage("Nenhuma nota encontrada no DB para esta instituição.");
      }

    } catch (error) {
      // O erro já foi setado dentro de fetchGradesFromDB
    }
  };


  // Efeito para feedback da transação
  useEffect(() => {
    if (isPending) {
      setInternalStatusMessage("Aguardando confirmação na carteira...");
    } else if (writeError) {
      setInternalStatusMessage(`Erro na transação: ${(writeError as any).shortMessage || writeError.message}`);
      console.error("Erro ao enviar transação:", writeError);
    } else if (isConfirming) {
      setInternalStatusMessage("Transação enviada, aguardando confirmação...");
    } else if (isConfirmed) {
      setInternalStatusMessage("✅ Lote de notas adicionado com sucesso na blockchain!");
    } else if (confirmError) {
      setInternalStatusMessage(`Erro ao confirmar transação: ${(confirmError as any).shortMessage || confirmError.message}`);
      console.error("Erro ao confirmar transação:", confirmError);
    }
  }, [isPending, writeError, isConfirming, isConfirmed, confirmError]);

  // O status isProcessing agora inclui o carregamento do DB
  const isProcessing = isPending || isConfirming || isFetchingDB;
  const isButtonDisabled = isProcessing || !isConnected || !isAddress(institutionAddress);


  return (
    <div className="add-batch-grade-container p-4 bg-white rounded-lg shadow-md border-l-4 border-red-500">
      <h2>Ingestão em Lote de Notas (PostgreSQL)</h2>
      <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
        Busca notas no banco de dados, filtra por instituição, e as envia em lote para a blockchain.
      </p>

      {(!isConnected || !isAddress(institutionAddress)) && (
        <p style={{ color: 'red', marginBottom: '1rem' }}>⚠️ Conecte a carteira da Instituição para realizar a ingestão.</p>
      )}

      {isAddress(institutionAddress) && (
        <p className="text-sm text-blue-700">Instituição Conectada: **{institutionAddress}**</p>
      )}

      <form className="form space-y-3" onSubmit={handleBatchIngestion}>
        <button
          type="submit"
          disabled={isButtonDisabled}
          className="w-full p-2 text-white font-semibold rounded transition duration-150"
          style={{ backgroundColor: isButtonDisabled ? '#F44336' : '#C62828', opacity: isButtonDisabled ? 0.6 : 1, marginTop: '10px' }}
        >
          {isFetchingDB ? "Buscando Notas do DB..." : isProcessing ? "Processando Lote..." : "Enviar Lote de Notas"}
        </button>
      </form>

      {internalStatusMessage && (
        <p className={`status-message ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'text-red-500' : 'text-green-700'}`}
          style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
          {internalStatusMessage}
        </p>
      )}

      {gradesBatch.length > 0 && !isProcessing && (
        <p className="text-xs text-gray-600 mt-2">
          Lote processado: {gradesBatch.length} notas carregadas.
        </p>
      )}

      {hash && (
        <p className="transaction-hash text-sm" style={{ marginTop: '0.8rem' }}>
          Hash da Transação: {hash}
        </p>
      )}
    </div>
  );
}