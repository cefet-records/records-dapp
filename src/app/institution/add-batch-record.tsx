"use client";

import React, { useState, useCallback } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import styles from "./add-batch-record.module.css";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";

interface BatchGradePayload {
  studentAddress: Address;
  courseCode: string;
  disciplineCode: string;
  semester: number;
  year: number;
  grade: number;
  attendance: number;
  status: boolean;
}

const BATCH_API_URL = '/api/grades-batch';
// Tamanho do lote reduzido para evitar estouro de buffer no Dynamic MPC
const CHUNK_SIZE = 10;

export function AddBatchGrade() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [lastHash, setLastHash] = useState<string | null>(null);

  // Usamos writeContractAsync para controle assíncrono do loop
  const { writeContractAsync } = useWriteContract();

  const institutionAddress = connectedAddress || ("0x" as Address);

  // --- BUSCAR DADOS DO POSTGRES ---
  const fetchGradesFromDB = async (instAddress: Address): Promise<BatchGradePayload[]> => {
    const response = await fetch(`${BATCH_API_URL}?institutionAddress=${instAddress}`);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.message || "Erro ao buscar notas");
    }
    return await response.json();
  };

  // --- HANDLER COM LÓGICA DE CHUNKS ---
  const handleBatchIngestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected || !isAddress(institutionAddress)) {
      setInternalStatusMessage("Erro: Carteira não conectada.");
      return;
    }

    setIsProcessing(true);
    setInternalStatusMessage("Buscando notas no banco de dados...");

    try {
      const allGrades = await fetchGradesFromDB(institutionAddress);

      if (allGrades.length === 0) {
        setInternalStatusMessage("Nenhuma nota encontrada para esta instituição.");
        setIsProcessing(false);
        return;
      }

      // Loop para enviar em pedaços (Chunks)
      for (let i = 0; i < allGrades.length; i += CHUNK_SIZE) {
        const currentBatch = Math.floor(i / CHUNK_SIZE) + 1;
        const totalBatches = Math.ceil(allGrades.length / CHUNK_SIZE);

        setInternalStatusMessage(`Enviando lote ${currentBatch} de ${totalBatches}...`);

        const formattedChunk = allGrades.slice(i, i + CHUNK_SIZE).map(item => {
          // Lógica solicitada: 
          // 1. Multiplica por 10 (ex: 9.87 -> 98.7)
          // 2. Math.floor remove as casas decimais extras (98.7 -> 98)
          // Isso garante que o valor máximo seja 100 (para nota 10), cabendo no uint8.
          const gradeScaled = Math.floor(Number(item.grade) * 10);

          return {
            studentAddress: item.studentAddress as Address,
            courseCode: String(item.courseCode),
            disciplineCode: String(item.disciplineCode),
            semester: Number(item.semester),
            year: Number(item.year),
            grade: gradeScaled,
            attendance: Number(item.attendance),
            status: Boolean(item.status)
          };
        });

        const txHash = await writeContractAsync({
          ...wagmiContractConfig,
          functionName: "addBatchGrades",
          args: [
            institutionAddress,
            formattedChunk as any
          ],
        });

        setLastHash(txHash);
        setInternalStatusMessage(`Lote enviado. Aguardando confirmação...`);

        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash: txHash });
        }
      }

      setInternalStatusMessage(`✅ Lote de notas adicionado com sucesso!`);
    } catch (error: any) {
      console.error("Erro no processamento de notas:", error);
      const msg = error.shortMessage || error.message || "Erro inesperado";
      setInternalStatusMessage(`Falha: ${msg}`);
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
          Notas
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ minHeight: '48px', lineHeight: 1.4 }}>
          Sincroniza as notas do banco Postgres com a Blockchain em lotes seguros.
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