// components/GetGrade.tsx
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../is-client";
import { decryptECIES } from '../../utils/cripto.utils';
import { Hex } from "viem";
import * as CryptoJS from "crypto-js"; // Importar CryptoJS

// Mock simples para createHash (mantido por enquanto)
const createHashMock = (algorithm: string) => {
  return {
    update: (data: string) => ({
      digest: (encoding: 'hex') => {
        if (algorithm === 'sha256') {
          console.warn("Using mock crypto.createHash for SHA256. Not suitable for production.");
          // Retorna um hash mock, idealmente você usaria uma implementação real para segurança
          return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        }
        return '';
      },
    }),
  };
};

interface GradeItem {
  disciplineCode: string;
  disciplineName: string;
  workload: number;
  creditCount: number;
  semester: number;
  year: number;
  grade: number;
  attendance: number;
  status: boolean;
}

// Interface para o conteúdo do arquivo de backup
interface BackupFileContent {
  encryptedPrivateKey: string; // Chave privada criptografada em Base64
  salt: string;                // Salt usado no PBKDF2 em Hex
  kdfIterations: number;       // Número de iterações do PBKDF2
  iv: string;                  // Initialization Vector em Hex
}

// Constantes para KDF (devem ser as mesmas usadas na geração do backup)
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

export function GetGrade() {
  const { address: connectedAddress, isConnected } = useAccount();
  const isClient = useIsClient();

  const [queryStudentAddress, setQueryStudentAddress] = useState<Address | "">("");
  const [queriedStudentGrades, setQueriedStudentGrades] = useState<GradeItem[] | null>(null);
  const [studentInfo, setStudentInfo] = useState<any | null>(null);
  const [institutionInfo, setInstitutionInfo] = useState<any | null>(null);
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetching, setIsFetching] = useState(false);

  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
  const [derivedPrivateKey, setDerivedPrivateKey] = useState<Hex | null>(null);
  const [isPrivateKeyDerived, setIsPrivateKeyDerived] = useState<boolean>(false);

  const studentAddressValid = isAddress(queryStudentAddress);

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
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const { data: encryptedInfoResult, refetch: refetchEncryptedInfo } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getEncryptedInfoWithRecipientKey',
    args: connectedAddress && studentAddressValid ? [connectedAddress, queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const { data: transcriptResult, refetch: refetchTranscript } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentTranscript',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const { data: institutionDataResult, refetch: refetchInstitutionData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentInstitutionData',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: {
      enabled: false,
    },
  });

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setBackupFile(null);
    setDerivedPrivateKey(null);
    setIsPrivateKeyDerived(false);
    setInternalStatusMessage("");
    setQueriedStudentGrades(null);
    setStudentInfo(null);
    setInstitutionInfo(null);

    const file = event.target.files?.[0];
    if (file) {
      setBackupFile(file);
    }
  };

  const derivePrivateKey = useCallback(async (): Promise<Hex | null> => {
    if (!backupFile || !masterPasswordDecrypt) {
      setInternalStatusMessage("Por favor, faça upload do arquivo de backup e insira a senha mestra.");
      setIsPrivateKeyDerived(false);
      return null;
    }
    if (masterPasswordDecrypt.length < 12) {
      setInternalStatusMessage("A senha mestra deve ter pelo menos 12 caracteres.");
      setIsPrivateKeyDerived(false);
      return null;
    }

    setInternalStatusMessage("Lendo arquivo e derivando chave privada...");
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);

    try {
      const fileContent = await backupFile.text();
      const backupData: BackupFileContent = JSON.parse(fileContent);
      console.log("backupData", backupData);
      const { encryptedPrivateKey, salt, kdfIterations, iv } = backupData;

      if (kdfIterations !== KDF_ITERATIONS) {
        throw new Error(`As iterações do KDF no arquivo (${kdfIterations}) não correspondem ao esperado (${KDF_ITERATIONS}).`);
      }
      if (!iv || typeof iv !== 'string' || iv.length !== 32) {
        throw new Error("IV (Initialization Vector) não encontrado ou inválido no arquivo de backup.");
      }

      const saltKDF = CryptoJS.enc.Hex.parse(salt);
      const keyKDF = CryptoJS.PBKDF2(masterPasswordDecrypt, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: kdfIterations,
      });

      const ivFromBackup = CryptoJS.enc.Hex.parse(iv);

      const decryptedWords = CryptoJS.AES.decrypt(encryptedPrivateKey, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivFromBackup,
      });

      const decryptedPrivateKeyHex = decryptedWords.toString(CryptoJS.enc.Utf8);

      if (!decryptedPrivateKeyHex || !decryptedPrivateKeyHex.startsWith('0x') || decryptedPrivateKeyHex.length !== 66) {
        throw new Error("Falha ao descriptografar a chave privada ou formato inválido (o resultado não é uma chave privada ECDSA Hex).");
      }

      setDerivedPrivateKey(decryptedPrivateKeyHex as Hex);
      setIsPrivateKeyDerived(true);
      setInternalStatusMessage("Chave privada derivada com sucesso do arquivo e senha.");
      return decryptedPrivateKeyHex as Hex;

    } catch (err: any) {
      console.error("Erro ao derivar chave privada:", err);
      setInternalStatusMessage(`Falha ao derivar chave privada: ${err.message || String(err)}`);
      setDerivedPrivateKey(null);
      setIsPrivateKeyDerived(false);
      return null;
    }
  }, [backupFile, masterPasswordDecrypt]);

  const fetchStudentData = async () => {
    setInternalStatusMessage("");
    setStudentInfo(null);
    setQueriedStudentGrades(null);
    setInstitutionInfo(null);
    setIsFetching(true);

    let currentDerivedPrivateKey = derivedPrivateKey;
    if (!isPrivateKeyDerived || !currentDerivedPrivateKey) {
      setInternalStatusMessage("Iniciando derivação da chave privada...");
      currentDerivedPrivateKey = await derivePrivateKey();
      if (!currentDerivedPrivateKey) {
        setIsFetching(false);
        return;
      }
    }

    console.log("--- fetchStudentData Started ---");
    console.log("isConnected:", isConnected);
    console.log("connectedAddress:", connectedAddress);
    console.log("queryStudentAddress (input):", queryStudentAddress);
    console.log("derivedPrivateKey (present):", !!currentDerivedPrivateKey);

    if (!isConnected || !connectedAddress) {
      setInternalStatusMessage("Por favor, conecte sua carteira.");
      setIsFetching(false);
      return;
    }

    if (!studentAddressValid) {
      setInternalStatusMessage("Por favor, insira um endereço de estudante válido.");
      setIsFetching(false);
      return;
    }

    if (!currentDerivedPrivateKey) {
      setInternalStatusMessage("Chave privada não derivada. Verifique o arquivo de backup e a senha.");
      setIsFetching(false);
      return;
    }

    try {
      const studentResponse = await refetchStudent();
      const studentData = studentResponse.data as any;

      console.log("studentData fetched:", studentData);

      if (!studentData) {
        setInternalStatusMessage("Estudante não encontrado ou erro ao buscar dados.");
        setIsFetching(false);
        return;
      }

      let currentPermission = userPermission;
      console.log("userPermission from hook:", userPermission);
      console.log("currentPermission (after assignment):", currentPermission);

      if (!currentPermission) {
        setInternalStatusMessage("Não foi possível determinar a permissão do usuário.");
        setIsFetching(false);
        return;
      }

      let studentEncryptedInformation: string | undefined = undefined;

      // --- Lógica para buscar a informação criptografada correta ---
      if (currentPermission === "student") {
        studentEncryptedInformation = studentData.selfEncryptedInformation;
        console.log("Permission: student, studentEncryptedInformation:", studentEncryptedInformation);
      } else if (currentPermission === "institution" || currentPermission === "owner") {
        studentEncryptedInformation = studentData.institutionEncryptedInformation;
        console.log("Permission: institution, studentEncryptedInformation:", studentEncryptedInformation);
      } else if (currentPermission === "viewer") {
        console.log("Permission: viewer, refetching encryptedInfo from getEncryptedInfoWithRecipientKey...");
        const encryptedInfoResponse = await refetchEncryptedInfo();
        studentEncryptedInformation = encryptedInfoResponse.data as string;
        console.log("Permission: viewer, encryptedInfoResponse.data:", studentEncryptedInformation);
      } else {
        setInternalStatusMessage("Permissão de usuário inválida ou não determinada no contrato!");
        setIsFetching(false);
        return;
      }
      // --- Fim da lógica de busca ---


      if (!studentEncryptedInformation || studentEncryptedInformation === '0x') {
        setInternalStatusMessage("Nenhuma informação encriptada disponível para sua permissão ou payload vazio.");
        setIsFetching(false);
        return;
      }

      const studentHash = studentData.publicHash;

      const transcriptResponse = await refetchTranscript();
      const [studentGrades = [], disciplineDetails = []] = transcriptResponse.data as any || [];

      const institutionDataResponse = await refetchInstitutionData();
      const [institutionDetails = null, courseDetails = null] = institutionDataResponse.data as any || [];

      let decryptedInformation: string;

      try {
        decryptedInformation = await decryptECIES(studentEncryptedInformation as Hex, currentDerivedPrivateKey);
      } catch (decryptError) {
        console.error("Erro ao descriptografar:", decryptError);
        setInternalStatusMessage(`Falha na descriptografia: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}. Verifique a chave privada e a permissão.`);
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
      setInternalStatusMessage("Histórico escolar obtido e descriptografado com sucesso!");

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

  const groupGradesBySemester = (grades: GradeItem[] | null): Record<number, GradeItem[]> => {
    if (!grades) return {};
    return grades.reduce((groups, grade) => {
      if (!groups[grade.semester]) {
        groups[grade.semester] = [];
      }
      groups[grade.semester].push(grade);
      return groups;
    }, {} as Record<number, GradeItem[]>);
  };

  useEffect(() => {
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setInternalStatusMessage("");
    setQueriedStudentGrades(null);
    setStudentInfo(null);
    setInstitutionInfo(null);
  }, [queryStudentAddress]);

  useEffect(() => {
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setInternalStatusMessage("");
  }, [backupFile, masterPasswordDecrypt]);


  const isDisabled = !isClient || isFetching || !isConnected || !studentAddressValid || !backupFile || !masterPasswordDecrypt || masterPasswordDecrypt.length < 12;

  return (
    <div className="get-grade-container" style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
      <h2>Obter Histórico Escolar</h2>
      <p className="text-sm" style={{ marginBottom: '10px', color: 'gray' }}>
        Faça upload do arquivo de backup (.json) da chave privada e insira a senha mestra para descriptografar os dados do estudante e visualizar o histórico.
      </p>

      {!isConnected || !connectedAddress ? (
        <p style={{ color: 'orange', marginBottom: '1rem' }}>⚠️ Conecte sua carteira para buscar o histórico.</p>
      ) : (
        <form className="form space-y-3" onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Endereço do Estudante (0x...)"
            value={queryStudentAddress}
            onChange={(e) => {
              setQueryStudentAddress(e.target.value as Address);
              setInternalStatusMessage("");
            }}
            className="w-full p-2 border rounded"
            disabled={isFetching}
          />
          {!studentAddressValid && queryStudentAddress !== '' && (
            <p className="text-sm text-red-500">⚠️ Endereço do estudante inválido.</p>
          )}

          <div style={{ marginTop: '1rem' }}>
            <label htmlFor="backupFile" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Upload do Arquivo de Chave Privada Criptografada (.json):
            </label>
            <input
              id="backupFile"
              type="file"
              accept=".json"
              onChange={handleFileChange}
              className="w-full p-2 border rounded"
              disabled={isFetching}
              style={{ backgroundColor: '#fffbe6' }}
            />
            {backupFile && <p className="text-sm text-gray-600 mt-1">Arquivo selecionado: {backupFile.name}</p>}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="masterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha Mestra (usada para criptografar o arquivo de backup):
            </label>
            <input
              id="masterPasswordDecrypt"
              type="password"
              value={masterPasswordDecrypt}
              onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
              placeholder="Mínimo 12 caracteres"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fffbe6' }}
              required
              disabled={isFetching}
            />
            {masterPasswordDecrypt.length > 0 && masterPasswordDecrypt.length < 12 && (
              <p className="text-sm text-red-500 mt-1">⚠️ A senha mestra deve ter pelo menos 12 caracteres.</p>
            )}
          </div>

          {isPrivateKeyDerived && !internalStatusMessage.includes('Falha') && !internalStatusMessage.includes('Erro') && !isFetching && (
            <p style={{ color: 'green', marginTop: '0.8rem' }}>✅ Chave privada derivada com sucesso do arquivo e senha.</p>
          )}


          <button type="submit" disabled={isDisabled}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: isDisabled ? 0.6 : 1, marginTop: '10px' }}>
            {isFetching ? "Buscando Histórico..." : "Obter Histórico"}
          </button>
        </form>
      )}

      {internalStatusMessage && (
        <p className={`status-message ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'text-red-500' : 'text-green-700'}`}
          style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
          {internalStatusMessage}
        </p>
      )}

      {studentInfo?.name && queriedStudentGrades && institutionInfo && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
          <h3>Detalhes do Histórico</h3>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 institution-info">
              <tr>
                <td colSpan={7} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  <strong>{institutionInfo.institutionName}</strong>
                  <br />
                  {institutionInfo.courseCode} - {institutionInfo.courseName}
                </td>
              </tr>
            </thead>
            <thead className="bg-gray-50 student-info">
              <tr>
                <td colSpan={7} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
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
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Código</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Disciplina</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Carga Horária</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Créditos</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nota</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequência</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(groupGradesBySemester(queriedStudentGrades)).map(
                ([semester, grades]: [string, GradeItem[]]) => (
                  <React.Fragment key={semester}>
                    <tr className="subheader bg-gray-100">
                      <td colSpan={7} className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        Semestre {semester}
                      </td>
                    </tr>
                    {grades.map((grade: GradeItem) => (
                      <tr key={`${grade.disciplineCode}-${grade.year}-${grade.semester}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{grade.disciplineCode}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{grade.disciplineName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{grade.workload}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{grade.creditCount}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{grade.grade.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 text-center">{grade.attendance}%</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${grade.status ? 'text-green-600' : 'text-red-600'}`}>
                          {grade.status ? 'Aprovado' : 'Reprovado'}
                        </td>
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