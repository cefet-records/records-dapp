// components/GetGrade.tsx
"use client";

import React, { useState, useEffect, useCallback, ChangeEvent } from "react";
import { useAccount, useReadContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";
import { decryptECIES } from '../../utils/cripto.utils';
import * as CryptoJS from "crypto-js";

import Card from "../card/card";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import UploadCard from "../upload-card/upload-card";
import { useSnackbar } from "../snackbar/snackbar-context";
import { StudentHistory } from "./student-history";

// [CONSTANTES]
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;

enum userTypes {
  OWNER = 'owner',
  INSTITUTION = 'institution',
  STUDENT = 'student',
  VISITOR = 'viewer'
}

const PREFIX_STUDENT = "studentEncryptedPrivateKey_";
const PREFIX_INSTITUTION = "institutionEncryptedPrivateKey_";
const PREFIX_VIEWER = "viewerEncryptedPrivateKey_";

interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

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

export function GetGrade() {
  const { address: connectedAddress, isConnected } = useAccount();
  const isClient = useIsClient();
  const { showSnackbar } = useSnackbar();

  // Estados de UI e Dados
  const [queryStudentAddress, setQueryStudentAddress] = useState<Address | "">("");
  const [queriedStudentGrades, setQueriedStudentGrades] = useState<GradeItem[] | null>(null);
  const [studentInfo, setStudentInfo] = useState<any | null>(null);
  const [institutionInfo, setInstitutionInfo] = useState<any | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  // Estados de Criptografia e Detecção
  const [encryptedBackupData, setEncryptedBackupData] = useState<BackupFileContent | null>(null);
  const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
  const [isFromLocalStorage, setIsFromLocalStorage] = useState(false);
  const [detectedRoleName, setDetectedRoleName] = useState("");

  const studentAddressValid = isAddress(queryStudentAddress);

  // --- HOOKS WAGMI ---
  const { data: userPermission, isFetching: isFetchingPermission } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getPermission',
    query: { enabled: !!connectedAddress && isClient },
  });

  const { refetch: refetchStudent } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  const { refetch: refetchEncryptedInfo } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getEncryptedInfoWithRecipientKey',
    args: connectedAddress && studentAddressValid ? [connectedAddress, queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  const { refetch: refetchTranscript } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentTranscript',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  const { refetch: refetchInstitutionData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudentInstitutionData',
    args: studentAddressValid ? [queryStudentAddress] : undefined,
    query: { enabled: false },
  });

  // --- LÓGICA DE DETECÇÃO AUTOMÁTICA ---
  useEffect(() => {
    if (isClient && isConnected && connectedAddress) {
      const permission = userPermission as string;
      const addr = connectedAddress.toLowerCase();
      
      // Tenta detectar pelo prefixo da permissão atual primeiro
      let primaryPrefix = "";
      let primaryName = "";
      if (permission === userTypes.STUDENT) { primaryPrefix = PREFIX_STUDENT; primaryName = "Aluno"; }
      else if (permission === userTypes.INSTITUTION) { primaryPrefix = PREFIX_INSTITUTION; primaryName = "Instituição"; }
      else { primaryPrefix = PREFIX_VIEWER; primaryName = "Visitante/Admin"; }

      const stored = localStorage.getItem(`${primaryPrefix}${addr}`);

      if (stored) {
        setEncryptedBackupData(JSON.parse(stored));
        setIsFromLocalStorage(true);
        setDetectedRoleName(primaryName);
      } else {
        // Fallback: procura em todos os prefixos para o endereço conectado
        const prefixes = [
          { p: PREFIX_STUDENT, n: "Aluno" },
          { p: PREFIX_INSTITUTION, n: "Instituição" },
          { p: PREFIX_VIEWER, n: "Visitante/Geral" }
        ];
        for (const item of prefixes) {
          const val = localStorage.getItem(`${item.p}${addr}`);
          if (val) {
            setEncryptedBackupData(JSON.parse(val));
            setIsFromLocalStorage(true);
            setDetectedRoleName(item.n);
            break;
          }
        }
      }
    }
  }, [isConnected, connectedAddress, userPermission, isFetchingPermission, isClient]);

  // --- HANDLERS ---
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const backupData = JSON.parse(await file.text());
        setEncryptedBackupData(backupData);
        setIsFromLocalStorage(false);
        showSnackbar("Arquivo de backup carregado com sucesso!", "success");
      } catch (err) {
        showSnackbar("Arquivo JSON inválido.", "error");
      }
    }
  };

  const fetchStudentData = async () => {
    if (!encryptedBackupData || !masterPasswordDecrypt) return;
    setIsFetching(true);

    try {
      // 1. Derivar Chave Privada
      const saltKDF = CryptoJS.enc.Hex.parse(encryptedBackupData.salt);
      const keyKDF = CryptoJS.PBKDF2(masterPasswordDecrypt, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });
      const iv = CryptoJS.enc.Hex.parse(encryptedBackupData.iv);
      const decryptedPrivKey = CryptoJS.AES.decrypt(encryptedBackupData.encryptedPrivateKey, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv,
      }).toString(CryptoJS.enc.Utf8);

      if (!decryptedPrivKey.startsWith('0x')) throw new Error("Senha mestra incorreta.");

      // 2. Buscar Dados
      const { data: student } = await refetchStudent();
      const { data: transcript } = await refetchTranscript();
      const { data: instData } = await refetchInstitutionData();

      // 3. Escolher Payload para Descriptografia
      let payload = (userPermission === userTypes.STUDENT) 
        ? (student as any).selfEncryptedInformation 
        : (student as any).institutionEncryptedInformation;

      if (userPermission === userTypes.VISITOR || userPermission === userTypes.OWNER) {
        const { data: visitorInfo } = await refetchEncryptedInfo();
        if (visitorInfo && visitorInfo !== '0x') payload = visitorInfo;
      }

      if (!payload || payload === '0x') throw new Error("Nenhum dado cifrado disponível para sua chave.");

      const decryptedInfo = await decryptECIES(payload, decryptedPrivKey as Hex);
      setStudentInfo(JSON.parse(decryptedInfo));

      // 4. Formatar Notas
      const rawGrades = transcript?.[0] || [];
      const discDetails = transcript?.[1] || [];
      const formattedGrades = rawGrades.map((g: any, i: number) => ({
        disciplineCode: g.disciplineCode,
        disciplineName: discDetails[i]?.name || "N/A",
        workload: Number(discDetails[i]?.workload) || 0,
        creditCount: Number(discDetails[i]?.creditCount) || 0,
        semester: Number(g.semester),
        year: Number(g.year),
        grade: Number(g.grade),
        attendance: Number(g.attendance),
        status: g.status,
      }));

      setQueriedStudentGrades(formattedGrades);
      setInstitutionInfo({ institutionName: instData?.[0]?.name });
      showSnackbar("Histórico escolar descriptografado!", "success");
    } catch (e: any) {
      showSnackbar(e.message || "Erro ao descriptografar dados.", "error");
    } finally {
      setIsFetching(false);
    }
  };

  if (!isClient) return null;

  return (
    <Card>
      <Stack spacing={3}>
        <Typography variant="h5" fontWeight="bold">Consulta de Histórico Acadêmico</Typography>
        
        <TextField
          label="Endereço do Estudante (0x...)"
          fullWidth
          value={queryStudentAddress}
          onChange={(e) => setQueryStudentAddress(e.target.value as Address)}
        />

        {/* DETECÇÃO DE CHAVE NO NAVEGADOR */}
        {isFromLocalStorage && encryptedBackupData ? (
          <Stack sx={{ p: 2, bgcolor: 'rgba(76, 175, 80, 0.08)', borderRadius: 2, border: '1px solid #4caf50' }}>
            <Typography variant="body2" color="success.main" fontWeight="bold">
              ✅ Chave de {detectedRoleName} encontrada no navegador
            </Typography>
            <Button 
              size="small" 
              sx={{ alignSelf: 'flex-start', mt: 1, textTransform: 'none' }} 
              onClick={() => {
                setEncryptedBackupData(null);
                setIsFromLocalStorage(false);
              }}
            >
              Usar outro arquivo de backup
            </Button>
          </Stack>
        ) : (
          <UploadCard 
            label="Upload do Backup da Chave Privada (.json)" 
            handleFileChange={handleFileChange} 
          />
        )}

        <TextField
          label="Senha Mestra"
          type="password"
          fullWidth
          value={masterPasswordDecrypt}
          onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
          disabled={!encryptedBackupData}
        />

        <Button 
          variant="contained" 
          size="large"
          onClick={fetchStudentData}
          disabled={isFetching || !encryptedBackupData || !studentAddressValid || masterPasswordDecrypt.length < 12}
        >
          {isFetching ? "Processando..." : "Visualizar Histórico"}
        </Button>

        {studentInfo && queriedStudentGrades && (
          <StudentHistory
            institutionInfo={institutionInfo}
            studentInfo={studentInfo}
            queryStudentAddress={queryStudentAddress as Address}
            queriedStudentGrades={queriedStudentGrades}
          />
        )}
      </Stack>
    </Card>
  );
}