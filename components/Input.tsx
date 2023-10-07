import React, { useState } from "react";

type UI = JSX.Element | null;

export const ADA = "₳";

interface InputProps {
  id: string;
  value: string;
  onInput: (s: string) => void;
  error: string;
  disabled: boolean;
}

function renderInput(props: InputProps): UI {
  return (
    <div className="input-wrapper">
      <input id={props.id} value={props.value} disabled={props.disabled} />
      {props.error !== "" ? <p className="input-error">{props.error}</p> : null}
    </div>
  );
}

interface SelectProps {
  id: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: () => void;
}

function renderSelect({ id, value, options, onChange }: SelectProps): UI {
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      disabled={options.length === 1 && options[0].value === value}
    >
      {options.map((optionValue) => (
        <option key={optionValue.value} value={optionValue.value}>
          {optionValue.label}
        </option>
      ))}
    </select>
  );
}

// More class components like AdaInput, AssetInput, AddressInput can go here, just like the original file
// Use similar conversion to the above functional components
