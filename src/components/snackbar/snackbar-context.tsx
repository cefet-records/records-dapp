import React, { createContext, useContext, useState, useCallback } from 'react';
import Alert from '@mui/material/Alert';
import Snackbar, { SnackbarCloseReason } from '@mui/material/Snackbar';

type Severity = 'success' | 'info' | 'warning' | 'error';

interface SnackbarContextData {
  showSnackbar: (message: string, severity?: Severity, duration?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextData>({} as SnackbarContextData);

export const SnackbarProvider = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<Severity>('info');
  const [duration, setDuration] = useState(6000);

  const showSnackbar = useCallback((msg: string, severity: Severity = 'info', duration: number = 6000) => {
    setMessage(msg);
    setSeverity(severity);
    setDuration(duration);
    setOpen(true);
  }, []);

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: SnackbarCloseReason) => {
    if (reason === 'clickaway') return;
    setOpen(false);
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      
      <Snackbar 
        open={open} 
        autoHideDuration={duration} 
        onClose={handleClose} 
        anchorOrigin={{ vertical: "top", horizontal: "center"}}
      >
        <Alert onClose={handleClose} severity={severity} variant="filled" sx={{ width: '100%' }}>
          {message}
        </Alert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => useContext(SnackbarContext);