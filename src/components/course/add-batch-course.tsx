// components/institution/AddBatchCourses.tsx
"use client";

import React, { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-batch-course.module.css";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

interface BatchCoursePayload {
  code: string;
  name: string;
  courseType: string;
  numberOfSemesters: bigint;
}

const BATCH_API_URL = '/api/courses-batch';
// Tamanho do lote: 10 cursos por transação é um valor seguro para payloads sem textos longos
const CHUNK_SIZE = 10; 

export function AddBatchCourses() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastHash, setLastHash] = useState<string | null>(null);

  // Usamos writeContractAsync para controle assíncrono sequencial
  const { writeContractAsync } = useWriteContract();

  const institutionAddress = connectedAddress || ("0x" as Address);

  // --- BUSCAR DADOS DO BANCO ---
  const fetchCoursesFromDB = async (): Promise<BatchCoursePayload[]> => {
    const response = await fetch(BATCH_API_URL);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.message || "Erro ao buscar cursos");
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
    setInternalStatusMessage("Buscando dados no banco...");

    try {
      const allCourses = await fetchCoursesFromDB();
      
      if (allCourses.length === 0) {
        setInternalStatusMessage("Nenhum curso encontrado no DB.");
        setIsProcessing(false);
        return;
      }

      // Divide o array total em chunks de acordo com CHUNK_SIZE
      for (let i = 0; i < allCourses.length; i += CHUNK_SIZE) {
        const chunk = allCourses.slice(i, i + CHUNK_SIZE);
        const currentBatch = Math.floor(i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(allCourses.length / CHUNK_SIZE);

        setInternalStatusMessage(`Enviando lote ${currentBatch} de ${totalBatches}...`);

        // Envia a transação para o pedaço atual
        const txHash = await writeContractAsync({
          ...wagmiContractConfig,
          functionName: "addBatchCourses",
          args: [
            institutionAddress,
            chunk as unknown as readonly {
              code: string;
              name: string;
              courseType: string;
              numberOfSemesters: bigint;
            }[]
          ],
        });

        setLastHash(txHash);
        setInternalStatusMessage(`Lote ${currentBatch} enviado. Aguardando confirmação...`);

        // AGUARDA a confirmação na blockchain para evitar conflitos de Nonce e Timeout
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
      }

      setInternalStatusMessage(`✅ Lote de cursos adicionado com sucesso!`);
    } catch (error: any) {
      console.error("Erro no processamento de cursos:", error);
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
          Cursos
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '48px', lineHeight: 1.4 }}>
          Registra os cursos cadastrados no banco de dados na rede blockchain.
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