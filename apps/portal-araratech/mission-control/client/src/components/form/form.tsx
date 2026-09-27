import React from 'react';
/***
*
*   FORM
*   Self-validating form that accepts an object for construction
*   Read the full documentation on object formatting
*   https://docs.Sample.app/ui/form
*
*   PROPS
*   inputs: the object containing your form inputs
*   callback: function to be executed on successful submit
*   url: url to send the form to (optional)
*   method: HTTP request type
*   redirect: url to redirect to after a successful submit (optional)
*   buttonText: submit button text
*   cancel: true/false to toggle a cancel button (optional)
*
**********/

import { useState, useEffect, useContext } from 'react';
import Axios from 'axios';

import { FormHeader, TextInput, NumberInput, EmailInput, URLInput,
  PhoneInput, DateInput, PasswordInput, HiddenInput, Select, FormLink,
  Switch, FileInput, Fieldset, Button, ViewContext, useNavigate, ClassHelper } from 'components/lib'

import Style from './form.tailwind';

export function Form(props){

  // context & state
  const context = useContext(ViewContext);
  const [form, setForm] = useState<any>(null); // TODO: Type this // TODO: Type this
  const [loading, setLoading] = useState<any>(false); // TODO: Type this // TODO: Type this
  const [fileStore, setFileStore] = useState<any>([]); // TODO: Type this // TODO: Type this
  const [processCreditCard, setProcessCreditCard] = useState<any>(false); // TODO: Type this // TODO: Type this
  const navigate = useNavigate();
  let valid = true;

  // inputs map
  const Inputs = {

    text: TextInput,
    textarea: TextInput,
    email: EmailInput,
    number: NumberInput,
    url: URLInput,
    date: DateInput,
    hidden: HiddenInput,
    phone: PhoneInput,
    password: PasswordInput,
    radio: Fieldset,
    select: Select,
    checkbox: Fieldset,
    selector: Fieldset,
    switch: Switch,
    header: FormHeader,
    link: FormLink,
    file: FileInput,

  }

  useEffect(() => {

    // if the form is valid and using
    // live updates, refresh the form
    if (valid && props.updateOnChange){

      setForm(props.inputs);

    }

    // otherwise, only init if no form set
    else if (!form){

      let data = {...props.inputs };

      // init credit card
      if (data?.token){

        data?.plan?.default === 'free' ?
        setProcessCreditCard(false) :
        setProcessCreditCard(true);

      }

       setForm(data);
    }
  }, [props, form, valid]);

  if (!form)
    return false;

  function update(input, value, valid){

    let data = {...form }

     // is it a file?
     if (value.length && value[0].name && value[0].type && value[0].size){

    if (!fileStore[input]?.length)
      fileStore[input] = [];

     const newFiles = {...fileStore }
     value.forEach(file => {

        // add or delete the file
        if (file.data && !fileStore[input].find(x => x.name === file.name)){

          newFiles[input].push(file);


        }
        else if (!file.data) {

          newFiles[input].splice(newFiles[input].findIndex(x => x.name === file.name), 1);

        }
      })

      data[input].value = newFiles[input];
      data[input].valid = valid;
      setFileStore(newFiles);

    }
    else {

      // update input value & valid state
      data[input].value = value;
      data[input].valid = valid;

      // hide credit card input when selecting free plan
      if (props.inputs.token){
        if (input === 'plan' && value === 'free'){

          setProcessCreditCard(false)

        }
        else if (input === 'plan' && value !== 'free') {

          setProcessCreditCard(true)

        }
      }
    }

    setForm(data);
    
    props.updateOnChange &&
    props.onChange({ input: input, value: value, valid: valid });

    props.submitOnChange && submit();

  }

  function validate(){

    // loop over each input and check it's valid
    // show error if input is required and value is
    // blank, input validation will be executed on blur

    let errors = [];
    let data = {...form };

    // loop the inputs
    for (let input in data){

      // standard input
      let inp = data[input];
      if (inp.value === undefined && inp.default){

        data[input].value = inp.default;

      }

      if (inp.required){
        if (!inp.value || inp.value === 'unselected'){

          inp.valid = false;
          errors.push(false);

        }
      }

      if (inp.valid === false){

        errors.push(false);

      }
    }

    if (errors.length){

      // form isn't valid
      valid = false;
      setForm(data);
      return false;

    }
    else {

      // form is valid
      return true;

    }
  }

  async function submit(){

    // submit the form
    setLoading(true);
    let data = {...form };

    // is the form valid?
    if (!validate()){

      setLoading(false);
      return false;

    }
      
    // optimise data for server
    for (let input in form){
      if (input !== 'header'){

        // process single input & ignore headers
        data[input] = form[input].value;

      }
    }

    delete data.header;

    // submit the form or execute callback
    if (!props.url){

      if (props.callback)
        props.callback(null);

      return false;

    }

    try {

      let formData = new FormData(), headers = {};
      if (Object.keys(fileStore).length){

        headers['Content-Type'] = 'multipart/form-data';
        headers['Accept'] = 'application/json';

        for (let key in data){

          // append files
          if (Array.isArray(data[key]) && data[key][0].hasOwnProperty('data')){
            for (let i = 0; i < data[key].length; i++){

              formData.append(key, data[key][i].data);
            
            }
          }
          else {

            // append text values
            formData.append(key, data[key]);

          }
        }

        data = formData;

      }

      let res = await Axios({

        method: props.method,
        url: props.url,
        data: data

      });

      // finish loading
      setLoading(false);

      // close the modal
      context.modal.hide(false, res.data.data);

      // callback?
      if (props.callback)
        props.callback(res);

      // redirect?
      if (props.redirect)
        navigate(props.redirect);

      // success notification
      if (res.data.message)
        context.notification.show(res.data.message, 'success', true);

    }
    catch (err){

      // handle error
      setLoading(false);
      context.modal.hide(true);

      // show error on input
      if (err.response?.data?.inputError){

        let data = {...form }
        const input = err.response.data.inputError;
        data[input].valid = false;
        data[input].errorMessage = err.response.data.message;
        valid = false;
        setForm(data);
        return false;

      }
      else {

        // general errors handled by view
        context.handleError(err);

      }
    }
  }

  let inputsToRender = [];
  const formStyle = ClassHelper(Style, {...props, ...{
    
    loading: props.loading || loading

  }});

  // map the inputs
  Object.keys(form).map(name => {

    // get the values for this input
    const data = form[name];
    data.name = name;
    inputsToRender.push(data);
    return inputsToRender;

  });

  // render the form
  return(

    <form
      action={ props.action }
      method = { props.method }
      onSubmit={ submit }
      className={ formStyle }
      encType={ fileStore.length && 'multipart/form-data' }
      noValidate>

      { inputsToRender.map(input => {

        if (input.type === null)
          return false;

        if (!input.type)
          input.type = 'text';

        if (input.type === 'creditcard' && !processCreditCard)
          return false;

        const Input = Inputs[input.type];

        return (
          <Input
           key={ input.name }
           type={ input.type }
           form={ props.name }
           label={ input.label }
           className={ input.class }
           name={ input.name }
           value={ input.value }
           required={ input.required }
           valid={ input.valid }
           min={ input.min }
           max={ input.max }
           options={ input.options }
           default={ input.default }
           url={ input.url }
           text={ input.text }
           title={ input.title }
           accept={ input.accept }
           description={ input.description }
           readonly={ input.readonly }
           maxFileSize={ input.maxFileSize }
           handleLabel={ input.handleLabel }
           placeholder={ input.placeholder }
           errorMessage={ input.errorMessage }
           onChange={ update }
           complexPassword={ input.complexPassword }
          />
        );
      })}

      { props.buttonText &&
        <Button
          color={ props.destructive ? 'red' : 'green' }
          loading={ loading }
          text={ props.buttonText }
          action={ submit }
          className={ Style.button }
          fullWidth={ !props.cancel }
        />
      }

      { props.cancel &&
        <Button 
          color={ props.destructive ? 'green' : 'red' } 
          outline 
          text='Cancel' 
          className={ Style.button }
          action={ props.cancel } 
        />
      }
    </form>
  );
}