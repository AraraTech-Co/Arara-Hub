import { ClassHelper } from "@/components/lib";
import Style from "./row.tailwind";

type TitleRowProps = {
  title?: string;
  className?: string;
  children?: React.ReactNode;
};

export function TitleRow(props: TitleRowProps) {
  const titleRowStyle = ClassHelper(Style, {
    row: true,
    className: props.className,
  });

  return (
    <section className={titleRowStyle}>
      {props.title && <h2 className={Style.title}>{props.title}</h2>}

      <div className={Style.actions}>{props.children}</div>
    </section>
  );
}
