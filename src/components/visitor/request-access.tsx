"use client";

import React, { useState, useCallback, useEffect, FormEvent } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import * as secp from "@noble/secp256k1";
import styles from "./request-access.module.css";
import { bytesToHex } from "viem";
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import TransactionInfo from "../transaction-info/transaction-info";
import { useSnackbar } from "../snackbar/snackbar-context";
import { gcm } from "@noble/ciphers/aes.js";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { randomBytes } from "@noble/ciphers/utils.js";
import { Base64 } from 'js-base64';

const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8;
const LOCAL_STORAGE_VIEWER_KEY_PREFIX = "viewerEncryptedPrivateKey_";

interface BackupFileContent {
  encryptedPrivateKey: string;
  salt: string;
  kdfIterations: number;
  iv: string;
}

interface PasswordValidation {
  length: boolean;
  uppercase: boolean;
  lowercase: boolean;
  number: boolean;
  specialChar: boolean;
}

const getViewerLocalStorageKey = (address: Address | undefined): string | undefined => {
  if (address && isAddress(address)) {
    return `${LOCAL_STORAGE_VIEWER_KEY_PREFIX}${address.toLowerCase()}`;
  }
  return undefined;
};

const saveViewerToLocalStorage = (address: Address, data: BackupFileContent) => {
  const key = getViewerLocalStorageKey(address);
  if (key) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`Chave privada criptografada salva no localStorage para o Visitante ${address}.`);
    } catch (e) {
      console.error("Erro ao salvar no localStorage para o Visitante:", e);
    }
  }
};

const validateMasterPassword = (password: string): PasswordValidation => {
  return {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    specialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  };
};

