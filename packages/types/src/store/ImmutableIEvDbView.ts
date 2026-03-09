import type IEvDbView from "../view/IEvDbView.js";

/** A deeply read-only snapshot of an {@link IEvDbView}, used to prevent mutation after storage. */
type ImmutableIEvDbView = Readonly<IEvDbView>;
export default ImmutableIEvDbView;
