import { FC, ReactNode } from "react";
import Style from "./header.module.scss";

interface HeaderProps {
  title: string;
  children?: ReactNode;
}

export const Header: FC<HeaderProps> = ({ title, children }) => {
  return (
    <header className={Style.header}>
      <h1>{title}</h1>
      {children}
    </header>
  );
};