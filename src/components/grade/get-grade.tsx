// components/GetGrade.tsx
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, Address } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";
import { decryptECIES } from '../../utils/cripto.utils';
import { Hex } from "viem";
import * as CryptoJS from "crypto-js"; // Importar CryptoJS
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
  const { showSnackbar } = useSnackbar();

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
    showSnackbar("Buscando Histórico do estudante...", "info");
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