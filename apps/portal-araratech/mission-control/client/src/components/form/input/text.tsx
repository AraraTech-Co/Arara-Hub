import React from 'react';
import { Label, Error, Icon, ClassHelper } from 'components/lib';
import Style from './input.tailwind';

export function TextInput(props){

  const error = props.errorMessage || 'Please enter a value';

  function validate(e){

    let value = e ? e.target.value : '';
    let valid = undefined;

    // input is required and value is blank
    if (props.required && value === '')
      valid = false;

    // input isn't required and value is blank
    if (!props.required && value === '')
      valid = true;

    if (props.required && value !== '')
      valid = true;

    // update the parent form
    props.onChange?.(props.name, value, valid);

  }

  // style
  const textStyle = ClassHelper(Style, {

    textbox: true, 
    className: props.className, 
    error: props.valid === false,
    success: props.valid === true,
    warning: props.warning

  });

  return(
    <div className={ Style.input }>

      { props.label && 
        <Label
          text={ props.label }
          required={ props.required }
          for={ props.name }
        /> }

      { props.type === 'textarea' ?

        <textarea
          id={ props.id }
          name={ props.name }
          value={ props.value }
          className={ textStyle }
          placeholder={ props.placeholder }
          onChange={ e => props.onChange?.(props.name, e.target.value, undefined) }
          onBlur={ e => validate(e) }
        >
        </textarea>

        :

        <input
          type='text'
          id={ props.id }
          name={ props.name }
          value={ props.value || '' }
          className={ textStyle }
          placeholder={ props.placeholder }
          onChange={ e => props.onChange?.(props.name, e.target.value, undefined) }
          onBlur={ e => validate(e) }
        />
      }

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
