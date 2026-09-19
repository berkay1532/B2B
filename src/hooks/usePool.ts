"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getPoolClient, type PoolState } from "@/lib/pool";

export function usePool() {
  const client = useMemo(() => getPoolClient(), []);
  const [state, setState] = useState<PoolState | null>(null);
  const refresh = useCallback(async () => { setState(await client.getState()); }, [client]);
  useEffect(() => {
    void refresh();
    return client.subscribe(setState);
  }, [client, refresh]);
  return { state, client, refresh };
}
