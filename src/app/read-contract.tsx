import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useReadContract } from "wagmi";
import { Address} from "viem";
import { JSX } from "react";

export function ReadContract(): JSX.Element {
    const { 
        data: ownerAddress, isLoading, isError, error 
    } = useReadContract({...wagmiContractConfig, functionName: "owner"});

    if (isLoading) {
        return <div>Conectando ao contrato...</div>;
    }

    if (isError) {
        return (
            <div style={{ marginTop: '1rem', color: 'red', border: '1px solid red', padding: '0.5rem' }}>
                <p>ERRO ao conectar ao contrato (ABI/Endereço Incorreto ou Rede):</p>
                <pre style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{(error as any)?.shortMessage || error?.message}</pre>
            </div>
        );
    }
    
    const owner = ownerAddress as Address | undefined;

    return (
        <div style={{ marginTop: '1rem', padding: '0.5rem', border: '1px solid green', borderRadius: '4px' }}>
            <h3>Conexão com Contrato OK!</h3>
            <p>Endereço do Contrato: <code style={{ fontSize: '0.9em' }}>{wagmiContractConfig.address}</code></p>
            <p>Dono do Contrato: <code style={{ fontSize: '0.9em' }}>{owner || 'Não encontrado/vazio'}</code></p>
        </div>
    );
}