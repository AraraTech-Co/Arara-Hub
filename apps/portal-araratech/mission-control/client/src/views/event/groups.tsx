import React from 'react';
/***
*
*   EVENT/GROUPS
*   List the events grouped by name
*
**********/
import { useState, useEffect } from 'react';
import { Animate, Card, Table, Search, useAPI } from 'components/lib';

export function EventGroups(props){

  // state 
  const [search, setSearch] = useState<any>(''); // TODO: Type this // TODO: Type this
  const [events, setEvents] = useState<any>(null); // TODO: Type this // TODO: Type this
  const [loading, setLoading] = useState<any>(false); // TODO: Type this // TODO: Type this
  
  return (
    <Animate>

      <Search throttle={ 1000 } callback={ x => setSearch(x) }/><br/>

      <FetchEvents
        search={ search }
        setLoading={ x => setLoading(x) }
        setData={ x => setEvents(x) }
      /> 

      <Card>
        <Table  
          loading={ loading }
          data={ events?.results }
          badge={{ col: 'total_triggers', color: 'blue' }}
          show={['name', 'total_triggers']}
          actions={{

            view: { url: '/events', col: 'name' }

          }}
        />
      </Card>
   </Animate>
  )
}

function FetchEvents(props){

  const events = useAPI(`/api/event?search=${props.search}&group=name`);

  useEffect(() => {

    props.setLoading(events.loading);
   
    if (events.data)
      props.setData(events.data);

  }, [events, props])

  return false;

}