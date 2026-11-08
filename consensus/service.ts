import { RaftData, RaftStateMachine } from "@coaty/consensus.raft";
import { createLogger } from "../logger/logger";

const logger = createLogger("RAFT_STATE_MACHINE");

export interface KVSet{
    type : 'SET',
    key: string,
    value: string
}

export interface KVDelete{
    type : 'DELETE',
    key: string
}

export type KVInput = KVSet | KVDelete;

export class KeyValueStateMachine implements RaftStateMachine{
    private state = new Map<string,string>();

    processInput(input: KVInput): void {
        logger.info(`Applying committed ${input.type} operation for key=${input.key}`);
        switch(input.type){
            case 'SET':
                this.state.set(input.key,input.value);
                logger.debug(`SET applied for key=${input.key}; entries=${this.state.size}`);
                break;
            case 'DELETE':
                this.state.delete(input.key);
                logger.debug(`DELETE applied for key=${input.key}; entries=${this.state.size}`);
                break;
        }
    }
    getState(): RaftData {
       logger.debug(`State snapshot requested; entries=${this.state.size}`);
       return Array.from(this.state.entries());
    }
    setState(state: RaftData): void {
        const entries = state as [string, string][];
        this.state = new Map(entries);
        logger.info(`State restored from persisted snapshot; entries=${entries.length}`);
    }
}
