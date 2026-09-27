/***
 *
 *   BREADCRUMBS
 *   Navigation trail for nested pages.
 *
 *   PROPS
 *   items: array of objects containing keys: name and url
 *
 **********/

import { Link } from "@/components/lib";
import Style from "./breadcrumbs.tailwind";

export function Breadcrumbs(props) {
  return (
    <nav className={Style.breadcrumbs}>
      {props.items?.map((item) => {
        return (
          <Link
            className={Style.link}
            key={item.name}
            url={item.url}
            text={item.name}
          />
        );
      })}
    </nav>
  );
}
