import { FormEvent, JSX } from "react";
import { type BaseError, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";


export default function AddStudent(): JSX.Element {
    const { primaryWallet } = useDynamicContext();
    const { data: hash, error, isPending, writeContract } = useWriteContract();
    const submit = async(e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const studentAddress = formData.get("studentAddress") as string;
        const institutionAddress = primaryWallet?.address;
        writeContract({
            ...wagmiContractConfig, 
            functionName: "addStudent", 
            args: [institutionAddress as Address, studentAddress as Address]
        });
    };
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    return (
        <div>
            <h5>Add Student</h5>
            <form onSubmit={submit}>
                <input type="text" name="studentAddress" placeholder="Address" required />
                <button disabled={isPending} type="submit">{isPending ? "Adding..." : "Add Student"}</button>
                {hash && <div>Transaction Hash: {hash}</div>}
                {isConfirming && <div>Waiting for confirmation...</div>}
                {isConfirmed && <div>Transaction confirmed.</div>}
                {error && <div>Error: {(error as BaseError).shortMessage || error.message}</div>}
            </form>
        </div>
    );
}