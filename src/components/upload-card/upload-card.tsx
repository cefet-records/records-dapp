import Button from '@mui/material/Button';
import React from 'react';
import { styled } from "@mui/material/styles";
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

const VisuallyHiddenInput = styled('input')({
  clip: 'rect(0 0 0 0)',
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  position: 'absolute',
  bottom: 0,
  left: 0,
  whiteSpace: 'nowrap',
  width: 1,
});

type UploadCardProps = {
  label: string;
  handleFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const UploadCard = ({ label,handleFileChange }: UploadCardProps) => {
  return (
    <Button
      id="backupFile"
      component="label"
      role={undefined}
      variant="contained"
      tabIndex={-1}
      startIcon={<CloudUploadIcon />}
      className="register-button"
    >
      {label}
      <VisuallyHiddenInput
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
      />
    </Button>
  )
}

export default UploadCard