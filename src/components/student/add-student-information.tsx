'use client';

import React, { JSX, useState, useEffect, FormEvent } from "react";
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
  type BaseError
} from "wagmi";
import * as secp from "@noble/secp256k1";
import { hexToBytes, bytesToHex, Address, Hex, isAddress, keccak256, toBytes } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { encryptECIES } from "@/utils/cripto.utils";
import { randomBytes } from "@noble/ciphers/utils.js";
import * as CryptoJS from "crypto-js";
import Card from "../card/card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { useSnackbar } from "../snackbar/snackbar-context";
import TransactionInfo from "../transaction-info/transaction-info";

interface InstitutionContractData {
  institutionAddress: Address;
  publicKey: Hex;
}

interface PersonalInformation {
  name: string;
  document: string;
  salt: string;
}

export function AddStudentInformation(): JSX.Element {
  const { address, isConnected } = useAccount();

  const { showSnackbar } = useSnackbar();

  const [institutionAddress, setInstitutionAddress] = useState<Address | ''>('');
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [masterPassword, setMasterPassword] = useState<string>("");

  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedStudentPublicKey, setGeneratedStudentPublicKey] = useState<Hex | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);
  const [keyGenerationError, setKeyGenerationError] = useState<string | null>(null);
  const [generatedStudentPrivateKeyHex, setGeneratedStudentPrivateKeyHex] = useState<Hex | null>(null);

  const { data: addInfoHash, error: writeError, isPending: isTxPending, writeContract } = useWriteContract();
  const { isLoading: isTxConfirming, isSuccess: isTxConfirmed } = useWaitForTransactionReceipt({ hash: addInfoHash });

  const institutionAddressValid = isAddress(institutionAddress);

  const {
    data: institutionData,
    isLoading: isLoadingInst,
    isError: isInstError,
    error: instError,
  } = useReadContract({
    ...wagmiContractConfig,
    functionName: 'getInstitution',
    args: institutionAddressValid ? [institutionAddress] : undefined,
    query: { enabled: institutionAddressValid, staleTime: 0 }
  });

  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const KDF_ITERATIONS = 262144;
  const KDF_KEY_SIZE = 256 / 8;

  const handleGenerateKeysAndAddInfo = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    // Resetar estados relevantes para uma nova tentativa
    setKeyGenerationError(null);
    setDownloadLink(null);
    setGeneratedStudentPublicKey(null);
    setGeneratedStudentPrivateKeyHex(null);

    setIsGeneratingKeys(true);
    showSnackbar("Iniciando geração de chaves e adição de informações...", "info");

    try {
      // 1. Gerar Par de Chaves ECDSA (secp256k1) para o Estudante
      const privateKeyECDSABytes = randomBytes(32);
      const privateKeyECDSAHex = bytesToHex(privateKeyECDSABytes) as Hex;

      const publicKeyECDSABytes = secp.getPublicKey(privateKeyECDSABytes, false);
      const publicKeyECDSAHex = bytesToHex(publicKeyECDSABytes) as Hex;

      setGeneratedStudentPublicKey(publicKeyECDSAHex);
      setGeneratedStudentPrivateKeyHex(privateKeyECDSAHex);

      // 2. Criptografar a Chave Privada do Estudante com a Senha Mestra (PBKDF2 + AES)
      const saltKDF = CryptoJS.lib.WordArray.random(128 / 8);
      const keyKDF = CryptoJS.PBKDF2(masterPassword, saltKDF, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });

      // GERAÇÃO DO IV E SUA INCLUSÃO NA CRIPTOGRAFIA E NO BACKUP
      const iv = CryptoJS.lib.WordArray.random(128 / 8); // <<< Gerar o IV aqui

      const encryptedStudentPrivateKey = CryptoJS.AES.encrypt(privateKeyECDSAHex, keyKDF, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv, // <<< Passar o IV para a criptografia
      }).toString();

      // 3. Preparar e oferecer o download do arquivo TXT de backup
      const backupData = {
        encryptedPrivateKey: encryptedStudentPrivateKey,
        salt: saltKDF.toString(CryptoJS.enc.Hex),
        kdfIterations: KDF_ITERATIONS,
        iv: iv.toString(CryptoJS.enc.Hex), // <<< ADICIONAR ESTA LINHA: Salvar o IV no backup!
      };
      const backupContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url);

      // 4. Preparar dados pessoais para criptografia e envio on-chain
      const saltPersonalDataBytes = randomBytes(16);
      const saltPersonalDataHex = bytesToHex(saltPersonalDataBytes);

      const personalInformation: PersonalInformation = { name, document, salt: saltPersonalDataHex };
      const informationString = JSON.stringify(personalInformation);

      const publicHashHex = keccak256(toBytes(informationString)) as Hex;

      const instData = institutionData as InstitutionContractData;
      if (!instData || instData.publicKey.length < 132 || instData.publicKey === '0x') {
        throw new Error("Chave pública da Instituição não encontrada ou é inválida. Certifique-se que a instituição existe e tem uma PK registrada no formato ECDSA Hex (0x04...).");
      }
      const institutionPublicKeyHex = instData.publicKey;

      const encryptedForSelfBase64 = await encryptECIES(informationString, publicKeyECDSAHex);
      const encryptedForInstitutionBase64 = await encryptECIES(informationString, institutionPublicKeyHex);

      const publicHashToSubmit = publicHashHex;

      await writeContract({
        ...wagmiContractConfig,
        functionName: 'addStudentInformation',
        args: [
          encryptedForSelfBase64,
          encryptedForInstitutionBase64,
          publicKeyECDSAHex,
          publicHashToSubmit,
        ]
      });
    } catch (err: any) {
      console.error("Error in AddStudentInformation:", err);
      showSnackbar("Falha ao adicionar informações!", "error");
      setIsGeneratingKeys(false);
      setDownloadLink(null);
      setGeneratedStudentPublicKey(null);
      setGeneratedStudentPrivateKeyHex(null);
    }
  };

  useEffect(() => {
    if (isTxConfirmed) {
      showSnackbar("Informação do estudante adicionada com sucesso!", "success");
      setInstitutionAddress('');
      setName('');
      setDocument('');
      setMasterPassword('');
      setIsGeneratingKeys(false);
    }
  }, [isTxConfirmed]);

  const isAddInfoDisabled = isTxPending || isLoadingInst || !isConnected ||
    !institutionAddressValid || !name || !document ||
    isGeneratingKeys ||
    !masterPassword || masterPassword.length < 12;

  const isInstitutionPublicKeyInvalid = institutionAddressValid && !isLoadingInst && !isInstError &&
    (!institutionData || (institutionData as InstitutionContractData).publicKey?.length < 132 || (institutionData as InstitutionContractData).publicKey === '0x');

  useEffect(() => {
    if (keyGenerationError) {
      showSnackbar("Erro de Geração de Chave!", "error");
    }
  }, [keyGenerationError, showSnackbar]);

  useEffect(() => {
    if (writeError) {
      showSnackbar("Erro na transação com a blockchain!", "error");
    }
  }, [writeError, showSnackbar]);

  return (
    <Card>
      <Stack>
        <Typography variant="h4" component="h4">Adicionar Informação Pessoal do Estudante</Typography>
        <Typography variant="body1" component="p" className="info-text">
          Suas informações são cifradas para você e para a instituição de auditoria. Sua chave pública de encriptação é registrada.
          Você precisará de sua senha mestra e do arquivo de backup da chave privada para descriptografar seus dados.
        </Typography>
      </Stack>

      <form className="form space-y-3" onSubmit={handleGenerateKeysAndAddInfo}>
        <Stack gap={2}>
          <TextField
            label="Endereço da Instituição (0x...)"
            variant="outlined"
            required
            name="institutionAddress"
            onChange={(e) => {
              setInstitutionAddress(e.target.value as Address | '');
            }}
            size="small"
            value={institutionAddress}
            disabled={isGeneratingKeys || isTxPending}
            error={!institutionAddressValid && institutionAddress !== '' || isInstitutionPublicKeyInvalid}
            helperText={
              !institutionAddressValid && institutionAddress !== ''
                ? 'Endereço da instituição inválido.'
                : isInstitutionPublicKeyInvalid ? 'A instituição existe, mas não tem chave pública de encriptação ECC registrada no formato correto (0x04...)' : ''
            }
          />
          <TextField
            label="Nome Completo"
            variant="outlined"
            required
            name="institutionName"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
            }}
            size="small"
            disabled={isGeneratingKeys || isTxPending}
          />
          <TextField
            label="Documento"
            variant="outlined"
            required
            value={document}
            name="institutionDocument"
            onChange={(e) => {
              setDocument(e.target.value);
            }}
            size="small"
            disabled={isGeneratingKeys || isTxPending}
          />
          <Stack>
            <label htmlFor="masterPassword" style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
              Sua Senha Mestra (para Criptografar sua Chave Privada):
            </label>
            <TextField
              id="masterPassword"
              label="Mínimo 12 caracteres"
              type="password"
              variant="outlined"
              required
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              disabled={isGeneratingKeys || isTxPending}
              size="small"
            />
          </Stack>
          <Button type="submit" className="register-button" disabled={isAddInfoDisabled || isInstitutionPublicKeyInvalid}>
            Gerar Chaves e Adicionar Informação do Estudante
          </Button>
        </Stack>
      </form>

      {generatedStudentPublicKey && !keyGenerationError && (
        <TransactionInfo label="Chave Pública ECDSA Gerada:" hash={generatedStudentPublicKey} />
      )}

      {downloadLink && isTxConfirmed && (
        <Stack gap={2}>
          <Stack>
            <p className="info-text">Importante: Baixe seu Arquivo de Chave Privada Criptografada!</p>
            <p className="info-text">Este arquivo, junto com sua Senha Mestra, é essencial para descriptografar seus dados acadêmicos. Mantenha-o seguro e não o compartilhe. Faça um backup em local seguro.</p>
          </Stack>
          <a href={downloadLink} download={`${address}_student_encrypted_private_key.json`} className="download-button">
            Download Chave Privada Criptografada (JSON)
          </a>
        </Stack>
      )}
    </Card>
  );
}