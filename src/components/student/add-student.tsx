import { FormEvent, JSX, use, useEffect, useState } from "react";
import { type BaseError, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import Card from "../card/card";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import TransactionInfo from "../transaction-info/transaction-info";
import { useSnackbar } from "../snackbar/snackbar-context";
import styles from "./add-student.module.css";

export default function AddStudent(): JSX.Element {
  const { primaryWallet } = useDynamicContext();
  const { data: hash, error, isPending, writeContract } = useWriteContract();

  const { showSnackbar } = useSnackbar();

  const [studentAddress, setStudentAddress] = useState<string>("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    try {
      showSnackbar("Adicionando estudante...", "info");
      const institutionAddress = primaryWallet?.address;
      writeContract({
        ...wagmiContractConfig,
        functionName: "addStudent",
        args: [institutionAddress as Address, studentAddress as Address]
      });
    } catch (error: unknown) {
      console.log("Erro ao adicionar estudante:", error);
    }
  };
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });

  useEffect(() => {
    if (isConfirmed) {
      showSnackbar("Estudante adicionado com sucesso!", "success");
    }
  }, [isConfirmed, showSnackbar]);

  useEffect(() => {
    if (error) {
      showSnackbar("Erro ao adicionar estudante", "error");
    }
  }, [error, showSnackbar]);

  return (
    <Card>
      <Typography variant="h4" component="h4">Adicionar Estudante</Typography>

      <form onSubmit={handleSubmit}>
        <Stack gap={2} flexDirection="row">
          <TextField
            label="Endereço do Estudante (0x...)"
            variant="outlined"
            required
            name="studentAddress"
            value={studentAddress}
            onChange={(e) => setStudentAddress(e.target.value)}
            size="small"
            className={styles["add-student-input"]}
          />
          <Button
            disabled={isPending}
            variant="contained"
            type="submit"
            className={`${styles["add-student-button"]} register-button`}
          >
            Adicionar Estudante
          </Button>
        </Stack>
      </form>
      {hash && <TransactionInfo label="Transaction Hash:" hash={hash} />}
    </Card>
  );
}