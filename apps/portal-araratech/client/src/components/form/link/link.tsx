import { Link } from "@/components/lib";
import Style from "./link.tailwind";

export interface FormLinkProps {
  url: string;
  text: string;
}

export function FormLink(props: FormLinkProps) {
  return <Link url={props.url} text={props.text} className={Style.link} />;
};
