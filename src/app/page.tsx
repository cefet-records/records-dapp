"use client";

import { DynamicEmbeddedWidget, useDynamicContext } from "@dynamic-labs/sdk-react-core";
import Typography from "@mui/material/Typography";
import { Stack } from "@mui/system";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";

const Page = () => {
  const { isConnected, isConnecting } = useAccount();
  const { primaryWallet } = useDynamicContext();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Pequeno delay para garantir que o estado está estabilizado
    const timer = setTimeout(() => {
      setIsChecking(false);
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isChecking && (isConnected || primaryWallet)) {
      router.replace("/home");
    }
  }, [isConnected, primaryWallet, router, isChecking]);

  // Não renderiza nada enquanto verifica ou está conectado
  if (isChecking || isConnecting || isConnected || primaryWallet) {
    return null;
  }

  return (
    <Stack
      sx={{
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        fontWeight: "bold",
      }}
      gap={4}
    >
      <Typography variant="h1" sx={{ fontSize: "2rem" }}>
        Records Dapp
      </Typography>

      <Stack>
        <DynamicEmbeddedWidget
          style={{ width: "40vw", maxWidth: "500px" }}
          background="with-border"
        />
      </Stack>
    </Stack>
  );
};

export default Page;
