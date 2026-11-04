import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeFocus } from "../../auth/focus-refresh";
// No persisted data and no cached authorization. Callers scope the key to realm/actor/query.
export function useManagementResource(key, fetcher, onDenied) {
  const [record, setRecord] = useState(null), life = useRef(null);
  const refresh = useCallback(async () => {
    const current = life.current; if (!current || current.pending) return;
    current.pending = true; const controller = new AbortController(); current.controller = controller;
    setRecord(old => ({ key, data: old?.key === key ? old.data : null, loading: true, error: null }));
    try {
      const data = await fetcher(controller.signal);
      if (life.current === current && !controller.signal.aborted) setRecord({ key, data, loading: false, error: null });
    } catch (error) {
      if (life.current === current && !controller.signal.aborted) {
        if ([401,403,404].includes(error.status)) onDenied?.();
        setRecord(old => ({ key, data: [401,403,404].includes(error.status) ? null : old?.key === key ? old.data : null, loading: false, error }));
      }
    } finally { if (life.current === current) current.pending = false; }
  }, [key, fetcher, onDenied]);
  useEffect(() => {
    const current = { pending: false }; life.current = current; void Promise.resolve().then(refresh);
    const off = subscribeFocus(refresh);
    return () => { current.controller?.abort(); if (life.current === current) life.current = null; off(); };
  }, [refresh]);
  const clear = useCallback(error => setRecord({ key,data:null,loading:false,error }),[key]);
  return { clear,data: record?.key === key ? record.data : null, loading: !record || record.key !== key || record.loading, error: record?.key === key ? record.error : null, refresh };
}
