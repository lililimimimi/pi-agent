import { useEffect, useState } from 'react'

type NetworkStatusCallbacks = {
  onOffline?: () => void
  onOnline?: () => void
}

export function useNetworkStatus(callbacks?: NetworkStatusCallbacks): { isOnline: boolean } {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      callbacks?.onOnline?.()
    }

    const handleOffline = () => {
      setIsOnline(false)
      callbacks?.onOffline?.()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [callbacks])

  return { isOnline }
}
