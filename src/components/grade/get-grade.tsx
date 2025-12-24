// components/GetGrade.tsx
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";
import { decryptECIES } from '../../utils/cripto.utils';
import * as CryptoJS from "crypto-js";

// [DEFINIÇÕES DE INTERFACES E CONSTANTES]
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

enum userTypes {
  OWNER = 'owner',
  INSTITUTION = 'institution',
  STUDENT = 'student',
  VISITOR = 'viewer'
}

import Card from "../card/card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import UploadCard from "../upload-card/upload-card";
import { useSnackbar } from "../snackbar/snackbar-context";
import { StudentHistory } from "./student-history";

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

export interface GradeItem {
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

interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}
// Prefixes das chaves únicas no localStorage
const PREFIX_STUDENT = "studentEncryptedPrivateKey_";
const PREFIX_INSTITUTION = "institutionEncryptedPrivateKey_";
const PREFIX_VIEWER = "viewerEncryptedPrivateKey_";

// --- Mapeamento de Papéis e Funções de Utilidade de LocalStorage ---

interface RoleMap {
  prefix: string;
  displayName: string;
  // targetPayload não é necessário aqui, pois a busca é sempre a mesma: Transcript
}

const getRoleMap = (permission: string | undefined): RoleMap | null => {
  switch (permission) {
    case userTypes.STUDENT:
      return { prefix: PREFIX_STUDENT, displayName: 'Aluno' };
    case userTypes.INSTITUTION:
      return { prefix: PREFIX_INSTITUTION, displayName: 'Instituição' };
    case userTypes.VISITOR:
    case userTypes.OWNER:
      return { prefix: PREFIX_VIEWER, displayName: 'Visitante/Geral' };
    default:
      return null;
  }
};

const getLocalStorageKey = (address: Address, prefix: string): string => {
  return `${prefix}${address.toLowerCase()}`;
};

const loadBackupFromLocalStorage = (address: Address, prefix: string): BackupFileContent | null => {
  if (!address) return null;
  const key = getLocalStorageKey(address, prefix);
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      return JSON.parse(stored) as BackupFileContent;
    } catch (e) {
      console.error("Erro ao parsear backup do localStorage:", e);
      localStorage.removeItem(key);
      return null;
    }
  }
  return null;
};
// --- FIM DAS FUNÇÕES DE UTILIDADE ---


