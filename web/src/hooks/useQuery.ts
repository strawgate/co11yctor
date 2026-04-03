import { useState, useEffect, useCallback, useRef } from "preact/hooks";

interface UseQueryResult<T> {
  data: T | undefined;
  error: Error | null;
  isLoading: boolean;
  refetch: () => void;
}

export function useQuery<T>(
  queryFn: () => Promise<T>,
  deps: unknown[] = [],
  options?: { refetchInterval?: number; enabled?: boolean },
): UseQueryResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const mountedRef = useRef(true);
  const queryFnRef = useRef(queryFn);
  const enabledRef = useRef(options?.enabled !== false);

  // Keep refs current without triggering re-renders
  queryFnRef.current = queryFn;
  enabledRef.current = options?.enabled !== false;

  const fetchData = useCallback(async () => {
    if (!enabledRef.current) return;
    try {
      setIsLoading(true);
      const result = await queryFnRef.current();
      if (mountedRef.current) {
        setData(result);
        setError(null);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();

    let interval: ReturnType<typeof setInterval> | undefined;
    if (options?.refetchInterval && enabledRef.current) {
      interval = setInterval(fetchData, options.refetchInterval);
    }

    return () => {
      mountedRef.current = false;
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, options?.refetchInterval]);

  return { data, error, isLoading, refetch: fetchData };
}
