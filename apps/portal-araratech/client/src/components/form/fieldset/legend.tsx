import { ClassHelper } from "@/components/lib";
import Style from "./legend.tailwind";

type LegendProps = {
  text: string;
  required?: boolean;
  valid?: boolean;
  className?: string;
}

export function Legend(props: LegendProps) {
  const css = ClassHelper(Style, {
    className: props.className,
    required: props.required,
    error: !props.valid,
  });

  return <legend className={css}>{props.text}</legend>;
}
