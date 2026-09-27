/***
 *
 *   GRID
 *   Responsive one-to-six column grid layout
 *
 *   PROPS
 *   cols: number of columns (default: 2, max: 6)
 *
 **********/

import { ClassHelper } from "@/components/lib";
import Style from "./grid.module.scss";

export interface GridProps {
  cols?: string | number;
  children: React.ReactNode;
}

export function Grid({ cols, children }: GridProps) {
  const colNames = ["one", "two", "three", "four", "five", "six"] as const;
  const numberOfColumns = parseInt(String(cols));

  const css = ClassHelper(
    Style,
    cols
      ? colNames.slice(0, numberOfColumns).reduce((acc, name) => {
          acc[name] = true;
          return acc;
        }, { grid: true })
      : { grid: true }
  );

  return (
    <section className={css}>
      {Array.isArray(children) ? (
        children.map((child, index) => <>{child}</>)
      ) : (
        <>{children}</>
      )}
    </section>
  );
}

