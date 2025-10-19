import { FormEvent, JSX } from "react";
import { type BaseError, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

export default function AddInstitution(): JSX.Element {
    const { data: hash, error, isPending, writeContract } = useWriteContract();
    const submit = async(e: FormEvent<HTMLFormElement>): Promise<void> => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const institutionAddress = formData.get("institutionAddress") as string;
        writeContract({
            ...wagmiContractConfig,
            functionName: "addInstitution",
            args: [institutionAddress as Address]
        });
    };
    const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash });
    return (
        <form onSubmit={submit}>
            <input type="text" name="institutionAddress" placeholder="0x5FbDB..." required />
            <button disabled={isPending} type="submit">{isPending ? "Adding..." : "Add Institution"}</button>
            {hash && <div>Transaction Hash: {hash}</div>}
            {isConfirming && <div>Waiting for confirmation...</div>}
            {isConfirmed && <div>Transaction confirmed.</div>}
            {error && <div>Error: {(error as BaseError).shortMessage || error.message}</div>}
        </form>
    );
}