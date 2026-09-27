/***
 *
 *   usePermissions hook
 *   fetch, format and return the user permissions
 *
 **********/

import { useState, useEffect } from "react";
import { useAPI } from "@/components/lib";

export function usePermissions() {
  const [state, setState] = useState<any>({ data: null, loading: false }); // TODO: Type this
  const permissions = useAPI("/api/user/permissions");
  console.log("usePermissions state:", state);
  console.log("API permissions data:", permissions?.data);
  useEffect(() => {
    setState({ loading: true });
    
    // format permissions
    if (permissions.data) {
      let perms = [];
      Object.keys(permissions?.data).map((perm) => {
        perms.push({ value: perm, label: perm });
        console.log("Formatted permissions list:", perms);
        setState({ data: { list: perms }, loading: false });
        return perms;
      });
    }
  }, [permissions]);

  return state;
}
