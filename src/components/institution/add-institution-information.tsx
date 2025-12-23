import { FormEvent, JSX, useEffect, useState } from "react";
import {
  type BaseError,
  useWriteContract,
  useWaitForTransactionReceipt,
  useAccount
} from "wagmi";
import { Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import CryptoJS from "crypto-js";
import * as secp from "@noble/secp256k1";
import { bytesToHex } from "viem";
import { randomBytes } from "@noble/ciphers/utils.js"
import Card from "../card/card";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import styles from "./add-institution-information.module.css";
import { useSnackbar } from "../snackbar/snackbar-context";
import TransactionInfo from "../transaction-info/transaction-info";

type InstitutionData = {
  institutionName: string;
  institutionDocument: string;
  masterPassword: string;
}


export default function AddInstitutionInfo(): JSX.Element {
  const { address, isConnected } = useAccount();

  const { showSnackbar } = useSnackbar();

  const [institutionData, setInstitutionData] = useState<InstitutionData>({
    institutionName: "",
    institutionDocument: "",
    masterPassword: ""
  });

  const [downloadLink, setDownloadLink] = useState<string | null>(null);
  const [generatedPublicKey, setGeneratedPublicKey] = useState<string | null>(null);
  const [isGeneratingKeys, setIsGeneratingKeys] = useState<boolean>(false);

  const {
    data: addInstitutionHash,
    error: addInstitutionError,
    isPending: isAddingInstitution,
    writeContract: writeAddInstitution,
  } = useWriteContract();
  const {
    isLoading: isConfirmingAddInstitution,
    isSuccess: isInstitutionAdded,
    error: addInstitutionConfirmError,
  } = useWaitForTransactionReceipt({ hash: addInstitutionHash });

  const {
    data: addPublicKeyHash,
    error: addPublicKeyError,
    isPending: isAddingPublicKey,
    writeContract: writeAddPublicKey,
  } = useWriteContract();
  const {
    isLoading: isConfirmingAddPublicKey,
    isSuccess: isPublicKeyAdded,
    error: addPublicKeyConfirmError,
  } = useWaitForTransactionReceipt({ hash: addPublicKeyHash });

  const KDF_ITERATIONS = 262144;
  const KDF_KEY_SIZE = 256 / 8;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setInstitutionData((prevData) => ({
      ...prevData,
      [name]: value,
    }));
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setDownloadLink(null);
    setGeneratedPublicKey(null);

    showSnackbar("Gerando chaves da instituição...", "info");

    setIsGeneratingKeys(true);
    try {
      const privateKeyECDSABytes = randomBytes(32);
      const privateKeyECDSAHex = bytesToHex(privateKeyECDSABytes);

      const publicKeyECDSABytes = secp.getPublicKey(privateKeyECDSABytes, false);
      const publicKeyECDSAHex = bytesToHex(publicKeyECDSABytes);

      setGeneratedPublicKey(publicKeyECDSAHex);

      const salt = CryptoJS.lib.WordArray.random(128 / 8);
      const key = CryptoJS.PBKDF2(institutionData["masterPassword"], salt, {
        keySize: KDF_KEY_SIZE / 4,
        iterations: KDF_ITERATIONS,
      });

      // GERAÇÃO DO IV E SUA INCLUSÃO NA CRIPTOGRAFIA E NO BACKUP
      const iv = CryptoJS.lib.WordArray.random(128 / 8); // <<< Gerar o IV aqui

      const encryptedPrivateKey = CryptoJS.AES.encrypt(privateKeyECDSAHex, key, {
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
        iv: iv, // <<< Passar o IV para a criptografia
      }).toString();

      const backupData = {
        encryptedPrivateKey: encryptedPrivateKey,
        salt: salt.toString(CryptoJS.enc.Hex),
        kdfIterations: KDF_ITERATIONS,
        iv: iv.toString(CryptoJS.enc.Hex), // <<< ADICIONAR ESTA LINHA: Salvar o IV no backup!
      };
      const backupContent = JSON.stringify(backupData, null, 2);
      const blob = new Blob([backupContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      setDownloadLink(url);

      writeAddInstitution({
        ...wagmiContractConfig,
        functionName: "addInstitutionInformation",
        args: [institutionData["institutionName"], institutionData["institutionDocument"]],
      });
    } catch (e: any) {
      console.error("Key generation or encryption error:", e);
      showSnackbar("Erro ao gerar chaves da instituição!", "error");
      setIsGeneratingKeys(false);
    }
  };

  useEffect(() => {
    if (isInstitutionAdded && generatedPublicKey && isConnected) {
      writeAddPublicKey({
        ...wagmiContractConfig,
        functionName: "addInstitutionPublicKey",
        args: [
          address as Address,
          generatedPublicKey,
        ],
      });
      // Não defina setIsGeneratingKeys(false) aqui, pois a transação de chave pública ainda está pendente.
      // Isso será tratado pela lógica de `overallPending` e `overallSuccess`.
    }
  }, [isInstitutionAdded, generatedPublicKey, address, writeAddPublicKey]);

  const overallPending = isAddingInstitution || isConfirmingAddInstitution || isAddingPublicKey || isConfirmingAddPublicKey || isGeneratingKeys;
  const overallSuccess = isInstitutionAdded && isPublicKeyAdded;

  useEffect(() => {
    if (isInstitutionAdded) {
      showSnackbar("Instituição adicionada com sucesso!", "success");
    }
  }, [isInstitutionAdded, showSnackbar]);

  useEffect(() => {
    if (isPublicKeyAdded) {
      showSnackbar("Chave pública registrada com sucesso!", "success");
    }
  }, [isPublicKeyAdded, showSnackbar]);

  useEffect(() => {
    const error = addInstitutionError || addInstitutionConfirmError;
    if (error) {
      showSnackbar("Erro ao adicionar instituição!", "error");
    }
  }, [addInstitutionError, addInstitutionConfirmError, showSnackbar]);

  useEffect(() => {
    const error = addPublicKeyError || addPublicKeyConfirmError;
    if (error) {
      showSnackbar("Erro ao gerar chave pública!", "error");
    }
  }, [addPublicKeyError, addPublicKeyConfirmError, showSnackbar]);

  return (
    <Card>
      <Typography variant="h4" component="h4">Adicionar Instituição</Typography>
      <form onSubmit={handleSubmit}>
        <Stack gap={2} flexDirection="row">
          <TextField
            label="Nome da Instituição"
            variant="outlined"
            required
            name="institutionName"
            value={institutionData["institutionName"]}
            onChange={handleChange}
            className={styles["add-institution-input"]}
            size="small"
          />
          <TextField
            label="Documento da Instituição"
            variant="outlined"
            required
            value={institutionData["institutionDocument"]}
            name="institutionDocument"
            onChange={handleChange}
            className={styles["add-institution-input"]}
            size="small"
          />
          <TextField
            label="Senha"
            variant="outlined"
            required
            value={institutionData["masterPassword"]}
            name="masterPassword"
            onChange={handleChange}
            className={styles["add-institution-input"]}
            type="password"
            size="small"
          />
          <Button
            type="submit"
            variant="contained"
            disabled={overallPending}
            className={`${styles["add-institution-button"]} register-button`}
          >
             Adicionar Instituição & Gerar Chaves
          </Button>
        </Stack>
      </form>

      {addInstitutionHash && (<TransactionInfo label="Institution Transaction Hash:" hash={addInstitutionHash} />)}

      {addPublicKeyHash && (<TransactionInfo label="Public Key Transaction Hash:" hash={addPublicKeyHash} />)}

      {downloadLink && overallSuccess && (
        <Stack gap={2}>
          <p className="info-text">Importante: Baixe seu Arquivo de Chave Privada Criptografada!</p>
          <p className="info-text">Este arquivo, junto com sua Senha Mestra, é essencial para descriptografar seus dados acadêmicos. Mantenha-o seguro!</p>
          <a href={downloadLink} download={`${address}_encrypted_private_key.json`} className="download-button">
            Download Chave Privada Criptografada (JSON)
          </a>
        </Stack>
      )}
    </Card>
  );
}