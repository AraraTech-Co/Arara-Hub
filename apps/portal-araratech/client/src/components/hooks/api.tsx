/***
 *
 *   useAPI hook
 *   Interact with API calls – handle errors, return loading state and data
 *
 *   PROPS
 *   url: endpoint url
 *   method: get, post, put etc.. (default: get)
 *
 **********/

import { useState, useEffect, useContext, useCallback, useRef } from "react";
import Axios from "axios";
import { ViewContext } from "@/components/lib";

interface ViewContextType {
  handleError: (error: any) => void;
}

export function useAPI(url: string, method = "get") {
  // wrap in useRef to prevent triggering useEffect multiple times
  const context = useRef(useContext<ViewContextType>(ViewContext));
  // TODO: Type this to avoid ANY
  const [state, setState]: any = useState({ data: null, loading: false });
  console.log("useAPI url:", url);
  console.log("useAPI method:", method);
  console.log("useAPI state:", state);
  console.log("ViewContext handleError:", context?.current?.handleError);
  const fetch = useCallback(async () => {
    try {
      if (!url) {
        setState({ data: null, loading: false });
        return false;
      }
      
      setState({ loading: true });
      const res = await Axios({
        url: url,
        method: method || "get",
      });
      console.log("API response data:", res?.data?.data);
      setState({ data: res.data.data, loading: false });
    } catch (err) {
      context?.current && context.current.handleError(err);
    }
  }, [url, method, context]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return state;
}
