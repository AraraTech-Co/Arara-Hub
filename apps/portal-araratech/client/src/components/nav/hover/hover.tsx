/***
 *
 *   HOVER NAV
 *   Reveals a nav when the user hovers over a hotspot
 *   Items are rendered as children, revealed is achieved with CSS
 *
 *   PROPS
 *   dark: boolean to set color (default: light)
 *   label: the hotspot text
 *   align: left or right
 *
 **********/

import { useState } from "react";
import { Animate, Icon, ClassHelper } from "@/components/lib";
// TODO: Fix import
import Style from "./hover.module.scss";

export function HoverNav(props) {
  // state
  const [open, setOpen] = useState(false);

  // style
  const css = ClassHelper(Style, {
    wrapper: true,
    dark: props.dark,
    [props.align]: true,
    className: props.className,
  });

  return (
    <div
      className={css}
      onMouseEnter={(e) => setOpen(true)}
      onMouseLeave={(e) => setOpen(false)}
    >
      {props.icon && (
        <Icon image={props.icon} size={15} className={Style.icon} />
      )}

      {props.label && <span className={Style.label}>{props.label}</span>}

      {open && props.children?.length && (
        <Animate type="slidedown" timeout={50}>
          <nav className={Style.nav}>{props.children}</nav>
        </Animate>
      )}
    </div>
  );
}
