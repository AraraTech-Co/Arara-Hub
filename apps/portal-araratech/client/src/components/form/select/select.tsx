import { Label, Error, ClassHelper } from "@/components/lib";
import Style from "./select.tailwind";

type SelectProps = {
  options: { value: string; label: string }[];
  errorMessage?: string;
  default?: string;
  name: string;
  required?: boolean;
  onChange: (name: string, value: string, valid: boolean) => void;
  callback?: (value: string) => void;
  className?: string;
  valid?: boolean;
  warning?: boolean;
  label?: string;
};

export function Select(props: SelectProps) {
  let options = props.options;
  const error = props.errorMessage || "Please select an option";

  if (!props.default && options?.length) {
    if (options && options[0]?.value === "unselected") options.shift();
    options.unshift({ value: "unselected", label: "Please select an option" });
  }

  function change(e: React.ChangeEvent<HTMLSelectElement>) {
    let value = e.target.value || "unselected";
    let valid = props.required && value === "unselected" ? false : true;
    props.onChange(props.name, value, valid);
    props.callback && props.callback(value);
  }

  const wrapperStyle = ClassHelper(Style, {
    className: props.className,
    success: props.valid === true,
    errorWrapper: props.valid === false,
    warningWrapper: props.warning,
  });

  const selectStyle = ClassHelper(Style, {
    select: true,
    error: props.valid === false,
    warning: props.warning,
  });

  return (
    <div className={Style.input}>
      <Label text={props.label} required={props.required} for={props.name} />

      <div className={wrapperStyle}>
        <select
          className={selectStyle}
          defaultValue={props.default}
          onChange={change}
          id={props.name}
        >
          {options?.map((option) => {
            return (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            );
          })}
        </select>

        {props.valid === false && (
          <Error message={error} className={Style.message} />
        )}
      </div>
    </div>
  );
}

