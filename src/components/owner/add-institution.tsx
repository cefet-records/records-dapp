import { FormEvent, JSX, useEffect, useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import Card from "../card/card";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";

import styles from "./add-institution.module.css";
import { useSnackbar } from "../snackbar/snackbar-context";
import TransactionInfo from "../transaction-info/transaction-info";

export default function AddInstitution(): JSX.Element {
  const [institutionAddress, setInstitutionAddress] = useState<string>("");
  const { showSnackbar } = useSnackbar();

  const {
    data: registerInstitutionHash,
    error: registerInstitutionError,
    isPending: isRegisteringInstitution,
    writeContract: writeRegisterInstitution,
  } = useWriteContract();

  const {
    isLoading: isConfirmingRegistration,
    isSuccess: isInstitutionRegistered,
    error: registerInstitutionConfirmError,
  } = useWaitForTransactionReceipt({ hash: registerInstitutionHash });

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    showSnackbar("Iniciando registro da instituição...", "info");
    if (!institutionAddress) {
      showSnackbar("Por favor, insira o endereço da instituição.", "error");
      return;
    }
    try {
      writeRegisterInstitution({
        ...wagmiContractConfig,
        functionName: "addInstitution",
        args: [institutionAddress as Address],
      });
    } catch (e: any) {
      console.error("Erro ao registrar instituição:", e);
      showSnackbar("Erro ao registrar instituição", "error");
    }
  };

  const overallPending = isRegisteringInstitution || isConfirmingRegistration;

  useEffect(() => {
    if (isInstitutionRegistered) {
      showSnackbar("Instituição registrada com sucesso!", "success");
    }
  }, [isInstitutionRegistered, showSnackbar]);

  useEffect(() => {
    const error = registerInstitutionError || registerInstitutionConfirmError;
    if (error) {
      console.error("Erro ao registrar instituição:", error);
      const errorMessage = error.message || error.toString();
      if (errorMessage.includes("InvalidAddressError") || errorMessage.includes("checksum")) {
        showSnackbar("Endereço da carteira inválido ou com formato incorreto.", "error");
      } else {
        showSnackbar("Erro ao registrar instituição. Tente novamente.", "error");
      }
      return;
    }
  }, [registerInstitutionError, registerInstitutionConfirmError, showSnackbar]);

  return (
    <Card>
      <Stack gap={4}>
        <Stack>
          <Typography variant="h5" fontWeight="bold">Registrar endereço da instituição</Typography>
          <Typography variant="body1" component="p" className="info-text">
            Como Owner, você pode registrar o endereço de uma nova instituição. A instituição precisará
            atualizar seu perfil e gerar suas próprias chaves em um componente separado.
          </Typography>
        </Stack>
        <form onSubmit={handleSubmit}>
          <Stack gap={2} flexDirection="row">
            <TextField
              label="Endereço da Instituição (0x...)"
              variant="outlined"
              required
              value={institutionAddress}
              onChange={(e) => setInstitutionAddress(e.target.value)}
              disabled={overallPending}
              size="small"
              className={styles["institution-address-input"]}
            />
            <Button
              disabled={overallPending}
              type="submit"
              variant="contained"
              className={`${styles["register-button"]} register-button`}
            >
              Registrar
            </Button>
          </Stack>
        </form>
      </Stack>
      <Stack>
        {registerInstitutionHash && (<TransactionInfo hash={registerInstitutionHash} />)}
      </Stack>
    </Card>
  );
}