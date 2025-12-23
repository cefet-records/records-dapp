import Stack from '@mui/material/Stack'
import React from 'react'
import { RequestAccess } from './request-access'
import { GetGrade } from '../grade/get-grade'

const VisitorWrapper = () => {
  return (
    <Stack gap={4} mb={4}>
      <RequestAccess />
      <GetGrade />
    </Stack>
  )
}

export default VisitorWrapper