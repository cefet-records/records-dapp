// components/GetGrade.tsx
"use client";

import React, { useState, useEffect } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../is-client";
import { decryptECIES } from '../../utils/cripto.utils';
import { Hex } from "viem";

// Mock simples para createHash (mantido por enquanto)
const createHashMock = (algorithm: string) => {
  return {
    update: (data: string) => ({
      digest: (encoding: 'hex') => {
        if (algorithm === 'sha256') {
          console.warn("Using mock crypto.createHash for SHA256. Not suitable for production.");
          return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }
        return '';
      },
    }),
  };
};

// ===============================================
// DEFINIÇÃO DO TIPO PARA UMA ÚNICA NOTA (GRADE)
// Isso ajudará o TypeScript a entender a estrutura
// ===============================================
interface GradeItem {
  disciplineCode: string;
  disciplineName: string;
  workload: number;
  creditCount: number;
  semester: number;
  year: number;
  grade: number;
  attendance: number;
  status: boolean; // Ou string, dependendo de como você mapeia 'Aprovado'/'Reprovado'
}
// ===============================================

export function GetGrade() {
  const { address: connectedAddress, isConnected } = useAccount();
  const isClient = useIsClient();

  const [queryStudentAddress, setQueryStudentAddress] = useState<Address | "">("");
  const [privateKeyInput, setPrivateKeyInput] = useState<Hex | "">("");
  // Tipando queriedStudentGrades com o array de GradeItem
  const [queriedStudentGrades, setQueriedStudentGrades] = useState<GradeItem[] | null>(null);
  const [studentInfo, setStudentInfo] = useState<any | null>(null);
  const [institutionInfo, setInstitutionInfo] = useState<any | null>(null);
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetching, setIsFetching] = useState(false);

  // --- DECLARAÇÃO DOS HOOKS useReadContract NO NÍVEL SUPERIOR ---

  const { data: userPermission } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getPermission',
    args: [],
    account: connectedAddress,
    query: {
      enabled: isConnected && !!connectedAddress && isClient,
    },
  });

  const { data: studentDataResult, refetch: refetchStudent } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: queryStudentAddress ? [queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const { data: encryptedInfoResult, refetch: refetchEncryptedInfo } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getEncryptedInfoWithRecipientKey',
    args: connectedAddress && queryStudentAddress ? [connectedAddress, queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const { data: transcriptResult, refetch: refetchTranscript } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentTranscript',
    args: queryStudentAddress ? [queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const { data: institutionDataResult, refetch: refetchInstitutionData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentInstitutionData',
    args: queryStudentAddress ? [queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });


  const fetchStudentData = async () => {
    setInternalStatusMessage("");
    setStudentInfo(null);
    setQueriedStudentGrades(null);
    setInstitutionInfo(null);
    setIsFetching(true);

    console.log("--- fetchStudentData Started ---");
    console.log("isConnected:", isConnected);
    console.log("connectedAddress:", connectedAddress);
    console.log("queryStudentAddress (input):", queryStudentAddress);
    console.log("privateKeyInput (present):", !!privateKeyInput); // Apenas verifica se está presente, não exibe a chave

    if (!isConnected || !connectedAddress) {
      setInternalStatusMessage("Por favor, conecte sua carteira.");
      setIsFetching(false);
      return;
    }

    if (!queryStudentAddress || !isAddress(queryStudentAddress)) {
      setInternalStatusMessage("Por favor, insira um endereço de estudante válido.");
      setIsFetching(false);
      return;
    }

    if (!privateKeyInput || privateKeyInput.length !== 66 || !privateKeyInput.startsWith('0x')) {
        setInternalStatusMessage("Por favor, insira uma chave privada válida (0x...).");
        setIsFetching(false);
        return;
    }

    try {
      const studentResponse = await refetchStudent();
      const studentData = studentResponse.data;
      console.log("studentData fetched:", studentData);

      if (!studentData) {
        setInternalStatusMessage("Estudante não encontrado ou erro ao buscar dados.");
        setIsFetching(false);
        return;
      }

      let currentPermission = userPermission;
      console.log("userPermission from hook:", userPermission); // Log antes do 'if'
      console.log("currentPermission (after assignment):", currentPermission);

      if (!currentPermission) {
        setInternalStatusMessage("Não foi possível determinar a permissão do usuário.");
        setIsFetching(false);
        return;
      }

      let studentEncryptedInformation: string | undefined = undefined;

      switch(currentPermission) {
          case "student":
              studentEncryptedInformation = studentData.selfEncryptedInformation;
              console.log("Permission: student, studentEncryptedInformation:", studentEncryptedInformation);
              break;
          case "institution":
              studentEncryptedInformation = studentData.institutionEncryptedInformation;
              console.log("Permission: institution, studentEncryptedInformation:", studentEncryptedInformation);
              break;
          case "viewer":
              console.log("Permission: viewer, refetching encryptedInfo...");
              const encryptedInfoResponse = await refetchEncryptedInfo();
              studentEncryptedInformation = encryptedInfoResponse.data;
              console.log("Permission: viewer, encryptedInfoResponse.data:", studentEncryptedInformation);
              break;
          default:
              setInternalStatusMessage("Permissão de usuário inválida ou não determinada no contrato!");
              setIsFetching(false);
              return;
      }

      if (!studentEncryptedInformation) {
        setInternalStatusMessage("Nenhuma informação encriptada disponível com sua permissão.");
        setIsFetching(false);
        return;
      }

      const studentHash = studentData.publicHash;

      const transcriptResponse = await refetchTranscript();
      const [studentGrades = [], disciplineDetails = []] = transcriptResponse.data || [];

      const institutionDataResponse = await refetchInstitutionData();
      const [institutionDetails = null, courseDetails = null] = institutionDataResponse.data || [];

      let decryptedInformation: string;

      try {
          decryptedInformation = await decryptECIES(studentEncryptedInformation, privateKeyInput);
      } catch (decryptError) {
          console.error("Erro ao descriptografar:", decryptError);
          setInternalStatusMessage(`Falha na descriptografia: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}. Verifique a chave privada.`);
          setIsFetching(false);
          return;
      }

      const parsedStudentInfo = JSON.parse(decryptedInformation);
      parsedStudentInfo.hash = studentHash;

      let calculatedHash = 'Hash not calculated in browser (node:crypto not available)';
      if (isClient && typeof window.crypto !== 'undefined') {
        try {
            const dataToHash = parsedStudentInfo.name + " - " + parsedStudentInfo.document + " - " + parsedStudentInfo.salt;
            calculatedHash = createHashMock('sha256').update(dataToHash).digest('hex');
        } catch (hashError) {
            console.error("Erro ao calcular hash com Web Crypto API ou mock:", hashError);
            calculatedHash = 'Failed to calculate hash';
        }
      }
      parsedStudentInfo.calculatedHash = calculatedHash;

      setStudentInfo(parsedStudentInfo);

      const gradesWithDetails: GradeItem[] = studentGrades.map((grade: any, index: number) => ({
          disciplineCode: grade.disciplineCode,
          disciplineName: disciplineDetails[index]?.name,
          workload: Number(disciplineDetails[index]?.workload),
          creditCount: Number(disciplineDetails[index]?.creditCount),
          semester: Number(grade.semester),
          year: Number(grade.year),
          grade: Number(grade.grade),
          attendance: Number(grade.attendance),
          status: grade.status,
      }));
      setQueriedStudentGrades(gradesWithDetails);

      if (institutionDetails && courseDetails) {
          setInstitutionInfo({
              institutionName: institutionDetails.name,
              courseCode: courseDetails.code,
              courseName: courseDetails.name,
          });
      } else {
          setInstitutionInfo(null);
      }

    } catch (error) {
      console.error("Erro geral ao buscar notas:", error);
      setInternalStatusMessage(`Falha ao buscar detalhes das notas: ${error instanceof Error ? error.message : String(error)}`);
      setStudentInfo(null);
      setQueriedStudentGrades(null);
      setInstitutionInfo(null);
    } finally {
      setIsFetching(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStudentData();
  };

  // ===============================================
  // TIPAGEM ATUALIZADA PARA groupGradesBySemester
  // ===============================================
  const groupGradesBySemester = (grades: GradeItem[] | null): Record<number, GradeItem[]> => {
    if (!grades) return {};
    return grades.reduce((groups, grade) => {
      if (!groups[grade.semester]) {
        groups[grade.semester] = [];
      }
      groups[grade.semester].push(grade);
      return groups;
    }, {} as Record<number, GradeItem[]>); // Tipo explícito para o acumulador
  };
  // ===============================================

  const isDisabled = !isClient || isFetching || !isConnected || !queryStudentAddress || !isAddress(queryStudentAddress) || !privateKeyInput || privateKeyInput.length !== 66 || !privateKeyInput.startsWith('0x');

  return (
    <div className="get-grade-container">
      <h2>Obter Histórico Escolar</h2>
      <form className="form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Endereço do Estudante (0x...)"
          value={queryStudentAddress}
          onChange={(e) => {
            setQueryStudentAddress(e.target.value as Address);
            setInternalStatusMessage("");
          }}
          // disabled={isDisabled && !isFetching}
        />
        <input
          type="password"
          placeholder="Chave Privada (0x...)"
          value={privateKeyInput}
          onChange={(e) => {
            setPrivateKeyInput(e.target.value as Hex);
            setInternalStatusMessage("");
          }}
          // disabled={isDisabled && !isFetching}
          autoComplete="off"
        />
        <button type="submit" >
          {isFetching ? "Buscando Histórico..." : "Obter Histórico"}
        </button>
      </form>

      {internalStatusMessage && (
        <p className={`status-message ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'error' : 'info'}`}>
          {internalStatusMessage}
        </p>
      )}

      {studentInfo?.name && queriedStudentGrades && institutionInfo && (
        <div>
          <h3>Detalhes do Histórico</h3>
          <table>
            <thead className="institution-info">
              <tr>
                <td colSpan={7}>
                  <strong>{institutionInfo.institutionName}</strong>
                  <br />
                  {institutionInfo.courseCode} - {institutionInfo.courseName}
                </td>
              </tr>
            </thead>
            <thead className="student-info">
              <tr>
                <td colSpan={7}>
                  <strong>Nome do Estudante: {studentInfo.name}</strong>
                  <br />
                  Documento do Estudante: {studentInfo.document}
                  <br />
                  Endereço do Estudante: {queryStudentAddress}
                  <br />
                  Hash do Estudante (Blockchain): {studentInfo.hash}
                  <br />
                  Hash do Estudante (calculado): {studentInfo.calculatedHash}
                </td>
              </tr>
            </thead>
            <thead>
              <tr>
                <th>Código da Disciplina</th>
                <th>Nome da Disciplina</th>
                <th className="workload">Carga Horária</th>
                <th className="creditCount">Créditos</th>
                <th className="grade">Nota</th>
                <th className="attendance">Frequência</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {/* ===============================================
                  AQUI ESTÁ A CORREÇÃO PRINCIPAL:
                  Tipamos 'grades' explicitamente como GradeItem[]
                  =============================================== */}
              {Object.entries(groupGradesBySemester(queriedStudentGrades)).map(
                ([semester, grades]: [string, GradeItem[]]) => ( // <-- Corrigido aqui
                  <React.Fragment key={semester}>
                    <tr className="subheader">
                      <td colSpan={7}>Semestre {semester}</td>
                    </tr>
                    {grades.map((grade: GradeItem) => ( // <-- E aqui, garantindo que 'grade' é GradeItem
                      <tr key={`${grade.disciplineCode}-${grade.year}-${grade.semester}`}>
                        <td>{grade.disciplineCode}</td>
                        <td>{grade.disciplineName}</td>
                        <td className="workload">{grade.workload}</td>
                        <td className="creditCount">{grade.creditCount}</td>
                        <td className="grade">{grade.grade}</td>
                        <td className="attendance">{grade.attendance}</td>
                        <td>{grade.status ? 'Aprovado' : 'Reprovado'}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}