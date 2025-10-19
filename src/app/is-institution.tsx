import { useReadContract } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { useState } from "react";
import { Address } from "viem";

export default function CheckInstitutionStatus() {
    const { primaryWallet } = useDynamicContext();
    const [hasBeenChecked, setHasBeenChecked] = useState(false);
    const {data: isUserAnInstitution, isLoading, isError, error, refetch} = useReadContract({
        ...wagmiContractConfig,
        functionName: "isInstitution",
        args: [primaryWallet?.address as Address],
        query: { enabled: false }
    });
    const handleCheckStatusClick = async() => {
        if (!primaryWallet?.isConnected || !primaryWallet?.address) {
            alert("Por favor, conecte sua carteira primeiro.");
            return;
        }
        setHasBeenChecked(true);
        await refetch();
    };
    
    return (
        <div>
            <h3>Verificação Manual de Status</h3>
            <p>
                Verifique se a sua conta conectada ({primaryWallet?.address ? (primaryWallet?.address).substring(0, 6) + "..." : "N/A"})
                está registrada como uma instituição.
            </p>
            <button onClick={handleCheckStatusClick} disabled={isLoading || !primaryWallet?.isConnected}>
                {isLoading ? "Verificando..." : "Verificar Status Agora"}
            </button>
            {hasBeenChecked && !isLoading && (
                <div>
                    {isError && (
                        <div>
                            <p style={{color: "red"}}>Erro ao verificar status:</p>
                            <pre>{error?.message}</pre>
                        </div>
                    )}
                    {isUserAnInstitution !== undefined && (
                        <p style={{marginTop: "1rem"}}>É um instituição autorizada ? <strong>{isUserAnInstitution ? "Sim" : "Não"}</strong></p>
                    )}
                </div>
            )}
        </div>
    );
}