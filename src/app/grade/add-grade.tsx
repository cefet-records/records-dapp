// components/AddGrade.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { isAddress } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI"; // Ajuste o caminho conforme necessário

export function AddGrade() {
  const { address, isConnected } = useAccount();
  const [studentAddress, setStudentAddress] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [disciplineCode, setDisciplineCode] = useState("");
  const [semester, setSemester] = useState("");
  const [year, setYear] = useState("");
  const [grade, setGrade] = useState("");
  const [attendance, setAttendance] = useState("");
  const [status, setStatus] = useState("");
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");

  const { data: hash, error: writeError, isPending, writeContract } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed, error: confirmError } = useWaitForTransactionReceipt({
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
      setInternalStatusMessage("Nota adicionada com sucesso!");
      setStudentAddress("");
      setCourseCode("");
      setDisciplineCode("");
      setSemester("");
      setYear("");
      setGrade("");
      setAttendance("");
      setStatus("");
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

    if (!studentAddress || !courseCode || !disciplineCode || !semester || !year || !grade || !attendance || !status) {
      setInternalStatusMessage("Por favor, preencha todos os campos.");
      return;
    }

    if (!isAddress(studentAddress)) {
      setInternalStatusMessage("Endereço do estudante inválido.");
      return;
    }

    try {
      // AJUSTE AQUI: Converter para NUMBER em vez de BigInt, pois o ABI espera number para uint8/uint16
      const parsedSemester = parseInt(semester, 10);
      const parsedYear = parseInt(year, 10);
      const parsedGrade = parseInt(grade, 10);
      const parsedAttendance = parseInt(attendance, 10);
      const parsedStatus = status.toLowerCase() === "true";

      // Validação adicional para garantir que os números cabem nos uint8/uint16
      if (isNaN(parsedSemester) || parsedSemester < 0 || parsedSemester > 255) {
          setInternalStatusMessage("Semestre inválido (0-255)."); return;
      }
      if (isNaN(parsedYear) || parsedYear < 0 || parsedYear > 65535) {
          setInternalStatusMessage("Ano inválido (0-65535)."); return;
      }
      if (isNaN(parsedGrade) || parsedGrade < 0 || parsedGrade > 255) {
          setInternalStatusMessage("Nota inválida (0-255)."); return;
      }
      if (isNaN(parsedAttendance) || parsedAttendance < 0 || parsedAttendance > 255) {
          setInternalStatusMessage("Frequência inválida (0-255)."); return;
      }


      const gradeInfo = {
        disciplineCode: disciplineCode,
        semester: parsedSemester, // AGORA É NUMBER
        year: parsedYear,         // AGORA É NUMBER
        grade: parsedGrade,       // AGORA É NUMBER
        attendance: parsedAttendance, // AGORA É NUMBER
        status: parsedStatus,
      };

      writeContract({
        ...wagmiContractConfig,
        functionName: "addGrade",
        args: [
          address!,
          studentAddress as `0x${string}`,
          courseCode,
          gradeInfo,
        ],
      });
    } catch (error) {
      console.error("Erro ao preparar a transação:", error);
      setInternalStatusMessage(`Erro interno: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="add-grade-container">
      <h2>Adicionar Nota</h2>
      <form className="form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Endereço do Estudante (0x...)"
          value={studentAddress}
          onChange={(e) => setStudentAddress(e.target.value)}
          disabled={isPending || isConfirming}
        />
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
          type="number"
          placeholder="Semestre (0-255)"
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="number"
          placeholder="Ano (0-65535)"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="number"
          placeholder="Nota (0-255)"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <input
          type="number"
          placeholder="Frequência (0-255)"
          value={attendance}
          onChange={(e) => setAttendance(e.target.value)}
          disabled={isPending || isConfirming}
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={isPending || isConfirming}
        >
            <option value="">Selecione o Status</option>
            <option value="true">Aprovado</option>
            <option value="false">Reprovado</option>
        </select>
        <button
          type="submit"
          // disabled={!isConnected || isPending || isConfirming}
        >
          {isPending ? "Confirmar na Carteira..." : isConfirming ? "Adicionando Nota..." : "Adicionar Nota"}
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