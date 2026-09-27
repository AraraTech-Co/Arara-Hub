import { useState } from "react";
import { Label, Error, Icon, ClassHelper } from "@/components/lib";
import Style from "./input.tailwind";

type PhoneInputProps = {
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
  for?: string;
};

export function PhoneInput(props: PhoneInputProps) {
  const [error, setError] = useState(
    props.errorMessage || "Please provide a phone number",
  );

  function validate(e) {
    let value = e ? e.target.value : "";
    let valid = undefined;

    // input is required and value is blank
    if (props.required && value === "") valid = false;

    // input isn't required and value is blank
    if (!props.required && value === "") valid = true;

    // now test for a valid phone number
    const rex = /^(?=.*[0-9])[- +()0-9]+$/;

    if (rex.test(value)) {
      valid = true;
    } else {
      valid = false;
      setError("Please enter a valid phone number");
    }

    // update the parent form
    props.onChange?.(props.name, value, valid);
  }

  // style
  const phoneStyle = ClassHelper(Style, {
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
        type="phone"
        id={props.for}
        name={props.name}
        className={phoneStyle}
        value={props.value || ""}
        placeholder={props.placeholder}
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
