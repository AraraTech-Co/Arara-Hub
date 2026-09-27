/***
 *
 *   USER
 *   shows the current user
 *   if user belongs to more than one account they can switch accounts here
 *
 **********/

// TODO: Type the any's in this file

import { useContext } from "react";
import { AuthContext, ViewContext, HoverNav, Button } from "@/components/lib";
import Style from "./user.tailwind";

export function User() {
  const authContext = useContext<any>(AuthContext);
  const viewContext = useContext<any>(ViewContext);
  const accountName = authContext.user?.accounts?.find(
    (x) => x.id === authContext.user?.account_id,
  )?.name;

  return (
    <div className={Style.user}>
      <div className={Style.name}>Welcome, {authContext.user?.name}</div>

      {authContext.user?.accounts?.length > 1 && (
        <HoverNav
          dark
          icon="user"
          label={accountName}
          className={Style.hoverNav}
          align="right"
        >
          {authContext.user.accounts.map((account) => {
            return (
              <Button
                key={account.id}
                text={account.name}
                action={() => {
                  viewContext.setLoading(true);
                  authContext.switchAccount(account.id);
                }}
              />
            );
          })}
        </HoverNav>
      )}
    </div>
  );
}
