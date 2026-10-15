import { EvDbView } from "@eventualize/core/EvDbView";

export class <%=_viewName%>State {
    constructor(<%-_constructorParams%>) { }
}

export const <%=_viewNameCamel%>Handlers = {
<%-_handlers%>
};
