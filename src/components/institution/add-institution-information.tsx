'use client';

import React, { FormEvent, JSX, useEffect, useState, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount,
  useReadContract
} from "wagmi";
import { Address, isAddress } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import CryptoJS from "crypto-js";
import * as secp from "@noble/secp256k1";
import { bytesToHex } from "viem";
import { randomBytes } from "@noble/ciphers/utils.js";
import Card from "../card/card";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import styles from "./add-institution-information.module.css";
import { useSnackbar } from "../snackbar/snackbar-context";
import TransactionInfo from "../transaction-info/transaction-info";

// --- CONSTANTES ---
const LOCAL_STORAGE_KEY_PREFIX = "institutionEncryptedPrivateKey_";
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;

interface BackupData {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

interface InstitutionContractData {
  publicKey: string;
}

// --- VALIDADOR DE SENHA ---
const validateMasterPassword = (password: string) => ({
  length: password.length >= 12,
  uppercase: /[A-Z]/.test(password),
  lowercase: /[a-z]/.test(password),
  number: /[0-9]/.test(password),
  specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
});

export default function AddInstitutionInfo(): JSX.Element | null {
  const { address: connectedAddress, isConnected } = useAccount();
  const { showSnackbar } = useSnackbar();
  const [hasMounted, setHasMounted] = useState(false);

  // 1. ESTADOS
  const [institutionName, setInstitutionName] = useState("");
  const [institutionDocument, setInstitutionDocument] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedPublicKey, setGeneratedPublicKey] = useState<string | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [isDownloadTriggered, setIsDownloadTriggered] = useState(false);

