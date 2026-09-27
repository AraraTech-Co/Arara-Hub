import React from 'react';
/***
*
*   STAT
*   Statistic value with optional icon and -/+ change value
*
*   PROPS
*   value:  numeric value
*   label: string
*   loading: boolean to toggle loading animation (optional)
*   icon: icon to use (optional)
*   change: positive/negative number indicating change amount (optional)
*
**********/

import { Card, Icon, Loader, ClassHelper } from 'components/lib';
import Style from './stat.tailwind';

export function Stat(props){

  const changeUp = props.change?.toString().includes('-') ? false : true;

  // is loading
  if (props.loading || props.value === undefined){
    return (
      <Card>
        <div className={ Style.stat }>
          <Loader />
        </div>
      </Card>
    );
  }

  const statStyle = ClassHelper(Style, {

    stat: true, 
    className: props.className

  })

  return(
    <Card>
      <div className={ statStyle }>

        { props.icon &&
          <Icon
            color='dark'
            image={ props.icon }
            size={ 20 }
            className={ Style.icon }
          />
        }

        <div className={ Style.value }>{ props.value }</div>
        <div className={ Style.label }>{ props.label }</div>

        { props.change &&
          <div className={ Style.change }>

            { props.change }

            <Icon   
              color={ changeUp ? 'green' : 'red' }
              image={ changeUp ? 'arrow-up' : 'arrow-down' } 
              className={ Style.changeIcon }
            />

          </div>
        }
      </div>
    </Card>
  );
}