export function RequestAccess() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const isClient = useIsClient();

  const [studentAddress, setStudentAddress] = useState<Address | "">("");
  const [internalStatusMessage, setInternalStatusMessage] = useState<string>("");
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState<Hex | null>(null);
  const [generatedPublicKey, setGeneratedPublicKey] = useState<Hex | null>(null);
  const [masterPasswordGenerate, setMasterPasswordGenerate] = useState<string>('');
  const [backupFileContent, setBackupFileContent] = useState<string | null>(null);
  const [isDownloadTriggered, setIsDownloadTriggered] = useState(false);
  const [isKeyInLocalStorage, setIsKeyInLocalStorage] = useState(false);
  const [passwordValidationErrors, setPasswordValidationErrors] = useState<PasswordValidation>(validateMasterPassword(''));

  const { showSnackbar } = useSnackbar();
  const { writeContractAsync, isPending } = useWriteContract();

  const studentAddressValid = isAddress(studentAddress);
  const connectedAddressValid = connectedAddress && isAddress(connectedAddress);
  const isPasswordValid = Object.values(passwordValidationErrors).every(Boolean);

  const triggerDownload = useCallback((jsonContent: string, currentAddress: Address) => {
    if (!isDownloadTriggered) {
      const blob = new Blob([jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement('a');

      a.href = url;
      a.download = `viewer_private_key_backup_${currentAddress.slice(0, 6)}_${Date.now()}.json`;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setIsDownloadTriggered(true);
      setInternalStatusMessage("Download do backup de chave privada disparado automaticamente. Guarde o arquivo em segurança!");
    }
  }, [isDownloadTriggered]);

  useEffect(() => {
    if (connectedAddressValid && isClient) {
      const key = getViewerLocalStorageKey(connectedAddress);
      if (key && localStorage.getItem(key)) {
        setIsKeyInLocalStorage(true);
        setInternalStatusMessage("Chave privada criptografada encontrada no navegador. Gere uma nova ou use o botão Solicitar.");
      } else {
        setIsKeyInLocalStorage(false);
        setInternalStatusMessage("Gere um novo par de chaves para prosseguir.");
      }
    } else {
      setIsKeyInLocalStorage(false);
    }
  }, [connectedAddressValid, connectedAddress, isClient]);

  useEffect(() => {
    setPasswordValidationErrors(validateMasterPassword(masterPasswordGenerate));
  }, [masterPasswordGenerate]);

  // Efeito para disparar o DOWNLOAD AUTOMÁTICO após a geração
  useEffect(() => {
    if (backupFileContent && connectedAddress && !isDownloadTriggered) {
      triggerDownload(backupFileContent, connectedAddress);
    }
  }, [backupFileContent, connectedAddress, triggerDownload]);


  const generateAndEncryptKey = useCallback(async () => {
    setInternalStatusMessage("");
    setGeneratedPrivateKey(null);
    setGeneratedPublicKey(null);
    setBackupFileContent(null);
    setIsDownloadTriggered(false);

    if (!connectedAddressValid) {
      setInternalStatusMessage("Por favor, conecte sua carteira para gerar a chave.");
      return;
    }

    if (!isPasswordValid) {
      setInternalStatusMessage("A senha mestra não atende a todos os requisitos de segurança.");
      return;
    }

    try {
      const currentAddress = connectedAddress as Address;
      showSnackbar("Gerando novo par de chaves e preparando backup...", "info");

      const privateKeyBytes = secp.utils.randomSecretKey();
      const privateKeyHex = bytesToHex(privateKeyBytes) as Hex;

      const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false);
      const publicKeyHex = bytesToHex(publicKeyBytes) as Hex;

      setGeneratedPrivateKey(privateKeyHex);
      setGeneratedPublicKey(publicKeyHex);

      const salt = randomBytes(16);
      const derivedKey = await pbkdf2Async(sha256, masterPasswordGenerate, salt, {
        c: KDF_ITERATIONS,
        dkLen: 32
      });

      const iv = randomBytes(12);
      const aes = gcm(derivedKey, iv);
      const privTextBytes = new TextEncoder().encode(privateKeyHex);
      const encryptedBytes = aes.encrypt(privTextBytes);
      
      const backupData: BackupFileContent = {
        encryptedPrivateKey: Base64.fromUint8Array(encryptedBytes),
        salt: bytesToHex(salt),
        kdfIterations: KDF_ITERATIONS,
        iv: bytesToHex(iv),
      };

      saveViewerToLocalStorage(currentAddress, backupData);
      setIsKeyInLocalStorage(true);

      const jsonBackup = JSON.stringify(backupData, null, 2);
      setBackupFileContent(jsonBackup);

      setInternalStatusMessage("Chave pública gerada e backup criptografado salvo localmente. Preparando download automático...");
    } catch (error: any) {
      console.error("Erro ao gerar chaves:", error);
      setInternalStatusMessage(`Falha ao gerar par de chaves: ${error.message || String(error)}`);
      setIsKeyInLocalStorage(false);
    }
  }, [masterPasswordGenerate, connectedAddressValid, connectedAddress, isPasswordValid, triggerDownload]);

  const handleDownloadBackup = () => {
    if (backupFileContent) {
      showSnackbar("Iniciando download do arquivo de backup da chave privada...", "info");
      const blob = new Blob([backupFileContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `viewer_private_key_backup_${connectedAddress?.slice(0, 6) || "unknown"}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSnackbar("Arquivo de backup da chave privada baixado com sucesso! Guarde-o em segurança.", "success");
    }
  };

  const requestAccess = async () => {
    if (!studentAddressValid) {
      showSnackbar("Endereço de estudante inválido.", "error");
      return;
    }

    if (!generatedPublicKey) {
      showSnackbar("Por favor, gere um par de chaves antes de solicitar acesso.", "error");
      return;
    }

    try {
      const txHash = await writeContractAsync({
        ...wagmiContractConfig,
        functionName: 'requestAccess',
        args: [studentAddress, generatedPublicKey],
        account: connectedAddress,
      });
      showSnackbar("Enviando solicitação de acesso com sua chave pública...", "info");
      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });
      if (receipt?.status === 'success') {
        showSnackbar("Solicitação de acesso enviada com sucesso! Aguarde a aprovação do estudante.", "success");
        setStudentAddress("");
        setMasterPasswordGenerate("");
        if (typeof window !== 'undefined') window.location.reload();
      } else {
        showSnackbar("Falha ao enviar a solicitação de acesso.", "error");
      }
    } catch (error: any) {
      console.error("Erro na RequestAccess:", error);
      let errorMessage = "Falha ao solicitar informações do estudante.";
      if (error.message.includes("User rejected the request")) {
        errorMessage = "Transação rejeitada pelo usuário.";
      } else if (error.cause?.shortMessage) {
        errorMessage = error.cause.shortMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      showSnackbar("Erro ao enviar a solicitação de acesso.", "error");
    }
  };

  const isRequestAccessDisabled = !isClient || !isConnected || !connectedAddressValid || !studentAddressValid || isPending || !generatedPublicKey;
  const isGenerateKeyDisabled = !isClient || isPending || !isPasswordValid;

  const renderValidationItem = (isValid: boolean, message: string) => (
    <li style={{ color: isValid ? 'green' : 'red' }}>
      {isValid ? '✅' : '❌'} {message}
    </li>
  );

  return (
    <Card>
      <Stack>
        <Typography variant="h5" component="h4" fontWeight="bold">Solicitar acesso à informação do estudante</Typography>
        <Typography variant="body1" component="p" className="info-text">
          Gere um novo par de chaves, salve o backup da sua chave privada e, em seguida, solicite acesso aos registros de um estudante enviando sua chave pública.
          O estudante precisará aprovar sua solicitação.
        </Typography>
      </Stack>

      <form className="form space-y-3" onSubmit={(e) => e.preventDefault()}>
        <Stack gap={2}>
          <TextField
            label="Endereço do Estudante (0x...)"
            variant="outlined"
            required
            value={studentAddress}
            onChange={(e) => {
              setStudentAddress(e.target.value as Address);
            }}
            disabled={isPending}
            size="small"
            error={!studentAddressValid && studentAddress !== ''}
            helperText={
              !studentAddressValid && studentAddress !== ''
                ? 'Endereço do estudante inválido.'
                : ''
            }
          />

          <Stack>
            <TextField
              id="masterPasswordGenerate"
              label="Senha Mestra"
              type="password"
              variant="outlined"
              required
              value={masterPasswordGenerate}
              onChange={(e) => setMasterPasswordGenerate(e.target.value)}
              disabled={isPending}
              size="small"
              error={masterPasswordGenerate.length > 0 && masterPasswordGenerate.length < 12}
              helperText={
                masterPasswordGenerate.length > 0 && masterPasswordGenerate.length < 12
                  ? 'A senha mestra deve ter pelo menos 12 caracteres.'
                  : ''
              }
            />
          </Stack>

          <Button
            type="button"
            onClick={generateAndEncryptKey}
            disabled={isGenerateKeyDisabled}
            className={`${styles["register-button"]} register-button`}
            sx={{ color: '#FFF' }}
          >
            {isPending ? "Processando..." : (generatedPublicKey ? "Gerar Nova Chave" : "Gerar Par de Chaves e Backup")}
          </Button>

          {generatedPublicKey && (
            <Stack>
              <TransactionInfo label="Hash da Transação:" hash={generatedPublicKey} />
            </Stack>
          )}
          <Button
            type="button"
            onClick={requestAccess}
            disabled={isRequestAccessDisabled}
            className={`${styles["register-button"]} register-button`}
            sx={{ color: '#FFF' }}
          >
            {isPending ? "Solicitando..." : "Solicitar Acesso ao Estudante"}
          </Button>
        </Stack>
      </form>
    </Card>
  );
}