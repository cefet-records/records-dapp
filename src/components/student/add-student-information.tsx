'use client';

import React, { JSX, useState, useEffect, FormEvent, useCallback } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
} from "wagmi";
import * as secp from "@noble/secp256k1";
import { bytesToHex, Address, Hex, isAddress, keccak256, toBytes } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { encryptECIES } from "@/utils/cripto.utils";
import { randomBytes } from "@noble/ciphers/utils.js";
import CryptoJS from "crypto-js";
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import styles from "./add-student.module.css";
import { useSnackbar } from "../snackbar/snackbar-context";
import TransactionInfo from "../transaction-info/transaction-info";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { Base64 } from 'js-base64';

// --- CONSTANTES ---
const LOCAL_STORAGE_KEY_PREFIX = "studentEncryptedPrivateKey_";
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;

interface BackupData {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

interface InstitutionContractData {
  publicKey: Hex;
}

// --- VALIDADOR DE SENHA ---
const validateMasterPassword = (password: string) => ({
  length: password.length >= 12,
  uppercase: /[A-Z]/.test(password),
  lowercase: /[a-z]/.test(password),
  number: /[0-9]/.test(password),
  specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
});

export function AddStudentInformation(): JSX.Element | null {
  const { address, isConnected } = useAccount();
  const { showSnackbar } = useSnackbar();
  const [hasMounted, setHasMounted] = useState(false);

  // 1. ESTADOS DE FORMULÁRIO
  const [institutionAddress, setInstitutionAddress] = useState<Address | ''>('');
  const [name, setName] = useState("");
  const [studentDocument, setStudentDocument] = useState("");
  const [masterPassword, setMasterPassword] = useState<string>("");

  // 2. ESTADOS DE PROCESSO
  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedStudentPublicKey, setGeneratedStudentPublicKey] = useState<Hex | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState(false);
  const [isDownloadTriggered, setIsDownloadTriggered] = useState(false);

