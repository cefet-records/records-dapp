import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { useReadContract } from "wagmi";

export function ReadContract() {
    const { data: ownerAddress, isLoading, isError, error } = useReadContract({
        ...wagmiContractConfig,
        functionName: "owner",
    });
    if (isLoading) return <div>Conectando ao contrato...</div>;
    if (isError) {
        return (
            <div>
                <p>Erro ao conectar ao contrato:</p>
                <pre>{error?.message}</pre>
            </div>
        );
    }
    return (
        <div>
            <h3>Conexão com Contrato OK!</h3>
            <p>Endereço do Contrato: {wagmiContractConfig.address}</p>
            <p>Dono do Contrato (lido da blockchain): {ownerAddress as string}</p>
        </div>
    );
}