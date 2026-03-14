import { StreamFactoryBuilder, StreamWithEventMethods } from '@eventualize/core/EvDbStreamFactory';
<%-_eventImports%>
<%-_viewImports%>
<%-_messageImports%>

const <%=_streamName%>Factory = new StreamFactoryBuilder('<%=_streamName%>')
<%-_eventRegistrations%>
<%-_viewRegistrations%>
    .build();

export default <%=_streamName%>Factory;

export type <%=_streamName%>Type = typeof <%=_streamName%>Factory.StreamType;
