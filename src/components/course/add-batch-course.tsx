// components/institution/AddBatchCourses.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-batch-course.module.css";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

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
          Cursos
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '48px', lineHeight: 1.4 }}>
          Busca cursos no banco de dados e os registra na blockchain.
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