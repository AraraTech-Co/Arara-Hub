import React from "react";

type HiddenInputProps = {
  name: string;
  value?: string;
}

export function HiddenInput(props: HiddenInputProps) {
  return (
    <input
      type="hidden"
      id={props.name}
      name={props.name}
      value={props.value || ""}
    />
  );
}
