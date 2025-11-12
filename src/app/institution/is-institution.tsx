import { useReadContract } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { JSX, useState } from "react";
import { Address } from "viem";

export default function CheckInstitutionStatus(): JSX.Element {
    const { primaryWallet } = useDynamicContext();
    const connectedAddress = primaryWallet?.address as Address | undefined;
    const [hasBeenChecked, setHasBeenChecked] = useState(false);
    
    const {
        data: isUserAnInstitution, 
        isLoading, 
        isError, 
        error, 
        refetch
    } = useReadContract({
        ...wagmiContractConfig,
        functionName: "isInstitution",
        args: connectedAddress ? [connectedAddress] : undefined,
        query: { enabled: false }
    });

    const handleCheckStatusClick = async() => {
        if (!primaryWallet?.isConnected || !connectedAddress) {
            alert("Por favor, conecte sua carteira primeiro.");
            return;
        }
        setHasBeenChecked(true);
        await refetch(); 
    };
    
    const displayAddress = connectedAddress ? `${connectedAddress.substring(0, 6)}...` : "N/A";

    return (
        <div style={{ marginTop: '1.5rem', border: '1px dashed #ccc', padding: '1rem', borderRadius: '4px' }}>
            <h3>Verificação de Status (Instituição)</h3>
            <p style={{ color: 'gray' }}>
                Verifique se a sua conta conectada (<code className="font-mono">{displayAddress}</code>)
                está registrada como uma instituição.
            </p>
            
            <button 
                onClick={handleCheckStatusClick} 
                disabled={isLoading || !primaryWallet?.isConnected}
                style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', backgroundColor: '#333', color: 'white', borderRadius: '4px' }}
            >
                {isLoading ? "Verificando..." : "Verificar Status Agora"}
            </button>
            
            {hasBeenChecked && !isLoading && (
                <div style={{ marginTop: "1rem" }}>
                    {isError && (
                        <div>
                            <p style={{color: "red"}}>⚠️ Erro ao verificar status: {error?.message}</p>
                        </div>
                    )}
                    
                    {isUserAnInstitution !== undefined && (
                        <p style={{marginTop: "0.5rem", color: isUserAnInstitution ? "green" : "orange"}}>
                            Status: <strong>{isUserAnInstitution ? "Instituição Autorizada" : "Acesso de Visualizador"}</strong>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}