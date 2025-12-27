// components/institution/AddBatchStudents.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-student.module.css";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";

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
          Estudantes
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '48px', lineHeight: 1.4 }}>
          Sincronizar estudantes do PostgreSQL para a Blockchain.
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