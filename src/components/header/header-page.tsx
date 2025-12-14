import { DynamicWidget } from '@dynamic-labs/sdk-react-core'
import React from 'react'

const HeaderPage = () => {
  return (
    <header className="sticky top-0 z-50 w-full bg-white shadow-md h-16">
      <DynamicWidget />
    </header>
  )
}

export default HeaderPage