import React, { useState } from 'react'
import styles from "./transaction-info.module.css";
import Stack from '@mui/material/Stack';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DoneAllIcon from '@mui/icons-material/DoneAll';

type TransactionInfoProps = {
  label?: string;
  hash: string;
}

const TransactionInfo = ({ label, hash }: TransactionInfoProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!hash) return;

    navigator.clipboard.writeText(hash);
    setCopied(true);

    setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  return (
    <Stack flexDirection="row" gap={2} alignItems="center">
      <Stack flexDirection="row" gap={2} alignItems="center">
        <p>{label ? label : "Hash da Transação:"} </p>
        <a className={styles["transaction-hash"]} href={`https://sepolia.etherscan.io/tx/${hash}`} target="_blank" rel="noopener noreferrer">{hash}</a>
      </Stack>
      <button
        onClick={handleCopy}
        title="Copiar Hash"
        className={styles["clippboard-button"]}
      >
        {copied ? (
          <DoneAllIcon sx={{ color: 'green', fontSize: '1.2rem' }} />
        ) : (
          <ContentCopyIcon />
        )}
      </button>
    </Stack>
  )
}

export default TransactionInfo