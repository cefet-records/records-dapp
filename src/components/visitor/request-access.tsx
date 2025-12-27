"use client";

import React, { useState, useCallback, useEffect, FormEvent } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import * as secp from "@noble/secp256k1";
import { bytesToHex } from "viem";
import CryptoJS from "crypto-js";
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import TransactionInfo from "../transaction-info/transaction-info";
import { useSnackbar } from "../snackbar/snackbar-context";

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

      const saltBytes = window.crypto.getRandomValues(new Uint8Array(16));
      const saltHex = bytesToHex(saltBytes).substring(2);
      const ivBytes = window.crypto.getRandomValues(new Uint8Array(16));
      const ivHex = bytesToHex(ivBytes).substring(2);
      const saltKDF = CryptoJS.enc.Hex.parse(saltHex);
      const ivCipher = CryptoJS.enc.Hex.parse(ivHex);

      const keyKDF = CryptoJS.PBKDF2(masterPasswordGenerate, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });

      const encryptedWords = CryptoJS.AES.encrypt(privateKeyHex, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivCipher,
      });

      const encryptedPrivateKeyBase64 = encryptedWords.toString();
      const backupData: BackupFileContent = {
        encryptedPrivateKey: encryptedPrivateKeyBase64,
        salt: saltHex,
        kdfIterations: KDF_ITERATIONS,
        iv: ivHex,
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
        <Typography variant="h4" component="h4">Solicitar Acesso à Informação do Estudante (como Visitante)</Typography>
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
            <label htmlFor="masterPasswordGenerate" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha Mestra para Criptografar seu Backup de Chave Privada:
            </label>
            <TextField
              id="masterPasswordGenerate"
              label="Mínimo 12 caracteres"
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
            className="register-button"
          >
            {isPending ? "Processando..." : (generatedPublicKey ? "Gerar Nova Chave" : "Gerar Par de Chaves e Backup")}
          </Button>

          {generatedPublicKey && (
            <Stack>
              <TransactionInfo label="Sua Chave Pública de Criptografia:" hash={generatedPublicKey} />
              <p className="info-text">
                Nova chave pública gerada. Esta chave será usada para sua solicitação de acesso.
              </p>
            </Stack>
          )}

          {backupFileContent && (
            <Stack gap={1}>
              <Button
                type="button"
                onClick={handleDownloadBackup}
                className="download-button"
                disabled={isPending}
              >
                Baixar Backup da Chave Privada (.json)
              </Button>
              <p className="info-text">
                <span style={{ fontWeight: 'bold' }}>ATENÇÃO: </span>Salve este arquivo em um local seguro. Ele contém sua chave privada criptografada.
                Sem ele e sua senha mestra, você não poderá descriptografar os dados do estudante!
              </p>
            </Stack>
          )}

          <Button
            type="button"
            onClick={requestAccess}
            disabled={isRequestAccessDisabled}
            className="register-button"
          >
            {isPending ? "Solicitando..." : "Solicitar Acesso ao Estudante"}
          </Button>

        </Stack>
      </form>
    </Card>
  );
}