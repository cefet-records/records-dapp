import { FormEvent, JSX, useState } from "react";
import {
    type BaseError,
    useWriteContract,
    useWaitForTransactionReceipt
} from "wagmi";
import { Address } from "viem";
import { wagmiContractConfig } from "@/abis/AcademicRecordStorageABI";

export default function AddInstitution(): JSX.Element {
    const [institutionAddress, setInstitutionAddress] = useState<string>("");
    const [statusMessage, setStatusMessage] = useState<string>("");

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
        setStatusMessage("");

        if (!institutionAddress) {
            setStatusMessage("Por favor, insira o endereço da instituição.");
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
            setStatusMessage(e.message || "Falha ao enviar transação de registro.");
        }
    };

    const displayError = registerInstitutionError || registerInstitutionConfirmError;
    const overallPending = isRegisteringInstitution || isConfirmingRegistration;

    return (
        <div className="add-institution-container" style={{ marginTop: '1.5rem', border: '1px solid #007bff', padding: '1rem', borderRadius: '4px' }}>
            <h2>Registrar Endereço da Instituição</h2>
            <form onSubmit={handleSubmit} className="form space-y-3">
                <input
                    type="text"
                    name="institutionAddress"
                    placeholder="Endereço da Instituição (0x...)"
                    value={institutionAddress}
                    onChange={(e) => setInstitutionAddress(e.target.value)}
                    required
                    disabled={overallPending}
                    className="w-full p-2 border rounded"
                />
                
                <button
                    disabled={overallPending}
                    type="submit"
                    style={{ padding: '0.5rem 1rem', backgroundColor: '#007bff', color: 'white', borderRadius: '4px', opacity: overallPending ? 0.6 : 1, marginTop: '10px' }}
                >
                    {overallPending
                        ? "Registrando..."
                        : "Registrar Endereço da Instituição"}
                </button>
            </form>

            {statusMessage && (
                <p className="status-message text-red-500" style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
                    {statusMessage}
                </p>
            )}

            {registerInstitutionHash && (
                <p className="transaction-hash" style={{ marginTop: '0.8rem' }}>
                    Hash da Transação: <a href={`https://sepolia.etherscan.io/tx/${registerInstitutionHash}`} target="_blank" rel="noopener noreferrer">{registerInstitutionHash}</a>
                </p>
            )}

            {isConfirmingRegistration && (
                <p className="status-message" style={{ marginTop: '0.8rem', color: 'orange' }}>
                    Aguardando confirmação da transação...
                </p>
            )}

            {isInstitutionRegistered && (
                <p className="status-message text-green-700" style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
                    Instituição registrada com sucesso! Agora a instituição pode atualizar seu perfil.
                </p>
            )}

            {displayError && (
                <p className="error-message text-red-500" style={{ marginTop: '0.8rem', fontWeight: 'bold' }}>
                    Erro: {(displayError as BaseError).shortMessage || displayError.message}
                </p>
            )}
        </div>
    );
}