/***
 *
 *   PROGRESS BAR
 *   Percentage based progress bar with animated fill
 *
 *   PROPS
 *   label: text label (optional)
 *   progress: percentage value: eg. 75%
 *
 **********/

import { ClassHelper } from "@/components/lib";
import Style from "./bar.tailwind";

type ProgressBarProps = {
  label?: string;
  progress: string;
  className?: string;
}

export function ProgressBar(props: ProgressBarProps) {
  const barStyle = ClassHelper(Style, {
    bar: true,
    className: props.className,
  });

  return (
    <section>
      {props.label && <div className={Style.label}>{props.label}</div>}

      <div className={barStyle}>
        <div className={Style.fill} style={{ width: props.progress }}></div>
      </div>
    </section>
  );
}
