"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ReadContract } from "./read-contract";
import CheckInstitutionStatus from "./institution/is-institution";
import AddInstitution from "./institution/add-institution";
import RegisterBatchRecords from "./add-batch-record";
import DisplayRegisteredRecords from "./get-batch-record";
import DecryptRecord from "./decrypt-record";
import PublicKeyRecovery from "./get-pk";
import { useAccount} from "wagmi";
import { Hex } from "viem";
import GrantAccess from "./grant-record-access";
import ViewGrantedAccess from "./view-granted-record-access";
import RevokeAccess from "./revoke-access";
import AddStudent from "./student/add-student";
import { AddInstitutionPublicKey } from "./institution/add-institution-pk";
import { GetInstitutionDetails } from "./institution/get-institution";
import { AddStudentInformation } from "./student/add-student-information";
import { useState } from "react";

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
  const [pageStatusMessage, setPageStatusMessage] = useState<string | null>(null);
  const handlePublicKeyRecovered = (publicKey: Hex, address: Hex) => {
    console.log(`Chave Pública Recuperada no Home: ${publicKey} para o endereço: ${address}`);
    // Se você precisasse passar essa chave para outro componente que o Home renderiza,
    // você armazenaria aqui num estado e passaria como prop.
  };
  return (
    <div>
      <DynamicWidget />
      {/* <AccountInfo /> */}
      <ReadContract />

      <AddInstitution />
      <CheckInstitutionStatus />
      <AddInstitutionPublicKey />
      <GetInstitutionDetails />

      <AddStudent />
      <AddStudentInformation setStatusMessage={setPageStatusMessage} />
      {/*<RegisterBatchRecords />
      <DisplayRegisteredRecords />
      <DecryptRecord />
      <GrantAccess />
      <RevokeAccess />
      <ViewGrantedAccess />
      <PublicKeyRecovery
        title="Chave Pública do Usuário Conectado" // Título para exibir no componente
        onPublicKeyReady={handlePublicKeyRecovered} // Função de callback
      />
       */}
    </div>   
  );
}
