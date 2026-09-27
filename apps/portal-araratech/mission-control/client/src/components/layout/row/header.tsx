import { Fragment } from "react";
import { ClassHelper } from "components/lib";
import Style from "./header.tailwind";

export function RowHeader(props) {
  const showHeader = props.title ? true : false;
  const dark = props.color === "dark";
  const brand = props.color === "brand";

  const textStyle = ClassHelper(Style, {
    title: props.mainTitle,
    subtitle: !props.mainTitle,
    brand: brand,
    dark: dark,
    light: !brand && !dark,
  });

  return (
    <Fragment>
      {showHeader && (
        <header className={Style.header}>
          {props.mainTitle ? (
            <h1 className={textStyle}>{props.mainTitle}</h1>
          ) : (
            <h2 className={textStyle}>{props.title}</h2>
          )}

          {props.desc && <p className={Style.desc}>{props.desc}</p>}
        </header>
      )}
    </Fragment>
  );
}
