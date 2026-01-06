// components/institution/AddBatchStudents.tsx
"use client";

import React, { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-student.module.css";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";

interface BatchStudentPayload {
  studentAddress: Address;
  institutionAddress: Address;
}

const BATCH_API_URL = '/api/students-batch';
// Tamanho do lote: 15 estudantes por transação (endereços são leves, permite lotes maiores)
const CHUNK_SIZE = 15; 

export function AddBatchStudents() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastHash, setLastHash] = useState<string | null>(null);

  // Usamos writeContractAsync para o controle sequencial do loop
  const { writeContractAsync } = useWriteContract();

  const institutionAddress = connectedAddress || ("0x" as Address);

  // --- BUSCAR DADOS DO POSTGRES ---
  const fetchStudentsFromDB = async (instAddress: Address): Promise<BatchStudentPayload[]> => {
    const response = await fetch(`${BATCH_API_URL}?institutionAddress=${instAddress}`);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.message || "Erro ao buscar estudantes");
    }
    return await response.json();
  };

  // --- LÓGICA DE PROCESSAMENTO EM CHUNKS ---
  const handleBatchIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Conecte a carteira.");
      return;
    }

    setIsProcessing(true);
    setInternalStatusMessage("Buscando estudantes no banco de dados...");

    try {
      const allStudents = await fetchStudentsFromDB(institutionAddress);
      
      if (allStudents.length === 0) {
        setInternalStatusMessage("Nenhum estudante novo encontrado no DB.");
        setIsProcessing(false);
        return;
      }

      // Loop para processar o array em pedaços (chunks)
      for (let i = 0; i < allStudents.length; i += CHUNK_SIZE) {
        const chunk = allStudents.slice(i, i + CHUNK_SIZE);
        const currentBatch = Math.floor(i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(allStudents.length / CHUNK_SIZE);

        setInternalStatusMessage(`Enviando lote ${currentBatch} de ${totalBatches}...`);

        // Casting para o formato esperado pelo contrato
        const typedBatchData = chunk as unknown as readonly {
          studentAddress: Address;
          institutionAddress: Address;
        }[];

        // Envia a transação para o lote atual e aguarda a assinatura
        const txHash = await writeContractAsync({
          ...wagmiContractConfig,
          functionName: "addBatchStudents",
          args: [typedBatchData],
        });

        setLastHash(txHash);
        setInternalStatusMessage(`Lote ${currentBatch} enviado. Confirmando...`);

        // Aguarda a mineração do bloco antes de prosseguir para o próximo lote
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
      }

      setInternalStatusMessage(`✅ Lote de estudantes adicionado com sucesso!`);
    } catch (error: any) {
      console.error("Erro no processamento de estudantes:", error);
      const errorMsg = error.shortMessage || error.message || "Erro inesperado";
      setInternalStatusMessage(`Falha: ${errorMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

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
          Sincroniza registros de novos estudantes do PostgreSQL com a rede blockchain.
        </Typography>
      </Stack>

      <Stack gap={1} mt={2}>
        <Button
          variant="contained"
          fullWidth
          onClick={handleBatchIngestion}
          disabled={isProcessing || !isConnected}
          className="register-button"
          sx={{ textTransform: 'none', fontWeight: 'bold', borderRadius: '8px', py: 1 }}
        >
          {isProcessing ? "PROCESSANDO..." : "EXECUTAR LOTE"}
        </Button>
        
        <Stack sx={{ minHeight: '40px' }}>
          {internalStatusMessage && (
            <Typography
              variant="caption"
              fontWeight="bold"
              display="block"
              color={internalStatusMessage.includes('Falha') || internalStatusMessage.includes('Erro') ? 'error.main' : 'success.main'}
            >
              {internalStatusMessage}
            </Typography>
          )}

          {lastHash && (
            <Typography variant="caption" sx={{ wordBreak: 'break-all', opacity: 0.6, display: 'block' }}>
              Hash: {lastHash.slice(0, 10)}...
            </Typography>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}