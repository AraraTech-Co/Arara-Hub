import { FC } from "react";
import { ClassHelper } from "@/components/lib";
import Style from "./label.tailwind";

interface LabelProps {
  text: string;
  for?: string;
  required?: boolean;
  className?: string;
}

export const Label: FC<LabelProps> = ({ text, for: htmlFor, required, className }) => {
  const labelStyle = ClassHelper(Style, { required, className });

  return (
    <label className={labelStyle} htmlFor={htmlFor}>
      {text}
    </label>
  );
};
