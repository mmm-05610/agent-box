import { useCallback, useEffect, useState } from "react";
export function useQuery<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[] = [],
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    return loader()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  // The caller owns the loader's dependency contract (route id, etc.).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { data, error, loading, reload };
}
