
/***
 *
 *   ARTICLE
 *   Wrapper component for rendering text-based articles
 *
 *   PROPS
 *   children: children to render
 *
 **********/

import { Content } from "@/components/lib";
import Style from "./article.module.scss";

// TODO: Type Props
export function Article(props) {
  window.scrollTo(0, 0);

  return (
    <article className={Style.article}>
      <Content>{props.children}</Content>
    </article>
  );
}
