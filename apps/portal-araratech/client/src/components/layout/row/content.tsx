import Style from "./content.tailwind";

export function Content({ children }) {
  return <div className={Style.content}>{children}</div>;
}
