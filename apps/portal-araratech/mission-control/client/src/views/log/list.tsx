import React from 'react';
/***
*
*   LOG/LIST
*   List the application logs (paginated)
*
**********/

import { Fragment, useState, useEffect, useContext } from 'react';
import { ViewContext, Card, Table, Search, Paginate, useAPI } from 'components/lib';

export function Logs(props){

  // context
  const context = useContext(ViewContext);

  // state 
  const [search, setSearch] = useState<any>(''); // TODO: Type this // TODO: Type this
  const [offset, setOffset] = useState<any>(0); // TODO: Type this // TODO: Type this
  const [logs, setLogs] = useState<any>(null); // TODO: Type this // TODO: Type this
  const [loading, setLoading] = useState<any>(false); // TODO: Type this // TODO: Type this

  // show 25 results at a time
  const limit = 25;

  function deleteLog(data, callback){
    
    context.modal.show({
      title: 'Delete Log',
      form: {},
      buttonText: 'Delete Log',
      text: 'Are you sure you want to delete this log?',
      url: `/api/log/${data.id}`,
      method: 'DELETE',
      destructive: true,

    }, () => {

      context.notification.show('Log deleted', 'success', true);
      callback();

    });
  }

  return (
    <Fragment>

      <Search throttle={ 1000 } callback={ x => setSearch(x) }/><br/>

      <Paginate 
        offset={ offset } 
        limit={ limit } 
        total={ logs?.total }
        loading={ loading }
        onChange={ x => setOffset(x) }
      />

      <FetchLogs 
        search={ search }
        offset={ offset }
        limit={ limit }
        setLoading={ x => setLoading(x) }
        setData={ x => setLogs(x) }
      /> 

      <Card>
        <Table  
          loading={ loading }
          data={ logs?.results }
          show={['time', 'message', 'email', 'method', 'endpoint']}
          actions={{

            delete: deleteLog,
            email: true,
            view: { url: '/logs', col: 'id' }

          }}
        />
      </Card>
   </Fragment>
  )
}

function FetchLogs(props){

  const logs = useAPI(`/api/log?search=${props.search}&offset=${props.offset}&limit=${props.limit}`);

  useEffect(() => {

    props.setLoading(logs.loading);
   
    if (logs.data)
      props.setData(logs.data);

  }, [logs, props])

  return false;

}