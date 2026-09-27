/***
 *
 *   PROGRESS STEPS
 *   Steps are used to indicate the current point in a
 *   multi-stage process, such as filling in a long form
 *
 *   PROPS
 *   items: array of objects containing keys: name, url
 *   and completed (bool)
 *
 **********/

import { Link } from "@/components/lib";
// TODO: Fix Module import
import Style from "./steps.module.scss";

type ProgressStepsProps = {
  items: {
    name: string;
    url: string;
    completed: boolean;
  };
}

export function ProgressSteps(props: ProgressStepsProps) {
  return (
    <ol className={Style.steps}>
      {props.items &&
        // TODO: Type "Item" accordingly
        Object.keys(props.items).map((item: any) => {
          item = props.items[item];

          return (
            <li
              key={item.name}
              className={item.completed ? Style.complete : undefined}
            >
              {item.url ? (
                <Link url={item.url} text={item.name} />
              ) : (
                <span>{item.name}</span>
              )}
            </li>
          );
        })}
    </ol>
  );
}
