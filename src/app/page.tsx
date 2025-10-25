"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ReadContract } from "./read-contract";
import CheckInstitutionStatus from "./is-institution";
import AddInstitution from "./add-institution";
import RegisterBatchRecords from "./add-batch-record";
import DisplayRegisteredRecords from "./get-batch-record";
import DecryptRecord from "./decrypt-record";
import PublicKeyRecovery from "./get-pk";
import { useAccount} from "wagmi";
import { Hex } from "viem";

function AccountInfo() {
  const { primaryWallet } = useDynamicContext();
  const { isConnected, chain } = useAccount();
  
  return (
    <div>
      <p>wagmi connected: {isConnected ? 'true' : 'false'}</p>
      <p>wagmi address: {primaryWallet?.address}</p>
      <p>wagmi network: {chain?.id}</p>
    </div>
  );
}

export default function Home() {
  const handlePublicKeyRecovered = (publicKey: Hex, address: Hex) => {
    console.log(`Chave Pública Recuperada no Home: ${publicKey} para o endereço: ${address}`);
    // Se você precisasse passar essa chave para outro componente que o Home renderiza,
    // você armazenaria aqui num estado e passaria como prop.
  };
  return (
    <div>
      <DynamicWidget />
      <AccountInfo />
      <ReadContract />
      <AddInstitution />
      <RegisterBatchRecords />
      <DisplayRegisteredRecords />
      <DecryptRecord />
      <PublicKeyRecovery
        title="Chave Pública do Usuário Conectado" // Título para exibir no componente
        onPublicKeyReady={handlePublicKeyRecovered} // Função de callback
      />
      <CheckInstitutionStatus />
    </div>   
  );
}
