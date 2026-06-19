import { useState, useEffect } from 'react'

interface FeeConfig {
  supportingLetterAED: string
  supportingLetterUSD: string
}

export function useFeeConfig(): FeeConfig {
  const [config, setConfig] = useState<FeeConfig>({
    supportingLetterAED: '50.00',
    supportingLetterUSD: '14.00',
  })

  useEffect(() => {
    fetch('/api/config/fees')
      .then(r => r.json())
      .then((data: { supporting_letter_aed?: string; supporting_letter_usd?: string }) => {
        if (data.supporting_letter_aed && data.supporting_letter_usd) {
          setConfig({
            supportingLetterAED: data.supporting_letter_aed,
            supportingLetterUSD: data.supporting_letter_usd,
          })
        }
      })
      .catch(() => { /* retain defaults silently */ })
  }, [])

  return config
}
