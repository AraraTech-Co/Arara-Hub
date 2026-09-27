
/***
 *
 *   CARD
 *   Universal container for grouping UI components together
 *
 *   PROPS
 *   title: title string (optional)
 *   loading: boolean to toggle the loading animation (optional)
 *   shadow: apply a box shadow
 *   center: center align the card
 *   noPadding: remove the padding
 *   restrictWidth: restrict the width of the card on large screens
 *
 **********/

import { Loader, ClassHelper } from "@/components/lib";
import Style from "./card.tailwind";

type CardProps = {
  title?: string;
  loading?: any;
  shadow?: boolean;
  center?: boolean;
  noPadding?: boolean;
  restrictWidth?: boolean;
  last?: boolean;
  className?: string;
  children?: React.ReactNode;
  rounded?: boolean;
}

export function Card(props: CardProps) {
  const cardStyle = ClassHelper(Style, {
    shadow: props.shadow,
    center: props.center,
    noPadding: props.noPadding,
    loading: props.loading,
    className: props.className,
    last: props.last,
    restrictWidth: props.restrictWidth,
  });

  return (
    <section className={cardStyle}>
      {props.title && (
        <header className={Style.header}>
          <h1 className={Style.title}>{props.title}</h1>
        </header>
      )}

      {props.loading ? <Loader /> : props.children}
    </section>
  );
}
