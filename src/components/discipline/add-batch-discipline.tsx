// components/institution/AddGlobalBatchDisciplines.tsx
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-batch-discipline.module.css";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

interface FullDisciplinePayload {
  courseCode: string;
  disciplineCode: string;
  name: string;
  syllabus: string;
  workload: bigint;
  creditCount: bigint;
}

const BATCH_API_URL = '/api/disciplines-batch';
// Tamanho do lote: 5 itens por transação para evitar erro 400 no Dynamic WaaS
const CHUNK_SIZE = 5; 

export function AddGlobalBatchDisciplines() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastHash, setLastHash] = useState<string | null>(null);

  // Usamos writeContractAsync para poder fazer o loop com await
  const { writeContractAsync } = useWriteContract();

  const institutionAddress = connectedAddress || ("0x" as Address);

  // --- BUSCAR DADOS DO BANCO ---
  const fetchDisciplinesFromDB = async (): Promise<FullDisciplinePayload[]> => {
    const response = await fetch(BATCH_API_URL);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.message || "Erro ao buscar disciplinas");
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
      const allDisciplines = await fetchDisciplinesFromDB();
      
      if (allDisciplines.length === 0) {
        setInternalStatusMessage("Nenhuma disciplina encontrada.");
        setIsProcessing(false);
        return;
      }

      // Divide o array total em pedaços de 5
      for (let i = 0; i < allDisciplines.length; i += CHUNK_SIZE) {
        const chunk = allDisciplines.slice(i, i + CHUNK_SIZE);
        const currentBatch = (i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(allDisciplines.length / CHUNK_SIZE);

        setInternalStatusMessage(`Enviando lote...`);

        // Envia a transação para o chunk atual
        const txHash = await writeContractAsync({
          ...wagmiContractConfig,
          functionName: "addGlobalBatchDisciplines",
          args: [
            institutionAddress,
            chunk as unknown as readonly {
              courseCode: string;
              disciplineCode: string;
              name: string;
              syllabus: string;
              workload: bigint;
              creditCount: bigint;
            }[]
          ],
        });

        setLastHash(txHash);
        setInternalStatusMessage(`Aguardando confirmação do lote...`);

        // AGUARDA a confirmação na blockchain antes de prosseguir para o próximo i
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
      }

      setInternalStatusMessage(`✅ Todas as disciplinas foram registradas!`);
    } catch (error: any) {
      console.error("Erro no processamento em lote:", error);
      const errorMsg = error.shortMessage || error.message || "Erro desconhecido";
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
          Disciplinas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '48px', lineHeight: 1.4 }}>
          Registra disciplinas do Postgres em lotes menores para evitar limites de rede.
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
              Último Hash: {lastHash.slice(0, 10)}...
            </Typography>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}