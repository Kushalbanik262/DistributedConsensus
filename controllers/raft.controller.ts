import express, { ErrorRequestHandler, Router } from "express";
import { RaftController } from "@coaty/consensus.raft";
import { createLogger } from "../logger/logger";

export function createRaftRouter(
    raft: RaftController,
    nodeId: string,
    cluster: string,
): Router {
    const router = express.Router();
    const logger = createLogger(`RAFT_API:${nodeId}`);
    logger.info(`Router initialized for cluster=${cluster}`);
    router.use((req, res, next) => {
        const startedAt = Date.now();
        logger.info(`Request started method=${req.method} path=${req.path}`);
        res.on("finish", () => logger.info(`Request completed method=${req.method} path=${req.path} status=${res.statusCode} durationMs=${Date.now() - startedAt}`));
        next();
    });
    router.get("/health", (_req, res) => {
        logger.debug("Health check requested");
        res.json({ status: "ok", nodeId, cluster });
    });

    router.get("/v1/state", async (_req, res, next) => {
        try {
            logger.debug("Fetching replicated state from Raft");
            const entries = await raft.getState() as [string, string][];
            logger.info(`Replicated state fetched; entries=${entries.length}`);
            res.json({ nodeId, cluster, entries, values: Object.fromEntries(entries) });
        } catch (error) { next(error); }
    });

    router.get("/v1/values/:key", async (req, res, next) => {
        try {
            logger.debug(`Fetching key=${req.params.key} from replicated state`);
            const entries = await raft.getState() as [string, string][];
            const values = new Map(entries);
            if (!values.has(req.params.key)) {
                logger.warn(`Key not found key=${req.params.key}`);
                return res.status(404).json({ error: "key not found" });
            }
            logger.info(`Key read successfully key=${req.params.key}`);
            res.json({ key: req.params.key, value: values.get(req.params.key), nodeId });
        } catch (error) { next(error); }
    });

    router.put("/v1/values/:key", async (req, res, next) => {
        try {
            if (typeof req.body?.value !== "string") {
                logger.warn(`Invalid SET request key=${req.params.key}; value is not a string`);
                return res.status(400).json({ error: "body.value must be a string" });
            }
            logger.info(`Proposing SET operation key=${req.params.key}`);
            const entries = await raft.propose({ type: "SET", key: req.params.key, value: req.body.value }) as [string, string][];
            logger.info(`SET committed key=${req.params.key}; entries=${entries.length}`);
            res.json({ nodeId, entries, values: Object.fromEntries(entries) });
        } catch (error) { next(error); }
    });

    router.delete("/v1/values/:key", async (req, res, next) => {
        try {
            logger.info(`Proposing DELETE operation key=${req.params.key}`);
            const entries = await raft.propose({ type: "DELETE", key: req.params.key }) as [string, string][];
            logger.info(`DELETE committed key=${req.params.key}; entries=${entries.length}`);
            res.json({ nodeId, entries, values: Object.fromEntries(entries) });
        } catch (error) { next(error); }
    });

    router.get("/v1/cluster", async (_req, res, next) => {
        try {
            logger.debug("Fetching Raft cluster configuration");
            const members = await raft.getClusterConfiguration();
            logger.info(`Cluster configuration fetched; members=${Array.isArray(members) ? members.length : "unknown"}`);
            res.json({ nodeId, members });
        }
        catch (error) { next(error); }
    });

    return router;
}

export const raftErrorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
    const logger = createLogger("RAFT_API");
    const message = error instanceof Error ? error.message : "Raft operation failed";
    logger.error(`Request failed status=503 message=${message}`, error);
    res.status(503).json({ error: message });
};
