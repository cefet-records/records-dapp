// components/AddCourse.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI"; // Ajuste o caminho conforme necessário
import { useIsClient } from "../is-client";



export function AddCourse() {
  const { address, isConnected } = useAccount();
  const isClient = useIsClient(); // Use o novo hook

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [courseType, setCourseType] = useState("");
  const [numberOfSemesters, setNumberOfSemesters] = useState("");
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");

  const {
    data: hash,
    error: writeError,
    isPending,
    writeContract
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    error: confirmError
  } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash,
    },
  });

  useEffect(() => {
    if (isPending) {
      setInternalStatusMessage("Aguardando confirmação na carteira...");
    } else if (writeError) {
      setInternalStatusMessage(`Erro na transação: ${writeError.message}`);
      console.error("Erro ao enviar transação:", writeError);
    } else if (isConfirming) {
      setInternalStatusMessage("Transação enviada, aguardando confirmação...");
    } else if (isConfirmed) {
      setInternalStatusMessage("Curso adicionado com sucesso!");
      setCode("");
      setName("");
      setCourseType("");
      setNumberOfSemesters("");
    } else if (confirmError) {
      setInternalStatusMessage(`Erro ao confirmar transação: ${confirmError.message}`);
      console.error("Erro ao confirmar transação:", confirmError);
    } else {
      setInternalStatusMessage("");
    }
  }, [isPending, writeError, isConfirming, isConfirmed, confirmError]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalStatusMessage("");

    if (!isConnected) {
      setInternalStatusMessage("Por favor, conecte sua carteira Dynamic.");
      return;
    }

    if (!code || !name || !courseType || !numberOfSemesters) {
      setInternalStatusMessage("Por favor, preencha todos os campos.");
      return;
    }

    try {
      // Validação para garantir que numberOfSemesters é um número válido antes de converter para BigInt
      const numSemesters = parseInt(numberOfSemesters, 10);
      if (isNaN(numSemesters) || numSemesters <= 0) {
        setInternalStatusMessage("Número de semestres inválido.");
        return;
      }
      const semestersAsBigInt = BigInt(numSemesters);

      writeContract({
        ...wagmiContractConfig,
        functionName: "addCourse",
        args: [
          address!,
          code,
          name,
          courseType,
          semestersAsBigInt,
        ],
      });
    } catch (error) {
      console.error("Erro ao preparar a transação:", error);
      setInternalStatusMessage(`Erro interno: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // Determinar o estado disabled para o botão.
  // Será true (desabilitado) se o cliente ainda não estiver hidratado.
  // Caso contrário, usará a lógica normal baseada em isConnected, isPending, isConfirming.
  const isDisabled = !isClient || !isConnected || isPending || isConfirming;

  return (
    <div className="add-course-container">
      <h2>Adicionar Curso</h2>
      <form className="form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Código do Curso"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          disabled={isDisabled} // Usar isDisabled aqui também
        />
        <input
          type="text"
          placeholder="Nome do Curso"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isDisabled}
        />
        <input
          type="text"
          placeholder="Tipo do Curso"
          value={courseType}
          onChange={(e) => setCourseType(e.target.value)}
          disabled={isDisabled}
        />
        <input
          type="number"
          placeholder="Número de Semestres"
          value={numberOfSemesters}
          onChange={(e) => setNumberOfSemesters(e.target.value)}
          disabled={isDisabled}
        />
        <button
          type="submit"
          disabled={isDisabled} // Usar isDisabled aqui
        >
          {isPending ? "Confirmar na Carteira..." : isConfirming ? "Adicionando Curso..." : "Adicionar Curso"}
        </button>
      </form>

      {internalStatusMessage && (
        <p className={`status-message ${writeError || confirmError ? 'error' : 'success'}`}>
          {internalStatusMessage}
        </p>
      )}
    </div>
  );
}