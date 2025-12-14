import Stack from '@mui/material/Stack'
import React from 'react'
import { RequestAccess } from './request-access'
import { GetGrade } from '../grade/get-grade'

const VisitorWrapper = () => {
  return (
    <Stack>
      <RequestAccess />
      <GetGrade />
    </Stack>
  )
}

export default VisitorWrapper