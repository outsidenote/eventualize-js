import IEvDbView from "./IEvDbView";
import EvDbViewAddress from "./EvDbViewAddress";

export default class EvDbView implements IEvDbView {

    constructor(readonly address: EvDbViewAddress, readonly memoryOffset: number = 0, readonly storeOffset: number = 0) {
    }
}