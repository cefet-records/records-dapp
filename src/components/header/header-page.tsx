import { DynamicWidget } from '@dynamic-labs/sdk-react-core'
import Typography from '@mui/material/Typography'
import styles from "./header-page.module.css"
import React from 'react'
import Stack from '@mui/material/Stack'

const HeaderPage = () => {
  return (
    <header className={styles.header}>
      <Stack flexDirection="row" className={`${styles.headerContent} container`}>
        <Typography variant="h4" component="h1">
          Records dApp
        </Typography>
        <DynamicWidget />
      </Stack>
    </header>
  )
}

export default HeaderPage