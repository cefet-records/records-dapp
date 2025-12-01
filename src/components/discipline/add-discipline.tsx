// components/AddDiscipline.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI"; // Ajuste o caminho conforme necessário

export function AddDiscipline() {
  const { address, isConnected } = useAccount(); // Pega o endereço da conta conectada
  const [courseCode, setCourseCode] = useState("");
  const [disciplineCode, setDisciplineCode] = useState("");
  const [disciplineName, setDisciplineName] = useState("");
  const [ementa, setEmenta] = useState("");
  const [workload, setWorkload] = useState(""); // Input de texto para Workload
  const [creditCount, setCreditCount] = useState(""); // Input de texto para Credit Count
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>(""); // Estado para a mensagem interna

  // Hook do wagmi para escrever no contrato
  const {
    data: hash, // Hash da transação
    error: writeError,
    isPending, // Indica se a transação está esperando confirmação na carteira
    writeContract // Função para chamar o contrato
  } = useWriteContract();

  // Hook do wagmi para esperar a confirmação da transação
  const {
    isLoading: isConfirming, // Indica se estamos esperando a transação ser minerada
    isSuccess: isConfirmed, // Indica se a transação foi confirmada com sucesso
    error: confirmError // Erro na confirmação da transação
  } = useWaitForTransactionReceipt({
    hash,
    query: {
      enabled: !!hash, // Só espera pela transação se houver um hash
    },
  });

  // Efeito para lidar com os estados da transação e atualizar a mensagem interna
  useEffect(() => {
    if (isPending) {
      setInternalStatusMessage("Aguardando confirmação na carteira...");
    } else if (writeError) {
      setInternalStatusMessage(`Erro na transação: ${writeError.message}`);
      console.error("Erro ao enviar transação:", writeError);
    } else if (isConfirming) {
      setInternalStatusMessage("Transação enviada, aguardando confirmação...");
    } else if (isConfirmed) {
      setInternalStatusMessage("Disciplina adicionada com sucesso!");
      // Limpa os campos após o sucesso
      setCourseCode("");
      setDisciplineCode("");
      setDisciplineName("");
      setEmenta("");
      setWorkload("");
      setCreditCount("");
    } else if (confirmError) {
      setInternalStatusMessage(`Erro ao confirmar transação: ${confirmError.message}`);
      console.error("Erro ao confirmar transação:", confirmError);
    } else {
        // Limpa a mensagem de status se nenhum estado acima estiver ativo
        setInternalStatusMessage("");
    }
  }, [isPending, writeError, isConfirming, isConfirmed, confirmError]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInternalStatusMessage(""); // Limpa a mensagem de status ao tentar um novo submit

    if (!isConnected) {
      setInternalStatusMessage("Por favor, conecte sua carteira Dynamic.");
      return;
    }

    if (!courseCode || !disciplineCode || !disciplineName || !ementa || !workload || !creditCount) {
      setInternalStatusMessage("Por favor, preencha todos os campos.");
      return;
    }

    try {
      // Converte workload e creditCount para BigInt, pois são uint256 no Solidity (presumido)
      const workloadAsBigInt = BigInt(parseInt(workload, 10));
      const creditCountAsBigInt = BigInt(parseInt(creditCount, 10));

      // Chama a função addDisciplineToCourse do contrato
      writeContract({
        ...wagmiContractConfig,
        functionName: "addDisciplineToCourse",
        args: [
          address!, // O endereço da instituição é o próprio remetente (msg.sender)
          courseCode,
          disciplineCode,
          disciplineName,
          ementa,
          workloadAsBigInt,
          creditCountAsBigInt,
        ],
      });
    } catch (error) {
      console.error("Erro ao preparar a transação:", error);
      setInternalStatusMessage(`Erro interno: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="add-discipline-container"> {/* Adicione uma classe para estilização */}
      <h2>Adicionar Disciplina</h2>
      <form className="form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Código do Curso"
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="text"
          placeholder="Código da Disciplina"
          value={disciplineCode}
          onChange={(e) => setDisciplineCode(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="text"
          placeholder="Nome da Disciplina"
          value={disciplineName}
          onChange={(e) => setDisciplineName(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="text"
          placeholder="Ementa"
          value={ementa}
          onChange={(e) => setEmenta(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="number" // Mudei para type="number" para melhor UX
          placeholder="Carga Horária (Workload)"
          value={workload}
          onChange={(e) => setWorkload(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="number" // Mudei para type="number" para melhor UX
          placeholder="Créditos (Credit Count)"
          value={creditCount}
          onChange={(e) => setCreditCount(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <button
          type="submit"
          // disabled={!isConnected || isPending || isConfirming}
        >
          {isPending ? "Confirmar na Carteira..." : isConfirming ? "Adicionando Disciplina..." : "Adicionar Disciplina"}
        </button>
      </form>

      {/* Exibir a mensagem de status internamente */}
      {internalStatusMessage && (
        <p className={`status-message ${writeError || confirmError ? 'error' : 'success'}`}>
          {internalStatusMessage}
        </p>
      )}
    </div>
  );
}