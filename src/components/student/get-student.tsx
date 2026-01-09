'use client';

import React, { JSX, useState, useEffect, useCallback, ChangeEvent } from "react";
import { useReadContract, useAccount, type BaseError } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { Address, isAddress, Hex, keccak256, toBytes } from "viem";
import { decryptECIES } from "@/utils/cripto.utils";
import CryptoJS from "crypto-js";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { hexToBytes } from "viem";
import { Base64 } from 'js-base64';

import Card from "../card/card";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import UploadCard from "../upload-card/upload-card";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import RadioGroup from "@mui/material/RadioGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import styles from "./get-student.module.css";
import TransactionInfo from "../transaction-info/transaction-info";
import { useSnackbar } from "../snackbar/snackbar-context";

// --- INTERFACES E CONSTANTES ---
interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

const PREFIX_STUDENT = "studentEncryptedPrivateKey_";
const PREFIX_INSTITUTION = "institutionEncryptedPrivateKey_";
const PREFIX_VIEWER = "viewerEncryptedPrivateKey_";
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;

enum userTypes {
  OWNER = 'owner',
  INSTITUTION = 'institution',
  STUDENT = 'student',
  VISITOR = 'viewer'
}

export function GetStudent(): JSX.Element {
  const { address: connectedAddress, isConnected } = useAccount();
  const { showSnackbar } = useSnackbar();

  const [hasMounted, setHasMounted] = useState(false);
  const [studentAddress, setStudentAddress] = useState<Address | ''>('');
  const [decryptedData, setDecryptedData] = useState<any>(null);
  const [isLoadingDecryption, setIsLoadingDecryption] = useState<boolean>(false);
  const [encryptedBackupData, setEncryptedBackupData] = useState<BackupFileContent | null>(null);
  const [masterPasswordDecrypt, setMasterPasswordDecrypt] = useState<string>('');
  const [derivedPrivateKey, setDerivedPrivateKey] = useState<Hex | null>(null);
  const [isPrivateKeyDerived, setIsPrivateKeyDerived] = useState<boolean>(false);
  const [targetAudience, setTargetAudience] = useState<'self' | 'institution'>('institution');
  const [isFromLocalStorage, setIsFromLocalStorage] = useState(false);
  const [detectedRoleName, setDetectedRoleName] = useState("");

  const studentAddressValid = isAddress(studentAddress);

  // 1. HOOKS WAGMI
  const { data: userPermission, isFetching: isFetchingPermission } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getPermission',
    query: {
      enabled: !!connectedAddress && hasMounted,
      staleTime: 5_000,
    },
  });

  const { data: contractStudentData, refetch: refetchStudentData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: studentAddressValid ? [studentAddress] : undefined,
    query: { enabled: false }
  });

  useEffect(() => { setHasMounted(true); }, []);

  // 2. LÓGICA CORRIGIDA DE DETECÇÃO DE LOCALSTORAGE
  useEffect(() => {
    if (hasMounted && isConnected && connectedAddress && userPermission) {
      // Mapeamento manual para garantir que o prefixo bata com a permissão
      let prefix = "";
      let roleName = "";
      const permission = userPermission as string;

      if (permission === userTypes.STUDENT) {
        prefix = PREFIX_STUDENT;
        roleName = "Aluno";
      } else if (permission === userTypes.INSTITUTION) {
        prefix = PREFIX_INSTITUTION;
        roleName = "Instituição";
      } else {
        prefix = PREFIX_VIEWER;
        roleName = "Visitante/Admin";
      }

      const storageKey = `${prefix}${connectedAddress.toLowerCase()}`;
      const stored = localStorage.getItem(storageKey);

      if (stored) {
        try {
          setEncryptedBackupData(JSON.parse(stored));
          setIsFromLocalStorage(true);
          setDetectedRoleName(roleName);
        } catch (e) {
          console.error("Erro ao ler JSON do localStorage", e);
        }
      } else {
        // Se não achou com o prefixo da permissão, tenta os outros como fallback
        const allPrefixes = [PREFIX_STUDENT, PREFIX_INSTITUTION, PREFIX_VIEWER];
        for (const p of allPrefixes) {
          const fallbackKey = `${p}${connectedAddress.toLowerCase()}`;
          const fallbackStored = localStorage.getItem(fallbackKey);
          if (fallbackStored) {
            setEncryptedBackupData(JSON.parse(fallbackStored));
            setIsFromLocalStorage(true);
            setDetectedRoleName(p.replace("EncryptedPrivateKey_", ""));
            break;
          }
        }
      }
    }
  }, [hasMounted, isConnected, connectedAddress, userPermission, isFetchingPermission]);

  // 3. HANDLERS
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        const backupData = JSON.parse(await file.text());
        setEncryptedBackupData(backupData);
        setIsFromLocalStorage(false);
        showSnackbar("Backup carregado!", "success");
      } catch (err) {
        showSnackbar("Erro no arquivo JSON", "error");
      }
    }
  };

  const handleGetAndDecrypt = async () => {
    if (!studentAddressValid || !encryptedBackupData) return;
    setIsLoadingDecryption(true);

    try {
      // Derivação AES
      const salt = hexToBytes(encryptedBackupData.salt as Hex);
      const derivedKey = await pbkdf2Async(sha256, masterPasswordDecrypt, salt, {
        c: encryptedBackupData.kdfIterations || KDF_ITERATIONS,
        dkLen: 32
      });
      const iv = hexToBytes(encryptedBackupData.iv as Hex);
      const encryptedBytes = Base64.toUint8Array(encryptedBackupData.encryptedPrivateKey);

      const aes = gcm(derivedKey, iv);
      const decryptedPrivKeyBytes = aes.decrypt(encryptedBytes);
      const decryptedPrivKeyHex = new TextDecoder().decode(decryptedPrivKeyBytes);

      if (!decryptedPrivKeyHex.startsWith('0x')) throw new Error("Formato de chave inválido");

      // Busca e Decriptografia ECIES
      const { data } = await refetchStudentData();
      const student = data as any;
      const payload = targetAudience === 'institution' ? student.institutionEncryptedInformation : student.selfEncryptedInformation;

      const decryptedJson = await decryptECIES(payload, decryptedPrivKeyHex as Hex);
      setDecryptedData(JSON.parse(decryptedJson));
      showSnackbar("Dados abertos com sucesso!", "success");
    } catch (err: any) {
      showSnackbar(err.message || "Erro na operação", "error");
    } finally {
      setIsLoadingDecryption(false);
    }
  };

  if (!hasMounted) return <></>;

  return (
    <Card>
      <Stack gap={3}>
        <Typography variant="h5" fontWeight="bold">Visualizar dados do estudante</Typography>

        <TextField
          label="Endereço do Estudante (0x...)"
          fullWidth
          size="small"
          value={studentAddress}
          onChange={(e) => setStudentAddress(e.target.value as Address)}
        />

        {/* LÓGICA DE EXIBIÇÃO CONDICIONAL DO UPLOAD */}
        {isFromLocalStorage && encryptedBackupData ? (
          <></>
        ) : (
          <UploadCard
            label="Upload do Backup da Chave Privada (.json)"
            handleFileChange={handleFileChange}
          />
        )}

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
          {/* Campo de Senha Mestra */}
          <TextField
            label="Senha Mestra"
            type="password"
            fullWidth
            size="small"
            value={masterPasswordDecrypt}
            onChange={(e) => setMasterPasswordDecrypt(e.target.value)}
            disabled={!encryptedBackupData}
          />

          {/* Seleção de Visão */}
          <FormControl disabled={isLoadingDecryption} sx={{ minWidth: 'fit-content' }}>
            <RadioGroup
              row
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value as any)}
              sx={{ flexWrap: 'nowrap' }} // Garante que o rádio não quebre linha internamente
            >
              <FormControlLabel
                value="self"
                control={<Radio size="small" />}
                label={<Typography variant="body2">Visão Aluno</Typography>}
              />
              <FormControlLabel
                value="institution"
                control={<Radio size="small" />}
                label={<Typography variant="body2">Visão Instituição</Typography>}
              />
            </RadioGroup>
          </FormControl>
        </Stack>
        <Button
          variant="contained"
          onClick={handleGetAndDecrypt}
          disabled={isLoadingDecryption || !studentAddressValid || !encryptedBackupData || masterPasswordDecrypt.length < 12}
          className={`${styles["register-button"]} register-button`}
        >
          {isLoadingDecryption ? "Processando..." : "Descriptografar Dados"}
        </Button>

        {decryptedData && (
          <Stack gap={1} sx={{ mt: 2, p: 2, bgcolor: 'rgba(0,0,0,0.03)', borderRadius: 2 }}>
            <Typography variant="subtitle1"><b>Nome:</b> {decryptedData.name}</Typography>
            <Typography variant="subtitle1"><b>Documento:</b> {decryptedData.document}</Typography>
            <TransactionInfo label="Hash no Contrato:" hash={(contractStudentData as any)?.publicHash} />
          </Stack>
        )}
      </Stack>
    </Card>
  );
}