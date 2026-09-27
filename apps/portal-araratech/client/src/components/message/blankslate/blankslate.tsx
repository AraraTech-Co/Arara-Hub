/***
 *
 *   BlANKSLATE MESSAGE
 *   Message with a call to action – use when no data to display
 *
 *   PROPS
 *   title: descriptive string (optional)
 *   text: string containing custom text (optional)
 *   action: callback function executed on button click (optional)
 *   buttonText: cta button text
 *
 **********/

import { Button } from "@/components/lib";
import Style from "./blankslate.tailwind";

export function BlankSlateMessage(props) {
  const offset = {
    ...(props.marginTop && { marginTop: props.marginTop }),
    ...(props.marginLeft && { marginLeft: props.marginLeft }),
  };

  return (
    <div className={Style.blankslate} style={offset}>
      {props.title && <h2 className={Style.title}>{props.title}</h2>}

      {props.text && <p>{props.text}</p>}

      {props.action && (
        <Button
          text={props.buttonText}
          action={props.action}
          color="green"
          className="inline-block mt-6"
        />
      )}
    </div>
  );
}
