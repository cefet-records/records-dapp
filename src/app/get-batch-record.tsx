import { useReadContracts } from "wagmi";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";
import { JSX } from "react";
import { formatRecordStruct } from "@/utils/utils";

const mockRecordIds: `0x${string}`[] = [
    "0xa0e38170335401b7e8515c134a56cf8327e1e31c9fa0e6486a5ad8b6c14782ce"
];

export default function DisplayRegisteredRecords(): JSX.Element {
    const contractCalls = mockRecordIds.map((id) => ({
        ...wagmiContractConfig,
        functionName: "records",
        args: [id]
    }));
    const { data, isLoading, isError, error } = useReadContracts({
        contracts: contractCalls
    });
    if (isLoading) return <div>Buscando registros na blockchain...</div>;
    if (isError) return <div>Erro ao buscar registros: {error?.message}</div>;
    return (
        <div style={{marginTop: "1.5rem"}}>
            <h3>Registros lidos da blockchain (do mapping):</h3>
            {data && data.map((recordResult, index) => (
                <div key={index} style={{marginBottom: "1rem"}}>
                    <h4>Registro para ID: {mockRecordIds[index]}</h4>
                    {recordResult.status === 'success' ? (
                        <pre style={{background: '#f4f4f4', padding: '10px', borderRadius: '5px'}}>
                            {JSON.stringify(
                                formatRecordStruct(recordResult.result as unknown as readonly any[]),
                                (_key, value) => (typeof value === 'bigint' ? value.toString() : value), 
                                2
                            )}
                        </pre>
                    ) : (
                        <p style={{color: 'red'}}>Erro ao buscar este registro: {recordResult.error?.message}</p>
                    )}
                </div>
            ))}
        </div>
    );
}