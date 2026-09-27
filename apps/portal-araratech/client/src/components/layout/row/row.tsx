/***
 *
 *   ROW
 *   Renders a new landing page row
 *
 *   PROPS
 *   align: left/right/center
 *   color: dark/tint/brand
 *
 **********/

import { ClassHelper } from "@/components/lib";
import { RowHeader } from "./header";
import { Content } from "./content";
import Style from "./row.tailwind";

export function Row(props) {
  const css = ClassHelper(Style, {
    [props.color]: props.color,
    center: props.align === "center",
    left: props.align === "left",
  });

  if (props.header) {
    return (
      <header className={css}>
        <Content>{props.children}</Content>
      </header>
    );
  }

  return (
    <section className={css}>
      <Content>
        <RowHeader
          title={props.title}
          desc={props.desc}
          color={props.color}
          mainTitle={props.mainTitle}
        />

        {props.children}
      </Content>
    </section>
  );
}
