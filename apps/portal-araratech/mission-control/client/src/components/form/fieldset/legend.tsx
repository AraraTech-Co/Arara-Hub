import { ClassHelper } from 'components/lib';
import Style from './legend.tailwind';

export function Legend(props){

  const css = ClassHelper(Style, { 

    className: props.className,
    required: props.required,
    error: !props.valid

  });

  return(
    <legend className={ css }>
      { props.text }
    </legend>
  );
}
