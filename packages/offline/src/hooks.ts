import { useEffect, useState } from 'react';
import { isOnline, onConnectivityChange } from './connectivity';

/** React hook that tracks online/offline connectivity state */
export function useConnectivity(): boolean {
  const [connected, setConnected] = useState(isOnline);

  useEffect(() => {
    setConnected(isOnline());
    return onConnectivityChange(setConnected);
  }, []);

  return connected;
}