  const institutionAddressValid = isAddress(institutionAddress);
  const connectedAddressValid = isConnected && !!address;
  const passwordValidation = validateMasterPassword(masterPassword);
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);

  // 3. HOOKS WAGMI (Sempre no topo)
  const {
    data: registeredStudentData,
    isLoading: isLoadingStudent,
    isFetching: isFetchingStudent
  } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: connectedAddressValid ? [address as Address] : undefined,
    query: { enabled: connectedAddressValid && hasMounted, staleTime: 5000 },
  });

  const { data: institutionData, isLoading: isLoadingInst } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getInstitution',
    args: institutionAddressValid ? [institutionAddress] : undefined,
    query: { enabled: institutionAddressValid && hasMounted }
  });

  const { data: addInfoHash, isPending: isTxPending, writeContract } = useWriteContract();
  const { isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: addInfoHash });

  // 4. EFEITOS
  useEffect(() => { setHasMounted(true); }, []);

  // Download Automático após Confirmação da Transação
  useEffect(() => {
    if (downloadLink && isTxConfirmed && !isDownloadTriggered && address) {
      const a = document.createElement('a');
      a.href = downloadLink;
      a.download = `${address}_student_backup.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setIsDownloadTriggered(true);
      showSnackbar("✅ Backup do estudante baixado com sucesso!", "success");
    }
  }, [downloadLink, isTxConfirmed, isDownloadTriggered, address, showSnackbar]);

  // Recarregar após Sucesso Total
  useEffect(() => {
    if (isTxConfirmed && isDownloadTriggered) {
      setTimeout(() => window.location.reload(), 2000);
    }
  }, [isTxConfirmed, isDownloadTriggered]);

  // 5. LÓGICA DE NEGÓCIO
  const handleGenerateKeysAndAddInfo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!address || !isPasswordValid || !institutionAddressValid) return;

    setIsGeneratingKeys(true);
    try {
      // Geração de Chaves ECC
      const privateKeyBytes = randomBytes(32);
      const privateKeyHex = bytesToHex(privateKeyBytes) as Hex;
      const publicKeyHex = bytesToHex(secp.getPublicKey(privateKeyBytes, false)) as Hex;
      setGeneratedStudentPublicKey(publicKeyHex);

      // Criptografia da Chave Privada
      const salt = randomBytes(16);
      const derivedKey = await pbkdf2Async(sha256, masterPassword, salt, {
        c: KDF_ITERATIONS,
        dkLen: 32
      });

      const iv = randomBytes(12);
      const aes = gcm(derivedKey, iv);
      const privTextBytes = new TextEncoder().encode(privateKeyHex);
      const encryptedBytes = aes.encrypt(privTextBytes);

      const backup: BackupData = {
        encryptedPrivateKey: Base64.fromUint8Array(encryptedBytes),
        salt: bytesToHex(salt),
        kdfIterations: KDF_ITERATIONS,
        iv: bytesToHex(iv),
      };

      // Persistência e Download
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${address.toLowerCase()}`, JSON.stringify(backup));
      setDownloadLink(URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" })));

      // Preparação de Dados Cifrados (ECIES)
      const personalInfo = JSON.stringify({ name, document: studentDocument, salt: bytesToHex(randomBytes(16)) });
      const publicHash = keccak256(toBytes(personalInfo)) as Hex;

      const instPK = (institutionData as InstitutionContractData)?.publicKey;
      if (!instPK || instPK === '0x') throw new Error("Instituição sem chave pública.");

      const encryptedForSelf = await encryptECIES(personalInfo, publicKeyHex);
      const encryptedForInstitution = await encryptECIES(personalInfo, instPK);

      // Chamada ao Contrato
      writeContract({
        ...wagmiContractConfig,
        functionName: 'addStudentInformation',
        args: [encryptedForSelf, encryptedForInstitution, publicKeyHex, publicHash]
      });
    } catch (err: any) {
      showSnackbar(err.message || "Erro ao processar dados", "error");
      setIsGeneratingKeys(false);
    }
  };

  // 6. RENDERIZAÇÃO (Após todos os hooks)
  if (!hasMounted) return null;

  const isRegistered = !isLoadingStudent && (registeredStudentData as any)?.publicKey?.length > 10;
  if (isRegistered) return null;

  if (isLoadingStudent || isFetchingStudent) {
    return <Card><Typography>Verificando registro do estudante...</Typography></Card>;
  }

  const isInstInvalid = institutionAddressValid && !isLoadingInst && (!(institutionData as any)?.publicKey || (institutionData as any)?.publicKey === '0x');
  const isSubmitDisabled = isTxPending || isGeneratingKeys || !isPasswordValid || isInstInvalid || !institutionAddressValid;

  return (
    <Card>
      <Stack gap={3}>
        <Typography variant="h5" fontWeight="bold">Adicionar informação pessoal do estudante</Typography>
        <Typography variant="body2" color="text.secondary">
          Seus dados serão cifrados localmente antes do envio. Você precisará do backup gerado e da sua senha mestra para acessá-los futuramente.
        </Typography>

        <form onSubmit={handleGenerateKeysAndAddInfo}>
          <Stack gap={2}>
            {/* PRIMEIRA LINHA: Instituição e Nome */}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Endereço da Instituição"
                fullWidth
                size="small"
                value={institutionAddress}
                onChange={(e) => setInstitutionAddress(e.target.value as Address)}
                error={isInstInvalid}
                helperText={isInstInvalid ? "Esta instituição não possui chave pública registrada." : ""}
              />
              <TextField
                label="Nome Completo"
                fullWidth
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </Stack>

            {/* SEGUNDA LINHA: Documento e Senha Mestra */}
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}>
              <TextField
                label="Documento"
                fullWidth
                size="small"
                value={studentDocument}
                onChange={(e) => setStudentDocument(e.target.value)}
                required
              />
              <TextField
                label="Senha Mestra"
                type="password"
                fullWidth
                size="small"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                required
              />
            </Stack>

            {/* VALIDADOR DE SENHA */}
            <Stack sx={{ p: 1.5, bgcolor: '#f9f9f9', borderRadius: 1, border: '1px solid #ddd' }}>
              <Typography variant="caption" color={passwordValidation.length ? "success.main" : "error.main"}>
                {passwordValidation.length ? "✅" : "❌"} Mínimo 12 caracteres
              </Typography>
              <Typography variant="caption" color={passwordValidation.uppercase && passwordValidation.lowercase ? "success.main" : "error.main"}>
                {passwordValidation.uppercase && passwordValidation.lowercase ? "✅" : "❌"} Letras maiúsculas e minúsculas
              </Typography>
              <Typography variant="caption" color={passwordValidation.number && passwordValidation.specialChar ? "success.main" : "error.main"}>
                {passwordValidation.number && passwordValidation.specialChar ? "✅" : "❌"} Números e símbolos
              </Typography>
            </Stack>

            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={isSubmitDisabled}
              className={`${styles["register-button"]} register-button`}
            >
              {isGeneratingKeys || isTxPending ? "Processando..." : "Gerar Chaves e Registrar"}
            </Button>
          </Stack>
        </form>

        {addInfoHash && <TransactionInfo label="Status da Transação:" hash={addInfoHash} />}
      </Stack>
    </Card>
  );
}