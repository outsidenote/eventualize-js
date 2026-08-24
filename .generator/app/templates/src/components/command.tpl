export interface <%=_commandName%>Command {
<%-_fields%>
}

export const handle<%=_commandName%> = async (
    command: <%=_commandName%>Command,
    stream: <%=_streamType%>StreamType
): Promise<void> => {
    // TODO: Implement command handler logic
    // Example:
<%-_eventEmissions%>
};
