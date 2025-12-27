import Stack from '@mui/material/Stack'
import React, { JSX, ReactNode } from 'react'
import styles from "./card.module.css"

const Card = ({ children }: { children: ReactNode }) => {
  return (
    <Stack className={styles["card-wrapper"]} gap={3}>
      {children}
    </Stack>
  )
}

export default Card