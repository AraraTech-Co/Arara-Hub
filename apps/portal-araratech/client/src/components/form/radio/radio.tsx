import { Label } from "@/components/lib";
import Style from "./radio.tailwind";

type RadioProps = {
  name: string;
  option: { value: string; label: string } | string;
  checked?: boolean;
  required?: boolean;
  index: number;
  callback: (index: number, checked: boolean, option: string) => void;
};

export function Radio(props: RadioProps) {
  const option = typeof props.option === "string" ? props.option : props.option.value;
  const label = typeof props.option === "string" ? props.option : props.option.label;

  return (
    <div className={Style.radio}>
      <input
        type="radio"
        name={props.name}
        id={option}
        value={option}
        className={Style.input}
        checked={!!props.checked}
        onChange={(e) => props.callback(props.index, props.checked, option)}
      />

      <Label
        text={label}
        required={props.required}
        for={option}
        className={Style.label}
      />
    </div>
  );
}
