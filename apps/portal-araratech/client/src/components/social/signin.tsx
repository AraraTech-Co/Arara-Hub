/***
 *
 *   SOCIAL SIGN IN BUTTONS
 *   To sign up/in with Facebook, Google or Microsoft
 *
 **********/

import { useState } from "react";
import { Button } from "@/components/lib";
import { ClassHelper } from "@/components/lib";
import settings from "@/settings.json";
import Style from "./social.tailwind";

type SocialSigninProps = {
  network?: string[];
  showOr?: boolean;
  invite?: string;
  signup?: boolean;
};

export function SocialSignin(props: SocialSigninProps) {
  const [loading, setLoading] = useState(
    props.network?.map((x) => {
      return { [x]: false };
    }),
  );
  const serverURL = settings[process.env.NODE_ENV].server_url;

  // construct query string
  let qs = "";
  if (props.invite) qs = `?invite=${props.invite}`;
  if (props.signup) qs = "?signup=1";

  return (
    <div className={Style.signinButtons}>
      {props.network?.map((n) => {
        const css = ClassHelper(Style, { [n]: true, signinButton: true });

        return (
          <Button
            key={n}
            loading={loading[n]}
            icon={["fab", n]}
            iconPack="fontawesome"
            iconSize="1x"
            iconButton
            fullWidth
            className={css}
            action={() => setLoading((prev) => ({ ...prev, [n]: true }))}
            url={`${serverURL}/auth/${n}${qs}`}
            text={`Continue with ${n.charAt(0).toUpperCase() + n.slice(1)}`}
          />
        );
      })}

      {props.showOr && <span className={Style.or}>or</span>}
    </div>
  );
}
