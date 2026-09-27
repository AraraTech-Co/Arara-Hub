import { useState } from "react";
import {
  Grid,
  Radio,
  Checkbox,
  Error,
  Legend,
  ClassHelper,
} from "@/components/lib";
import Style from "./fieldset.tailwind";

type FieldsetProps = {
  type: "radio" | "checkbox";
  name: string;
  label: string;
  options: string[];
  default?: string | string[];
  errorMessage?: string;
  valid?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  onChange: (name: string, option: any, valid: boolean) => void;
  className?: string;
};

export function Fieldset(props: FieldsetProps) {
  // init
  const Input = props.type === "radio" ? Radio : Checkbox;
  let init = new Array(props.options.length).fill(false);
  const valid = props.valid === false ? false : true;

  // default
  if (props.type === "radio") {
    if (!Array.isArray(props.default)) {
      const defaultIndex = props.options.indexOf(
        props.default ? props.default : "0",
      );
      init[defaultIndex] = true;
    }
  } else if (props.type === "checkbox") {
    if (Array.isArray(props.default)) {
      props.default.forEach((opt) => {
        init[props.options.indexOf(opt)] = true;
      });
    }
  }

  // state
  const [checked, setChecked] = useState([...init]);
  const [error, setError] = useState(
    props.errorMessage ? props.errorMessage : "Please select an option",
  );

  if (!props.options?.length) return false;

  function change(index, state, option) {
    // update state
    let data = [...checked];

    // reset radios on select
    if (props.type === "radio")
      data = new Array(props.options.length).fill(false);

    // toggle the checked state
    data[index] = !checked[index];

    // update & validate
    setChecked(data);
    validate(data, option);
  }

  function validate(data, option) {
    let options = [];
    let errorMessage;
    let valid = undefined;
    let count = data.filter(Boolean).length;

    // validate radio
    if (props.type === "radio") {
      valid = props.required ? count : true;
      props.onChange(props.name, option, valid);
      return false;
    }

    // validate checkbox
    if (props.type === "checkbox") {
      if (props.min && !props.max) {
        // check for min value
        if (count >= props.min) {
          valid = true;
        } else {
          valid = false;
          errorMessage = `Please select at least ${props.min} option`;
          if (props.min > 1) errorMessage += "s";
          setError(errorMessage);
        }
      } else if (!props.min && props.max) {
        // check for max value
        if (count <= props.max) {
          valid = true;
        } else {
          valid = false;
          errorMessage = `Please select a maximum of ${props.max} option`;
          if (props.max > 1) errorMessage += "s";
          setError(errorMessage);
        }
      } else if (props.min && props.max) {
        // check for min and max value
        if (count >= props.min && count <= props.max) {
          valid = true;
        } else {
          valid = false;
          setError(
            `Please choose between ${props.min} and ${props.max} options`,
          );
        }
      } else if (props.required) {
        valid = count ? true : false;
      }
    }

    data.forEach((opt, index) => {
      if (opt) options.push(props.options[index]);
    });

    // update the parent form state
    props.onChange(props.name, options, valid);
  }

  // style
  const fieldsetStyle = ClassHelper(Style, {
    error: valid === false,
    className: props.className,
  });

  return (
    <fieldset className={fieldsetStyle}>
      <Legend valid={valid} text={props.label} required={props.required} />

      <Grid cols="3">
        {props.options.map((option, index) => {
          return (
            <Input
              key={index}
              name={props.name}
              index={index}
              option={option}
              checked={checked[index]}
              callback={change}
            />
          );
        })}
      </Grid>

      {!valid && <Error message={error} className={Style.errorMessage} />}
    </fieldset>
  );
}
