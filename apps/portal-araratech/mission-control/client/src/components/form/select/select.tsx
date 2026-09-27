import React from 'react';
import { Label, Error, ClassHelper } from 'components/lib';
import Style from './select.tailwind';

export function Select(props){

  let options = props.options;
  const error = props.errorMessage || 'Please select an option';

  // set the default
  if (!props.default && options?.length){

    // if theres no default, show a please select option
    if (options && options[0]?.value === 'unselected') options.shift(0);
    options.unshift({ value: 'unselected', label: 'Please select an option' });

  }

  function change(e){

    let value = e ? e.target?.value : 'unselected';
    let valid = undefined;

    // validate
    valid = props.required && value === 'unselected' ? false : true;
    props.onChange(props.name, value, valid);
    props.callback && props.callback(value)

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

  return(
    <div className={ Style.input }>

      <Label
        text={ props.label }
        required={ props.required }
        for={ props.name }
      />

      <div className={ wrapperStyle }>

        <select
          className={ selectStyle }
          defaultValue={ props.default }
          onChange={ e => change(e) }
          id={ props.name }>

          { options?.map(option => {
            return (
              <option
                key={ option.value }
                value={ option.value }>
                { option.label }
              </option>
            );
          })}

        </select>

        { props.valid === false && <Error message={ error } className={ Style.message }/> }

      </div>
    </div>
  );
}