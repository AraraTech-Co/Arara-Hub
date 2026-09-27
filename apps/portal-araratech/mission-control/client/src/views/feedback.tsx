import React from 'react';
/***
*
*   FEEDBACK
*   View user feedback for your application
*
**********/


import { Fragment, useContext, useState } from 'react';
import { ViewContext, Card, Table, Grid, Stat, Loader, useAPI } from 'components/lib';

export function Feedback(props){

  // context & state
  const context = useContext(ViewContext);
  const [reload, setReload] = useState<any>(0); // TODO: Type this // TODO: Type this
  const feedback = useAPI('/api/feedback');

  if (feedback.loading)
    return <Loader />

  if (!feedback.data)
    return false;

  function deleteFeedback(data, callback){

    context.modal.show({

      title: 'Delete Feedback Item',
      form: {},
      buttonText: 'Delete ',
      text: 'Are you sure you want to delete this piece of feedback?',
      url: `/api/feedback/${data.id}`,
      method: 'DELETE',
      destructive: true,

    }, (res) => {

      setReload(reload+1);
      callback();

    });
  }
  
  return (
    <Fragment>

      <Stats reload={ reload } /> 

      <Card>
        <Table 
          show={['rating', 'comment']}
          data={ feedback?.data }
          actions={{ 
            
            delete: deleteFeedback,
            email: true 
          
          }}
       />
      </Card>

    </Fragment>
  )
}

function Stats(props){

  const stats = useAPI(`/api/feedback/metrics?reload=${props.reload}`);

  return (
    <Grid cols='3'>

      <Stat 
        value={ stats?.data?.positive || 0 } 
        icon={ 'smile' }
        label={ 'positive' }
      />
      <Stat 
        value={ stats?.data?.neutral || 0 } 
        icon={ 'meh' }
        label={ 'neutral' }
      />
      <Stat 
        value={ stats?.data?.negative || 0 } 
        icon={ 'frown' }
        label={ 'negative' }
      />

    </Grid>
  )
}