export function GetGrade() {
  const { address: connectedAddress, isConnected } = useAccount();
  const isClient = useIsClient();
  const { showSnackbar } = useSnackbar();

  const [queryStudentAddress, setQueryStudentAddress] = useState<Address | "">("");
  const [queriedStudentGrades, setQueriedStudentGrades] = useState<GradeItem[] | null>(null);
  const [studentInfo, setStudentInfo] = useState<any | null>(null);
  const [institutionInfo, setInstitutionInfo] = useState<any | null>(null);
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [isFetching, setIsFetching] = useState(false);

  // REMOVIDO: backupFile (não precisamos mais ler o arquivo File)
  // NOVO ESTADO: O backup criptografado (JSON) carregado do LS ou Upload
  const [encryptedBackupData, setEncryptedBackupData] = useState<BackupFileContent | null>(null);
  const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
  const [derivedPrivateKey, setDerivedPrivateKey] = useState<Hex | null>(null);
  const [isPrivateKeyDerived, setIsPrivateKeyDerived] = useState<boolean>(false);

  // NOVO ESTADO: O objeto RoleMap que define o papel do usuário conectado
  const [currentRoleMap, setCurrentRoleMap] = useState<RoleMap | null>(null);


  const studentAddressValid = isAddress(queryStudentAddress);
  const connectedAddressValid = isConnected && connectedAddress;

  // --- HOOK 1: Obter Permissão do Usuário Conectado (Já existia) ---
  const { data: userPermission, isFetching: isFetchingPermission } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getPermission',
    args: [],
    account: connectedAddress,
    query: {
      enabled: connectedAddressValid && isClient,
    },
  });

  // --- Outros HOOKs useReadContract (inalterados) ---
  const { data: studentDataResult, refetch: refetchStudent } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  const { data: encryptedInfoResult, refetch: refetchEncryptedInfo } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getEncryptedInfoWithRecipientKey',
    args: connectedAddress && studentAddressValid ? [connectedAddress, queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  const { data: transcriptResult, refetch: refetchTranscript } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentTranscript',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  const { data: institutionDataResult, refetch: refetchInstitutionData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentInstitutionData',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  // --- EFEITO 1: Carregar Backup do localStorage baseado na PERMISSÃO ---
  useEffect(() => {
    setEncryptedBackupData(null);
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setInternalStatusMessage("");

    if (connectedAddressValid && userPermission && !isFetchingPermission) {

      const roleMap = getRoleMap(userPermission as string);
      setCurrentRoleMap(roleMap);

      if (roleMap) {
        const loadedData = loadBackupFromLocalStorage(connectedAddress, roleMap.prefix);

        if (loadedData) {
          setEncryptedBackupData(loadedData);
          setInternalStatusMessage(`Backup criptografado (chave de ${roleMap.displayName}) carregado do navegador. Insira a Senha Mestra.`);
        } else {
          setInternalStatusMessage(`Chave de ${roleMap.displayName} não encontrada no navegador. Por favor, faça o upload do arquivo de backup (.json).`);
        }
      } else {
        setCurrentRoleMap(null);
        setInternalStatusMessage("Aguardando permissão ou conecte sua carteira.");
      }
    }

  }, [connectedAddressValid, connectedAddress, userPermission, isFetchingPermission]);


  // --- Função: Carregar Backup do Upload ---
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    setEncryptedBackupData(null);
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setInternalStatusMessage("");
    setQueriedStudentGrades(null);
    setStudentInfo(null);
    setInstitutionInfo(null);

    const file = event.target.files?.[0];
    if (file) {
      try {
        const fileContent = await file.text();
        const backupData: BackupFileContent = JSON.parse(fileContent);
        if (!backupData.encryptedPrivateKey || !backupData.salt || !backupData.iv) {
          throw new Error("Arquivo JSON de backup inválido.");
        }
        setEncryptedBackupData(backupData);
        setInternalStatusMessage("Arquivo de backup carregado. Por favor, insira a senha mestra.");
      } catch (err: any) {
        console.error("Erro ao ler/parsear arquivo:", err);
        setInternalStatusMessage(`Erro ao carregar arquivo: ${err.message || String(err)}`);
      }
    }
  };


  // --- Função: Descriptografar a Chave Privada (PBKDF2 + AES) (Adaptada para usar encryptedBackupData) ---
  const derivePrivateKey = useCallback(async (data: BackupFileContent): Promise<Hex | null> => {
    if (!masterPasswordDecrypt) {
      setInternalStatusMessage("Por favor, insira a senha mestra.");
      setIsPrivateKeyDerived(false);
      return null;
    }
    if (masterPasswordDecrypt.length < 12) {
      setInternalStatusMessage("A senha mestra deve ter pelo menos 12 caracteres.");
      setIsPrivateKeyDerived(false);
      return null;
    }

    setInternalStatusMessage("Derivando chave privada...");
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);

    try {
      const { encryptedPrivateKey, salt, kdfIterations, iv } = data;

      if (kdfIterations !== KDF_ITERATIONS) {
        throw new Error(`As iterações do KDF no arquivo (${kdfIterations}) não correspondem ao esperado (${KDF_ITERATIONS}).`);
      }
      if (!iv || typeof iv !== 'string' || iv.length !== 32) {
        throw new Error("IV (Initialization Vector) não encontrado ou inválido no backup.");
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
        throw new Error("Falha ao descriptografar a chave privada ou formato inválido.");
      }

      setDerivedPrivateKey(decryptedPrivateKeyHex as Hex);
      setIsPrivateKeyDerived(true);
      setInternalStatusMessage("Chave privada derivada com sucesso!");
      return decryptedPrivateKeyHex as Hex;

    } catch (err: any) {
      console.error("Erro ao derivar chave privada:", err);
      setInternalStatusMessage(`Falha ao derivar chave privada: ${err.message || String(err)}`);
      setDerivedPrivateKey(null);
      setIsPrivateKeyDerived(false);
      return null;
    }
  }, [masterPasswordDecrypt]); // Depende apenas da senha, o backup (data) é passado


  const fetchStudentData = async () => {
    showSnackbar("Buscando Histórico do estudante...", "info");
    setInternalStatusMessage("");
    setStudentInfo(null);
    setQueriedStudentGrades(null);
    setInstitutionInfo(null);
    setIsFetching(true);

    if (!connectedAddressValid || !studentAddressValid) {
      setInternalStatusMessage("Por favor, conecte sua carteira e insira um endereço de estudante válido.");
      setIsFetching(false);
      return;
    }
    if (!encryptedBackupData) {
      setInternalStatusMessage("Por favor, carregue o backup da chave privada.");
      setIsFetching(false);
      return;
    }


    // 1. Derivar a chave privada, usando o backup carregado
    let currentDerivedPrivateKey = derivedPrivateKey;
    if (!isPrivateKeyDerived || !currentDerivedPrivateKey) {
      currentDerivedPrivateKey = await derivePrivateKey(encryptedBackupData);
      if (!currentDerivedPrivateKey) {
        setIsFetching(false);
        return;
      }
    }

    let currentPermission = userPermission;
    if (!currentPermission) {
      setInternalStatusMessage("Não foi possível determinar a permissão do usuário.");
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

    const isSelf = currentPermission === userTypes.STUDENT;
    const isInstitutionOrOwner = currentPermission === userTypes.INSTITUTION || currentPermission === userTypes.OWNER;
    const isViewer = currentPermission === userTypes.VISITOR;

    // 2. Tentar buscar todos os dados
    try {
      const studentResponse = await refetchStudent();
      const studentData = studentResponse.data as any;

      if (!studentData) {
        setInternalStatusMessage("Estudante não encontrado ou erro ao buscar dados.");
        setIsFetching(false);
        return;
      }

      // 3. Lógica de Busca de Informações Cifradas (Payload)
      let studentEncryptedInformation: string | undefined = undefined;

      if (isSelf) {
        studentEncryptedInformation = studentData.selfEncryptedInformation;
      } else if (isInstitutionOrOwner) {
        studentEncryptedInformation = studentData.institutionEncryptedInformation;
      } else if (isViewer) {
        // Visitantes precisam buscar o payload que foi cifrado especificamente para eles
        const encryptedInfoResponse = await refetchEncryptedInfo();
        studentEncryptedInformation = encryptedInfoResponse.data as string;
      }

      const decryptorDisplay = currentRoleMap?.displayName || "usuário";

      if (!studentEncryptedInformation || studentEncryptedInformation === '0x') {
        setInternalStatusMessage(`Nenhuma informação encriptada disponível para sua permissão (${currentPermission}) ou payload vazio. O estudante já registrou seus dados?`);
        setIsFetching(false);
        return;
      }

      // 4. Buscar Transcript e Dados da Instituição (para exibição)
      const transcriptResponse = await refetchTranscript();
      const rawTranscriptData = transcriptResponse.data as [any[] | undefined, any[] | undefined] | null | undefined;

      const institutionDataResponse = await refetchInstitutionData();
      const [institutionDetails = null, courseDetails = null] = institutionDataResponse.data as any || [];

      // 5. Descriptografar Informações Pessoais
      let decryptedInformation: string;
      try {
        decryptedInformation = await decryptECIES(studentEncryptedInformation as Hex, currentDerivedPrivateKey);
      } catch (decryptError) {
        console.error("Erro ao descriptografar ECIES:", decryptError);
        setInternalStatusMessage(`Falha na descriptografia ECIES: ${decryptError instanceof Error ? decryptError.message : String(decryptError)}. Sua chave privada não corresponde ao payload cifrado.`);
        setIsFetching(false);
        return;
      }

      // 6. Processar e Exibir
      const parsedStudentInfo = JSON.parse(decryptedInformation);
      const studentHash = studentData.publicHash;
      parsedStudentInfo.hash = studentHash;

      // ... (Lógica de cálculo de hash e alinhamento de notas, inalterada) ...

      const studentGrades = rawTranscriptData?.[0] || [];
      const disciplineDetails = rawTranscriptData?.[1] || [];

      if (studentGrades.length !== disciplineDetails.length && (studentGrades.length > 0 || disciplineDetails.length > 0)) {
        setInternalStatusMessage("Falha: Inconsistência de dados (notas e detalhes de disciplina não se alinham).");
        setIsFetching(false);
        return;
      }

      // Recombina e formata as notas
      const gradesWithDetails: GradeItem[] = studentGrades.map((grade: any, index: number) => ({
        disciplineCode: grade.disciplineCode,
        disciplineName: disciplineDetails[index]?.name || "N/A",
        workload: Number(disciplineDetails[index]?.workload) || 0,
        creditCount: Number(disciplineDetails[index]?.creditCount) || 0,
        semester: Number(grade.semester),
        year: Number(grade.year),
        grade: Number(grade.grade),
        attendance: Number(grade.attendance),
        status: grade.status,
      }));

      setStudentInfo(parsedStudentInfo);
      setQueriedStudentGrades(gradesWithDetails);
      setInstitutionInfo(institutionDetails && courseDetails ? {
        institutionName: institutionDetails.name,
        courseCode: courseDetails.code,
        courseName: courseDetails.name,
      } : null);

      setInternalStatusMessage(`Histórico escolar obtido e descriptografado com sucesso usando chave de ${decryptorDisplay}!`);

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

  useEffect(() => {
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setInternalStatusMessage("");
    setQueriedStudentGrades(null);
    setStudentInfo(null);
    setInstitutionInfo(null);
  }, [queryStudentAddress]);

  useEffect(() => {
    // Resetar status de chave derivada ao mudar a senha
    setIsPrivateKeyDerived(false);
    setDerivedPrivateKey(null);
    setInternalStatusMessage("");
  }, [masterPasswordDecrypt]);


  // const isDisabled = !isClient || isFetching || !isConnected || !studentAddressValid || !encryptedBackupData || !masterPasswordDecrypt || masterPasswordDecrypt.length < 12 || isFetchingPermission;

  const backupSource = currentRoleMap?.displayName || "Visitante/Geral";
  const showUploadField = !encryptedBackupData && currentRoleMap !== null;
  const isDisabled = !isClient || isFetching || !isConnected || !studentAddressValid || !backupFile || !masterPasswordDecrypt || masterPasswordDecrypt.length < 12;

  return (
    <Card>
      <Stack>
        <Typography variant="h4" component="h4">Obter Histórico Escolar</Typography>
        <Typography variant="body1" component="p" className="info-text">
          Faça upload do arquivo de backup (.json) da chave privada e insira a senha mestra para descriptografar os dados do estudante e visualizar o histórico.
        </Typography>
      </Stack>
      <form onSubmit={handleSubmit}>
        <Stack gap={2}>
          <TextField
            label="Endereço do Estudante (0x...)"
            variant="outlined"
            required
            value={queryStudentAddress}
            onChange={(e) => {
              setQueryStudentAddress(e.target.value as Address);
              setInternalStatusMessage("");
            }}
            disabled={isFetching}
            size="small"
          />

          {/* UPLOAD DE ARQUIVO (SÓ VISÍVEL SE NADA FOI CARREGADO DO LOCALSTORAGE) */}
          {showUploadField && (
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
              {/* <p className="text-sm text-red-500 mt-1">⚠️ A chave de {backupSource} não foi encontrada no navegador. Faça o upload do arquivo.</p> */}
            </div>
          )}

          <div style={{ marginBottom: '1rem' }}>
            <label htmlFor="masterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha:
          {backupFile && <p className="info-text">Arquivo selecionado: {backupFile.name}</p>}
          <UploadCard label="Upload do Arquivo de Chave Privada Criptografada (.json)" handleFileChange={handleFileChange} />

          <Stack>
            <label htmlFor="masterPasswordDecrypt2" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha Mestra (usada para criptografar o arquivo de backup):
            </label>
            <TextField
              id="masterPasswordDecrypt2"
              label="Mínimo 12 caracteres"
              type="password"
              variant="outlined"
              required
              value={masterPasswordDecrypt}
              onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
              placeholder="Mínimo 12 caracteres"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', backgroundColor: '#fffbe6' }}
              required
              disabled={isFetching || !encryptedBackupData}
            />
            {/* {encryptedBackupData && !showUploadField && (
              <p className="text-sm text-green-500 mt-1">
                ✅ Backup de {backupSource} carregado do seu navegador. Digite a senha para usá-lo.
              </p>
            )} */}
            {masterPasswordDecrypt.length > 0 && masterPasswordDecrypt.length < 12 && (
              <p className="text-sm text-red-500 mt-1">⚠️ A senha mestra deve ter pelo menos 12 caracteres.</p>
            )}
          </div>

          {isPrivateKeyDerived && !internalStatusMessage.includes('Falha') && !internalStatusMessage.includes('Erro') && !isFetching && (
            <p style={{ color: 'green', marginTop: '0.8rem' }}>✅ Chave privada derivada com sucesso do arquivo e senha.</p>
          )}

{/* 
          <button type="submit" disabled={isDisabled}
            style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: isDisabled ? 0.6 : 1, marginTop: '10px' }}>
            {isFetching ? "Buscando Histórico..." : "Obter Histórico"}
          </button>
        </form>
      )} */}

      {/* {internalStatusMessage && (
        <p className={`status-message ${internalStatusMessage.includes('Erro') || internalStatusMessage.includes('Falha') ? 'text-red-500' : 'text-green-700'}`}
          style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
          {internalStatusMessage}
        </p>
      )} */}
              disabled={isFetching}
              size="small"
            />
          </Stack>

          <Button type="submit" className="register-button" disabled={isDisabled}>
            Obter Histórico
          </Button>
        </Stack>
      </form>

      {studentInfo?.name && queriedStudentGrades && institutionInfo && (
        <StudentHistory
          institutionInfo={institutionInfo}
          studentInfo={studentInfo}
          queryStudentAddress={queryStudentAddress}
          queriedStudentGrades={queriedStudentGrades}
        />
      )}
    </Card >
  );
}