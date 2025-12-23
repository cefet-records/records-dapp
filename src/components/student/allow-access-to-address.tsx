// components/AllowAccessToAddress.tsx
"use client";

import React, { useCallback, useState } from "react";
import { useAccount, useWalletClient, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { isAddress, Address, Hex } from "viem";
import { wagmiContractConfig } from "../../abis/AcademicRecordStorageABI";
import { useIsClient } from "../../app/is-client";

import { encryptECIES, decryptECIES } from '../../utils/cripto.utils';
import * as CryptoJS from "crypto-js"; // Importar CryptoJS para o backup da chave do estudante
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import UploadCard from "../upload-card/upload-card";
import Button from "@mui/material/Button";
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

export function AllowAccessToAddress() {
  const { address: connectedAddress, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const isClient = useIsClient();

  const { showSnackbar } = useSnackbar();

  const [allowedAddress, setAllowedAddress] = useState<Address | "">("");
  // Alteramos para aceitar um arquivo de backup e senha
  const [studentBackupFile, setStudentBackupFile] = useState<File | null>(null);
  const [studentMasterPasswordDecrypt, setStudentMasterPasswordDecrypt] = useState<string>('');
  const [derivedStudentPrivateKey, setDerivedStudentPrivateKey] = useState<Hex | null>(null);
  const [isStudentPrivateKeyDerived, setIsStudentPrivateKeyDerived] = useState<boolean>(false);

  const { writeContractAsync, isPending: isWritePending } = useWriteContract();

  const allowedAddressValid = isAddress(allowedAddress);

  // Hook para ler a chave pública do recipiente (viewer)
  // Args: recipient (o allowedAddress), sender (o estudante conectado)
  const { data: recipientKey, isLoading: isRecipientKeyLoading, refetch: refetchRecipientKey } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'retrieveRecipientEncrpytKey',
    args: allowedAddressValid && connectedAddress ? [allowedAddress, connectedAddress] : undefined,
    query: {
      enabled: false,
      staleTime: 0,
    },
  });

  // Hook para ler os dados do estudante (para obter selfEncryptedInformation)
  // Args: studentAddress (o estudante conectado)
  const { data: studentData, isLoading: isStudentDataLoading, refetch: refetchStudentData } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getStudent',
    args: connectedAddress ? [connectedAddress] : undefined, // O estudante atual é o conectado
    query: {
      enabled: false,
      staleTime: 0,
    },
  });

  // Função para derivar a chave privada do estudante a partir do backup
  const deriveStudentPrivateKey = useCallback(async (): Promise<Hex | null> => {
    if (!studentBackupFile || !studentMasterPasswordDecrypt) {
      showSnackbar("Por favor, faça upload do arquivo de backup do estudante e insira a senha mestra.", "error");
      setIsStudentPrivateKeyDerived(false);
      return null;
    }

    setIsStudentPrivateKeyDerived(false);
    setDerivedStudentPrivateKey(null);

    try {
      const fileContent = await studentBackupFile.text();
      const backupData: BackupFileContent = JSON.parse(fileContent);

      const { encryptedPrivateKey, salt, kdfIterations, iv } = backupData;

      if (kdfIterations !== KDF_ITERATIONS) {
        throw new Error(`As iterações do KDF no arquivo (${kdfIterations}) não correspondem ao esperado (${KDF_ITERATIONS}).`);
      }
      if (!iv || typeof iv !== 'string' || iv.length !== 32) {
        throw new Error("IV (Initialization Vector) não encontrado ou inválido no arquivo de backup.");
      }

      const saltKDF = CryptoJS.enc.Hex.parse(salt);
      const ivFromBackup = CryptoJS.enc.Hex.parse(iv);

      const keyKDF = CryptoJS.PBKDF2(studentMasterPasswordDecrypt, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: kdfIterations,
      });

      const decryptedWords = CryptoJS.AES.decrypt(encryptedPrivateKey, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: ivFromBackup,
      });

      const decryptedPrivateKeyHex = decryptedWords.toString(CryptoJS.enc.Utf8);

      if (!decryptedPrivateKeyHex || !decryptedPrivateKeyHex.startsWith('0x') || decryptedPrivateKeyHex.length !== 66) {
        throw new Error("Falha ao descriptografar a chave privada do estudante ou formato inválido.");
      }

      setDerivedStudentPrivateKey(decryptedPrivateKeyHex as Hex);
      setIsStudentPrivateKeyDerived(true);
      showSnackbar("Chave privada do estudante derivada com sucesso do arquivo e senha.", "success");
      return decryptedPrivateKeyHex as Hex;

    } catch (err: any) {
      console.error("Erro ao derivar chave privada do estudante:", err);
      showSnackbar("Falha ao derivar chave privada do estudante!", "error");
      setDerivedStudentPrivateKey(null);
      setIsStudentPrivateKeyDerived(false);
      return null;
    }
  }, [studentBackupFile, studentMasterPasswordDecrypt]);


  const handleStudentFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setStudentBackupFile(null);
    setDerivedStudentPrivateKey(null);
    setIsStudentPrivateKeyDerived(false);
    const file = event.target.files?.[0];
    if (file) {
      setStudentBackupFile(file);
    }
  };


  const allowAccessToAddress = async () => {
    let currentStudentPrivateKey = derivedStudentPrivateKey;
    if (!isStudentPrivateKeyDerived || !currentStudentPrivateKey) {
      currentStudentPrivateKey = await deriveStudentPrivateKey();
      if (!currentStudentPrivateKey) {
        // Mensagem de erro já é definida dentro de deriveStudentPrivateKey
        return;
      }
    }

    if (!connectedAddress) {
      showSnackbar("Endereço do estudante não conectado.", "error");
      return;
    }

    if (!allowedAddressValid) {
      showSnackbar("Endereço do visitante inválido.", "error");
      return;
    }

    try {
      // 1. Obter a chave pública do recipiente (viewer)
      showSnackbar("Buscando chave pública do destinatário (visitante)...", "info");
      const recipientKeyResponse = await refetchRecipientKey();
      const retrievedRecipientKey = recipientKeyResponse.data as Hex | undefined;

      if (!retrievedRecipientKey || retrievedRecipientKey === '0x') {
        showSnackbar("Não foi possível obter a chave pública do destinatário. Verifique se o endereço permitido existe e solicitou acesso.", "error");
        return;
      }

      const studentDataResponse = await refetchStudentData();
      const studentSelfEncryptedInfo = studentDataResponse.data?.selfEncryptedInformation;

      if (!studentSelfEncryptedInfo || studentSelfEncryptedInfo === '0x') {
        showSnackbar("Não foi possível obter suas informações criptografadas do contrato. Verifique se você já registrou seus dados.", "error");
        return;
      }

      let studentInformation: string;
      try {
        studentInformation = await decryptECIES(studentSelfEncryptedInfo, currentStudentPrivateKey);
      } catch (decryptError) {
        console.error("Erro ao descriptografar selfEncryptedInformation:", decryptError);
        showSnackbar(`Falha na descriptografia de seus dados! Verifique sua chave privada.`, "error");
        return;
      }

      // 3. Re-criptografar a informação bruta para o `recipientKey` (chave pública do visitante)
      const encryptedValue = await encryptECIES(studentInformation, retrievedRecipientKey);

      // 4. Enviar a transação para o contrato
      // function addEncryptedInfoWithRecipientKey(Address _recipient, Address _student, bytes calldata _encryptedInfo)
      const txHash = await writeContractAsync({
        ...wagmiContractConfig,
        functionName: 'addEncryptedInfoWithRecipientKey',
        args: [allowedAddress, connectedAddress, encryptedValue],
        account: connectedAddress,
      });

      const receipt = await publicClient?.waitForTransactionReceipt({ hash: txHash });

      if (receipt?.status === 'success') {
        showSnackbar("Acesso concedido com sucesso ao endereço do visitante!", "success");
        setAllowedAddress("");
        // Não limpar a chave privada derivada para evitar que o usuário precise fazer upload novamente imediatamente,
        // mas é uma decisão de UX. Para máxima segurança, limpar após o uso.
        // setStudentBackupFile(null);
        // setStudentMasterPasswordDecrypt('');
        // setDerivedStudentPrivateKey(null);
        // setIsStudentPrivateKeyDerived(false);
      } else {
        console.log("Falha na transação. Status: " + receipt?.status);
      }

    } catch (error: any) {
      console.error("Erro ao conceder acesso:", error);
      let errorMessage = "Falha ao conceder acesso ao endereço. Verifique o console para mais detalhes.";
      if (error.message.includes("User rejected the request")) {
        errorMessage = "Transação rejeitada pelo usuário.";
      } else if (error.cause?.shortMessage) {
        errorMessage = error.cause.shortMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      showSnackbar(errorMessage, "error");
    }
  };

  const isDisabled = !isClient || !isConnected || !allowedAddressValid || isWritePending ||
    !studentBackupFile || studentMasterPasswordDecrypt.length < 12;

  return (
    <Card>
      <Stack>
        <Typography variant="h4" component="h4">Conceder Acesso à Informação Pessoal do Estudante</Typography>
        <Typography variant="body1" component="p" className="info-text">
          Como estudante, você pode conceder acesso ao seu histórico para um visitante.
          Insira o endereço do visitante, faça upload do seu próprio arquivo de backup de chave privada e sua senha mestra.
          O visitante deve ter solicitado acesso previamente para que sua chave pública esteja disponível.
        </Typography>
      </Stack>
      <form className="form space-y-3" onSubmit={(e) => e.preventDefault()}>
        <Stack gap={2}>
          <TextField
            label="Endereço da Instituição (0x...)"
            variant="outlined"
            required
            name="institutionAddress"
            onChange={(e) => {
              setAllowedAddress(e.target.value as Address);
            }}
            size="small"
            value={allowedAddress}
            error={!allowedAddressValid && allowedAddress !== ''}
            helperText={
              !allowedAddressValid && allowedAddress !== ''
                ? 'Endereço do visitante inválido.'
                : ''
            }
          />

          {studentBackupFile && <p className="info-text">Arquivo selecionado: {studentBackupFile.name}</p>}
          <UploadCard label="Seu Arquivo de Chave Privada Criptografada (.json) (Estudante):" handleFileChange={handleStudentFileChange} />

          <Stack>
            <label htmlFor="masterPasswordDecrypt" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Senha Mestra (usada para criptografar o arquivo de backup):
            </label>
            <TextField
              id="masterPasswordDecrypt"
              label="Mínimo 12 caracteres"
              variant="outlined"
              required
              value={studentMasterPasswordDecrypt}
              onChange={(e) => setStudentMasterPasswordDecrypt(e.target.value)}
              disabled={isWritePending}
              error={studentMasterPasswordDecrypt.length > 0 && studentMasterPasswordDecrypt.length < 12}
              helperText={
                studentMasterPasswordDecrypt.length > 0 && studentMasterPasswordDecrypt.length < 12
                  ? 'Sua senha mestra deve ter pelo menos 12 caracteres.'
                  : ''
              }
              size="small"
            />
          </Stack>

          <Button
            type="button"
            onClick={allowAccessToAddress}
            disabled={isDisabled}
            variant="contained"
            className="register-button"
          >
            Conceder Acesso
          </Button>
        </Stack>
      </form>
    </Card>
  );
}