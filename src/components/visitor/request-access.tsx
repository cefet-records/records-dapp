// components/RequestAccess.tsx
"use client";

import React, { useState, useCallback } from "react";
import { useAccount, useWalletClient, usePublicClient, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex, keccak256 } from "viem";
import * as CryptoJS from "crypto-js";
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import TransactionInfo from "../transaction-info/transaction-info";
import { useSnackbar } from "../snackbar/snackbar-context";

// Constantes para KDF (devem ser as mesmas usadas na geração do backup)
const KDF_ITERATIONS = 262144;
const KDF_KEY_SIZE = 256 / 8; // 32 bytes para AES-256

interface BackupFileContent {
  encryptedPrivateKey: string; // Chave privada criptografada em Base64
  salt: string;                // Salt usado no PBKDF2 em Hex
  kdfIterations: number;       // Número de iterações do PBKDF2
  iv: string;                  // Initialization Vector em Hex
}

export function RequestAccess() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const isClient = useIsClient();

  const { showSnackbar } = useSnackbar();

  const [studentAddress, setStudentAddress] = useState<Address | "">("");
  const [generatedPublicKey, setGeneratedPublicKey] = useState<Hex | null>(null);
  const [masterPasswordGenerate, setMasterPasswordGenerate] = useState<string>(''); // Senha para criptografar o backup
  const [backupFileContent, setBackupFileContent] = useState<string | null>(null);

  const { writeContractAsync, isPending } = useWriteContract();

  const studentAddressValid = isAddress(studentAddress);

  const generateAndEncryptKey = useCallback(async () => {
    setGeneratedPublicKey(null);
    setBackupFileContent(null);

    try {
      showSnackbar("Gerando novo par de chaves e preparando backup...", "info");
      // Gera uma chave privada aleatória
      const privateKeyBytes = secp.utils.randomSecretKey();
      const privateKeyHex = bytesToHex(privateKeyBytes) as Hex;

      // Deriva a chave pública não comprimida para ECIES
      const publicKeyBytes = secp.getPublicKey(privateKeyBytes, false);
      const publicKeyHex = bytesToHex(publicKeyBytes) as Hex;

      setGeneratedPublicKey(publicKeyHex);

      // --- Criptografar a chave privada para backup ---
      const saltBytes = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes para salt
      // CORREÇÃO AQUI: Remover o prefixo '0x' ao converter para Hex para o backup
      const saltHex = bytesToHex(saltBytes).substring(2);

      const ivBytes = window.crypto.getRandomValues(new Uint8Array(16)); // 16 bytes para IV
      // CORREÇÃO AQUI: Remover o prefixo '0x' ao converter para Hex para o backup
      const ivHex = bytesToHex(ivBytes).substring(2);

      const saltKDF = CryptoJS.enc.Hex.parse(saltHex);
      const ivCipher = CryptoJS.enc.Hex.parse(ivHex);

      // Derivar a chave simétrica para AES-256
      const keyKDF = CryptoJS.PBKDF2(masterPasswordGenerate, saltKDF, {
        keySize: KDF_KEY_SIZE / 4, // keySize em Words, não bytes
        iterations: KDF_ITERATIONS,
      });

      // Criptografar a chave privada gerada
      const encryptedWords = CryptoJS.AES.encrypt(privateKeyHex, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivCipher,
      });

      const encryptedPrivateKeyBase64 = encryptedWords.toString();

      const backupData: BackupFileContent = {
        encryptedPrivateKey: encryptedPrivateKeyBase64,
        salt: saltHex, // Agora sem '0x'
        kdfIterations: KDF_ITERATIONS,
        iv: ivHex,     // Agora sem '0x'
      };

      const jsonBackup = JSON.stringify(backupData, null, 2);
      setBackupFileContent(jsonBackup);
      showSnackbar("Par de chaves gerado e chave privada criptografada para backup. Salve seu arquivo de backup!", "success");

    } catch (error: any) {
      console.error("Erro ao gerar chaves:", error);
      showSnackbar("Falha ao gerar par de chaves!", "error");
    }
  }, [masterPasswordGenerate]);

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
      showSnackbar("Enviando solicitação de acesso com sua chave pública...", "info");
      const txHash = await writeContractAsync({
        ...wagmiContractConfig,
        functionName: 'requestAccess',
        args: [studentAddress, generatedPublicKey],
        account: connectedAddress,
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      if (receipt?.status === 'success') {
        showSnackbar("Solicitação de acesso enviada com sucesso! Aguarde a aprovação do estudante.", "success");
        setStudentAddress("");
        setMasterPasswordGenerate("");
        // Manter generatedPrivateKey/PublicKey para que o usuário possa baixar o backup.
      } else {
        showSnackbar("Falha ao enviar a solicitação de acesso.", "error");
      }

    } catch (error: any) {
      console.error("Erro na RequestAccess:", error);
      showSnackbar("Erro ao enviar a solicitação de acesso.", "error");
    }
  };

  const isRequestAccessDisabled = !isClient || !isConnected || !studentAddressValid || isPending || !generatedPublicKey;
  const isGenerateKeyDisabled = !isClient || isPending || masterPasswordGenerate.length < 12;

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