import React from 'react';
/***
*
*   EVENT/LIST
*   List all the events in the group
*
**********/

import { useContext, useState, useEffect } from 'react';
import { ViewContext, Animate, Card, Chart, Table, Search, Breadcrumbs, Paginate, useAPI, useLocation } from 'components/lib';

export function Events(props){

  const location = useLocation();
  const path = location?.pathname.split('/');

  // context
  const context = useContext(ViewContext);
  const eventName = path[2];

  // state 
  const [search, setSearch] = useState<any>(''); // TODO: Type this // TODO: Type this
  const [offset, setOffset] = useState<any>(0); // TODO: Type this // TODO: Type this
  const [events, setEvents] = useState<any>(null); // TODO: Type this // TODO: Type this
  const [chart, setChart] = useState<any>(false); // TODO: Type this // TODO: Type this
  const [loading, setLoading] = useState<any>(false); // TODO: Type this // TODO: Type this

  // show 25 results at a time
  const limit = 25;

  function deleteEvent(data, callback){
    
    context.modal.show({
      title: 'Delete Event',
      form: {},
      buttonText: 'Delete Event',
      text: `Are you sure you want to delete the ${data.name} event?`,
      url: `/api/event/${data.id}`,
      method: 'DELETE',
      destructive: true,

    }, () => {

      context.notification.show('Event deleted', 'success', true);
      callback();

    });
  }
  
  return (
    <Animate>

      <Breadcrumbs items={[
        { name: 'groups', url: '/events' },
        { name: eventName, url: `/events/${eventName}` }
      ]}/>

      { chart && 
        <Card title={`${eventName} events by day`}>
          <Chart 
            type='line'
            data={ chart }
          />
        </Card>
      }

      <Search throttle={ 1000 } callback={ x => setSearch(x) } placeholder='Search by email' /><br/>

      <Paginate 
        offset={ offset } 
        limit={ limit } 
        total={ events?.total }
        loading={ loading }
        onChange={ x => setOffset(x) }
      />

      <FetchEvents
        search={ search }
        offset={ offset }
        limit={ limit }
        name={ eventName }
        setLoading={ x => setLoading(x) }
        setData={ x => setEvents(x) }
        setChart={ x => setChart(x) }
      /> 

      <Card>
        <Table  
          loading={ loading }
          data={ events?.results }
          show={['name', 'time', 'user_email']}
          actions={{

            delete: deleteEvent,
            view: { url: `/events/${eventName}`, col: 'id' }

          }}
        />
      </Card>
   </Animate>
  )
}

function FetchEvents(props){

  const events = useAPI(`/api/event?search=${props.search}&offset=${props.offset}&limit=${props.limit}&name=${props.name}`);

  useEffect(() => {

    props.setLoading(events.loading);
   
    if (events.data?.list)
      props.setData(events.data.list);

    if (events.data?.chart)
      props.setChart(events.data.chart);

  }, [events, props])

  return false;

}