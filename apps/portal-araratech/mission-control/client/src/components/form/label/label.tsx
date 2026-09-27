import { ClassHelper } from 'components/lib';
import Style from './label.tailwind';

export function Label(props){

  const labelStyle = ClassHelper(Style, props);

  return(
    <label className={ labelStyle } htmlFor={ props.for }>
      { props.text }
    </label>
  );
}