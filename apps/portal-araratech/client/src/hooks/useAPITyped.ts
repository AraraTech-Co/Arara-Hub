import { useState, useEffect, useContext, useCallback, useRef } from "react";
import Axios from "axios";
import { ViewContext } from "@/components/lib";
import type { ApiSuccessResponse } from "@/types/tickets";

interface ViewContextType {
  handleError: (error: unknown) => void;
}

interface UseAPIState<T> {
  data: T | null;
  loading: boolean;
}

/**
 * Hook tipado para endpoints que retornam { success, data }.
 */
export function useAPITyped<T>(url: string | null, method = "get"): UseAPIState<T> {
  const context = useRef(useContext<ViewContextType>(ViewContext));
  const [state, setState] = useState<UseAPIState<T>>({ data: null, loading: false });

  const fetch = useCallback(async () => {
    try {
      if (!url) {
        setState({ data: null, loading: false });
        return;
      }

      setState((prev) => ({ ...prev, loading: true }));
      const res = await Axios<ApiSuccessResponse<T>>({
        url,
        method: method || "get",
      });
      setState({ data: res.data.data, loading: false });
    } catch (err) {
      context.current?.handleError(err);
      setState({ data: null, loading: false });
    }
  }, [url, method]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return state;
}
