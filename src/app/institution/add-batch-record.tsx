// components/AddBatchGrade.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-batch-record.module.css";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

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
    <Card
      sx={{
        flex: '1 1 200px',
        minHeight: '220px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        p: 3,
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
      }}
    >
      <Stack gap={1}>
        <Typography variant="h6" fontSize="1.1rem" fontWeight="bold">
          Notas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '48px', lineHeight: 1.4 }}>
          Busca notas no banco de dados, filtra por instituição, e as envia em lote para a blockchain.
        </Typography>
      </Stack>
      <Stack gap={1} mt={2}>
        <Button
          variant="contained"
          fullWidth
          onClick={handleBatchIngestion}
          disabled={isButtonDisabled}
          sx={{
            textTransform: 'none',
            fontWeight: 'bold',
            borderRadius: '8px',
            py: 1,
            backgroundColor: '#1e3a8a'
          }}
          className={`${styles["register-button"]} register-button`}
        >
          {isFetchingDB ? "BUSCANDO..." : isProcessing ? "PROCESSANDO..." : "EXECUTAR LOTE"}
        </Button>
        <Stack sx={{ minHeight: '20px' }}>
          {internalStatusMessage && (
            <Typography
              variant="caption"
              fontWeight="bold"
              display="block"
              color={internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'error.main' : 'success.main'}
            >
              {internalStatusMessage}
            </Typography>
          )}

          {hash && (
            <Typography variant="caption" sx={{ wordBreak: 'break-all', opacity: 0.6, display: 'block' }}>
              Hash: {hash.slice(0, 10)}...
            </Typography>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}