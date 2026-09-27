import React from 'react';
import { Row, Content, Message } from 'components/lib';

export function NotFound(props) {

  return(
    <Row>
      <Content>
        <Message
          type='error'
          title='404'
          text="Oops, the page you're looking for doesn't exist."
          buttonText='Go To Dashboard'
          buttonLink='/dashboard'
        />
      </Content>
    </Row>
  );
}