  const connectedAddressValid = isConnected && !!connectedAddress;
  const passwordValidation = validateMasterPassword(masterPassword);
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  // 2. HOOKS WAGMI
  const {
    data: registeredInstitutionData,
    isLoading: isLoadingInstitution,
    isFetching: isFetchingInstitution
  } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getInstitution',
    args: connectedAddressValid ? [connectedAddress as Address] : undefined,
    query: { enabled: connectedAddressValid && hasMounted, staleTime: 5000 },
  });

  const { data: addInstitutionHash, writeContract: writeAddInstitution } = useWriteContract();
  const { isSuccess: isInstitutionAdded } = useWaitForTransactionReceipt({ hash: addInstitutionHash });

  const { data: addPublicKeyHash, writeContract: writeAddPublicKey } = useWriteContract();
  const { isSuccess: isPublicKeyAdded } = useWaitForTransactionReceipt({ hash: addPublicKeyHash });

  // 3. EFEITOS
  useEffect(() => { setHasMounted(true); }, []);

  // Disparar Transação 2 após Transação 1
  useEffect(() => {
    if (isInstitutionAdded && generatedPublicKey && connectedAddressValid) {
      writeAddPublicKey({
        ...wagmiContractConfig,
        functionName: "addInstitutionPublicKey",
        args: [connectedAddress as Address, generatedPublicKey],
      });
    }
  }, [isInstitutionAdded, generatedPublicKey, connectedAddressValid, writeAddPublicKey]);

  // Download Automático
  useEffect(() => {
    if (downloadLink && isInstitutionAdded && !isDownloadTriggered && connectedAddress) {
      const a = document.createElement('a');
      a.href = downloadLink;
      a.download = `${connectedAddress}_institution_backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setIsDownloadTriggered(true);
      showSnackbar("✅ Backup baixado automaticamente!", "success");
    }
  }, [downloadLink, isInstitutionAdded, isDownloadTriggered, connectedAddress, showSnackbar]);

  // Recarregamento após sucesso total
  useEffect(() => {
    if (isPublicKeyAdded) {
      showSnackbar("Registro concluído com sucesso!", "success");
      setTimeout(() => window.location.reload(), 2000);
    }
  }, [isPublicKeyAdded, showSnackbar]);

  // 4. HANDLERS
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!connectedAddress || !isPasswordValid) return;

    setIsGeneratingKeys(true);
    try {
      // 1. Gerar Par de Chaves ECC (secp256k1)
      const privBytes = randomBytes(32);
      const privHex = bytesToHex(privBytes);
      const pubHex = bytesToHex(secp.getPublicKey(privBytes, false));
      setGeneratedPublicKey(pubHex);

      // 2. Criptografia PBKDF2 + AES-256-CBC
      const salt = CryptoJS.lib.WordArray.random(16);
      const key = CryptoJS.PBKDF2(masterPassword, salt, { keySize: 8, iterations: KDF_ITERATIONS });
      const iv = CryptoJS.lib.WordArray.random(16);
      const encrypted = CryptoJS.AES.encrypt(privHex, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString();

      const backup: BackupData = {
        encryptedPrivateKey: encrypted,
        salt: salt.toString(CryptoJS.enc.Hex),
        kdfIterations: KDF_ITERATIONS,
        iv: iv.toString(CryptoJS.enc.Hex),
      };

      // 3. Persistência Local e Preparação de Download
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${connectedAddress.toLowerCase()}`, JSON.stringify(backup));
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      setDownloadLink(URL.createObjectURL(blob));

      // 4. Chamada ao Contrato
      writeAddInstitution({
        ...wagmiContractConfig,
        functionName: "addInstitutionInformation",
        args: [institutionName, institutionDocument],
      });
    } catch (e) {
      showSnackbar("Erro no processamento criptográfico", "error");
      setIsGeneratingKeys(false);
    }
  };

  // 5. RENDERS CONDICIONAIS (Sempre após os Hooks)
  if (!hasMounted) return null;

  const isRegistered = !isLoadingInstitution && (registeredInstitutionData as InstitutionContractData)?.publicKey?.length > 10;
  if (isRegistered) return null;

  if (isLoadingInstitution || isFetchingInstitution) {
    return <Card><Typography>Verificando registro da instituição...</Typography></Card>;
  }

  const overallPending = isGeneratingKeys || (addInstitutionHash && !isInstitutionAdded);

  return (
    <Card>
      <Typography variant="h5" fontWeight="bold" mb={2}>Registrar informações da sua instituição</Typography>
      <form onSubmit={handleSubmit}>
        <Stack gap={3}>
          <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
            <TextField
              label="Nome da Instituição"
              fullWidth
              value={institutionName}
              onChange={(e) => setInstitutionName(e.target.value)}
              required
            />
            <TextField
              label="CNPJ / Documento"
              fullWidth
              value={institutionDocument}
              onChange={(e) => setInstitutionDocument(e.target.value)}
              required
            />
          </Stack>

          <TextField
            label="Senha Mestra de Criptografia"
            type="password"
            fullWidth
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            required
            helperText="Esta senha cifra sua chave privada. NÃO A PERCA."
          />
          <Stack sx={{ p: 2, bgcolor: '#fafafa', borderRadius: 1, border: '1px solid #eee' }}>
            <Typography variant="caption" fontWeight="bold" mb={1}>Requisitos da Senha:</Typography>
            <Typography variant="caption" color={passwordValidation.length ? "success.main" : "error.main"}>
              {passwordValidation.length ? "✅" : "❌"} Mínimo 12 caracteres
            </Typography>
            <Typography variant="caption" color={passwordValidation.uppercase && passwordValidation.lowercase ? "success.main" : "error.main"}>
              {passwordValidation.uppercase && passwordValidation.lowercase ? "✅" : "❌"} Letras maiúsculas e minúsculas
            </Typography>
            <Typography variant="caption" color={passwordValidation.number && passwordValidation.specialChar ? "success.main" : "error.main"}>
              {passwordValidation.number && passwordValidation.specialChar ? "✅" : "❌"} Números e caracteres especiais
            </Typography>
          </Stack>

          <Button
            type="submit"
            variant="contained"
            size="large"
            disabled={overallPending || !isPasswordValid}
            className={`${styles["register-button"]} register-button`}
          >
            {overallPending ? "Processando Registro..." : "Registrar e Gerar Chaves"}
          </Button>
        </Stack>
      </form>

      {addInstitutionHash && <TransactionInfo label="Status do Registro:" hash={addInstitutionHash} />}
      {addPublicKeyHash && <TransactionInfo label="Status da Chave Pública:" hash={addPublicKeyHash} />}
    </Card>
  );
}