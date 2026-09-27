import { useState } from "react";
import { Label, Error, Icon, ClassHelper } from "@/components/lib";
import Style from "./input.tailwind";

type PasswordInputProps = {
  label?: string;
  type?: string;
  name?: string;
  value?: string;
  placeholder?: string;
  onChange?: (name: string, value: string, valid: boolean) => void;
  required?: boolean;
  errorMessage?: string;
  valid?: boolean;
  warning?: boolean;
  className?: string;
  complexPassword?: boolean;
  for?: string;
};

export function PasswordInput(props: PasswordInputProps) {
  const [error, setError] = useState(
    props.errorMessage || "Please enter a password",
  );

  function validate(e) {
    let value = e ? e.target.value : "";
    let valid = undefined;

    // input is required and value is blank
    if (props.required && value === "") valid = false;

    // input isn't required and value is blank
    if (!props.required && value === "") valid = true;

    if (props.required && value !== "") valid = true;

    if (!props.required) valid = true;

    // complexity rules
    if (props.complexPassword) {
      if (value.length < 8) {
        valid = false;
        setError("Password must be a minimum of 8 characters");
      } else if (!/[A-Z]/.test(value)) {
        valid = false;
        setError("Password must have at least one upper case letter");
      } else if (!/[a-z]/.test(value)) {
        valid = false;
        setError("Password must have at least one lower case letter");
      }
    }

    // update the parent form
    props.onChange?.(props.name, value, valid);
  }

  const passwordStyle = ClassHelper(Style, {
    textbox: true,
    className: props.className,
    error: props.valid === false,
    success: props.valid === true,
    warning: props.warning,
  });

  return (
    <div className={Style.input}>
      {props.label && (
        <Label text={props.label} required={props.required} for={props.name} />
      )}

      <input
        type="password"
        id={props.for}
        name={props.name}
        className={passwordStyle}
        onChange={(e) =>
          props.onChange?.(props.name, e.target.value, undefined)
        }
        onBlur={(e) => validate(e)}
      />

      {props.valid === false && <Error message={error} />}

      {props.valid === true && (
        <Icon
          image="check"
          color="#8CC57D"
          className={Style.successIcon}
          size={16}
        />
      )}
    </div>
  );
}
