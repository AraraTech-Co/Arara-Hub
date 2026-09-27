import React from 'react';
import { useState } from 'react';
import { Label, Error, Icon, ClassHelper } from 'components/lib';
import Style from './input.tailwind';

export function NumberInput(props){

  const [error, setError] = useState<any>(props.errorMessage || 'Please enter a number'); // TODO: Type this // TODO: Type this

  function validate(e){

    const min = props.min;
    const max = props.max;
    let value = e ? e.target.value : '';
    let valid = undefined;

    // input is required and value is blank
    if (props.required && value === '')
      valid = false;

    // input isn't required and value is blank
    if (!props.required && value)
      valid = true;

    // now test for a valid number
    if (isNaN(value)){

      valid = false;
      setError('Please enter a valid number');

    }

    // // check for min max
    if (min && max){
      if (value >= min && value <= max){
        valid = true;
      }
      else {
        valid = false;
        setError('Please enter a number between ' + min + ' and ' + max);
      }
    }
    else if (min){
      if (value >= min){
        valid = true;
      }
      else {
        valid = false;
        setError('Please enter a number equal to or above ' + min);
      }
    }
    else if (max){
      if (value <= max){
        valid = true;
      }
      else {
        valid = false;
        setError('Please enter a number equal to or below ' + max);
      }
    }
    else {

      valid = true;

    }

    // update the parent form
    props.onChange?.(props.name, value, valid);

  }

  // style
  const numberStyle = ClassHelper(Style, {

    textbox: true, 
    className: props.className, 
    error: props.valid === false,
    success: props.valid === true,
    warning: props.warning,

  });

  return(
    <div className={ Style.input }>

      { props.label && 
        <Label
          text={ props.label }
          required={ props.required }
          for={ props.name }
        /> }

      <input
        type='number'
        id={ props.name }
        name={ props.name }
        className={ numberStyle }
        value={ props.value || '' }
        min={ props.min }
        max={ props.max }
        placeholder={ props.placeholder }
        onChange={ e => props.onChange?.(props.name, e.target.value, undefined) }
        onBlur={ e => validate(e) }
      />

      { props.valid === false &&
        <Error message={ error }/> }

      { props.valid === true &&
        <Icon
          image='check'
          color='#8CC57D'
          className={ Style.successIcon }
          size={ 16 }
        />}

    </div>
  );
}
