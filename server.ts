import express from "express";
import fs from "fs";
import path from "path";
import { Container } from "@coaty/core";
import { RaftController } from "@coaty/consensus.raft";
import { KeyValueStateMachine } from "./consensus/service";
import { createRaftRouter, raftErrorHandler } from "./controllers/raft.controller";
import { createLogger } from "./logger/logger";

function requiredEnvironment(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`${name} must be set`);
    return value;
}

function removeNodeDatabase(databaseFile: string, logger: ReturnType<typeof createLogger>): void {
    const resolvedDatabaseFile = path.resolve(databaseFile);
    const files = [resolvedDatabaseFile, `${resolvedDatabaseFile}-journal`, `${resolvedDatabaseFile}-wal`, `${resolvedDatabaseFile}-shm`];

    for (const file of files) {
        if (fs.existsSync(file)) {
            if (!fs.lstatSync(file).isFile()) {
                throw new Error(`Refusing to remove non-file node data path: ${file}`);
            }
            fs.rmSync(file, { force: true });
            logger.warn(`Deleted persisted node data file=${file}`);
        }
    }
}

async function main(): Promise<void> {
    const nodeId = requiredEnvironment("NODE_ID");
    const port = Number(process.env.PORT || 3000);
    const cluster = process.env.RAFT_CLUSTER || "kv-cluster";
    const brokerUrl = process.env.MQTT_URL || "mqtt://localhost:1883";
    const shouldCreateCluster = process.env.CREATE_CLUSTER === "true";
    const databaseFile = process.env.RAFT_DB || `data/raft-${nodeId}.db`;
    const resetNodeData = process.env.RESET_NODE_DATA === "true";

    const logger = createLogger(`RAFT_NODE:${nodeId}`);
    logger.info(`Starting node; port=${port} cluster=${cluster} createCluster=${shouldCreateCluster}`);

    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        logger.error(`Invalid port configured port=${port}`);
        throw new Error("PORT must be a valid TCP port");
    }
    fs.mkdirSync(path.dirname(path.resolve(databaseFile)), { recursive: true });
    logger.info(`Data directory ready; databaseFile=${databaseFile}`);
    if (resetNodeData) {
        logger.warn("RESET_NODE_DATA=true; removing this node's persisted Raft data before boot");
        removeNodeDatabase(databaseFile, logger);
    }

    logger.info(`Creating Raft container; broker=${brokerUrl}`);
    const container = Container.resolve(
        { controllers: { RaftController } },
        {
            communication: { brokerUrl, shouldAutoStart: true },
            controllers: {
                RaftController: {
                    id: nodeId,
                    cluster,
                    shouldCreateCluster,
                    stateMachine: new KeyValueStateMachine(),
                },
            },
            databases: {
                raftdb: { adapter: "SqLiteNodeAdapter", connectionString: databaseFile },
            },
        },
    );
    const raft = container.getController<RaftController>("RaftController");
    logger.info("Connecting node to Raft cluster");
    await raft.connect();
    logger.info("Raft cluster connection established");

    const app = express();
    logger.info("Configuring Express middleware and routes");
    app.use(express.json());
    app.use(createRaftRouter(raft, nodeId, cluster));
    app.use(raftErrorHandler);

    const server = app.listen(port, () => {
        logger.info(`HTTP server listening address=http://localhost:${port} cluster=${cluster}`);
    });

    let stopping = false;
    async function shutdown(): Promise<void> {
        if (stopping) return;
        stopping = true;
        logger.info("Shutdown requested; closing HTTP server and stopping Raft node");
        server.close();
        try {
            await raft.disconnect();
            logger.info("Raft node stopped successfully");
        } catch (error) {
            logger.error("Failed while stopping Raft node", error);
        } finally { process.exit(0); }
    }
    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
}

void main().catch((error: unknown) => {
    createLogger("RAFT_NODE").error("Unable to start Raft node", error);
    process.exit(1);
});
