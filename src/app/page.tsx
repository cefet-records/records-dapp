"use client";

import { DynamicWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { ReadContract } from "./read-contract";
import CheckInstitutionStatus from "./is-institution";
import { useAccount} from "wagmi";

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
  return (
    <div>
      <DynamicWidget />
      <AccountInfo />
      <ReadContract />
      <CheckInstitutionStatus />
    </div>   
  );
}
