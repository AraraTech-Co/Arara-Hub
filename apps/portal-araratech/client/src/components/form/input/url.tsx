import { useState } from "react";
import { Label, Error, Icon, ClassHelper } from "@/components/lib";
import Style from "./input.tailwind";

type URLInputProps = {
  label?: string;
  type?: string;
  name?: string;
  value?: string;
  placeholder?: string;
  errorMessage?: string;
  required?: boolean;
  valid?: boolean;
  warning?: boolean;
  onChange?: Function;
  className?: string;
  id?: string;
};

export function URLInput(props: URLInputProps) {
  const [error, setError] = useState(
    props.errorMessage || "Please enter a URL",
  );

  function validate(e) {
    let value = e ? e.target.value : "";
    let valid = undefined;

    // input is required and value is blank
    if (props.required && value === "") valid = false;

    // input isn't required and value is blank
    if (!props.required && value === "") valid = true;

    // test for a valid url
    const rex =
      /^((https?|ftp|smtp):\/\/)?(www.)?[a-z0-9-]+(\.[a-z-]{2,}){1,3}(#?\/?[a-zA-Z0-9#]+)*\/?(\?[a-zA-Z0-9-_]+=[a-zA-Z0-9-%]+&?)?$/;

    if (rex.test(value)) {
      valid = true;
    } else {
      valid = false;
      setError("Please enter a valid URL");
    }

    // update the parent form
    props.onChange(props.name, value, valid);
  }

  // style
  const urlStyle = ClassHelper(Style, {
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
        type="url"
        id={props.id}
        name={props.name}
        className={urlStyle}
        value={props.value || ""}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(props.name, e.target.value, undefined)}
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
