# Raft key-value API

Each terminal runs one Raft node and exposes an Express API. Raft traffic is carried by MQTT, so start the broker first:

```bash
npm install
docker compose up -d
```

Start the first node (exactly one node in a new cluster must use `CREATE_CLUSTER=true`):

```bash
NODE_ID=node-1 PORT=3001 CREATE_CLUSTER=true npm start
```

In different terminals, join more nodes. Do not set `CREATE_CLUSTER` for these nodes:

```bash
NODE_ID=node-2 PORT=3002 npm start
NODE_ID=node-3 PORT=3003 npm start
```

`NODE_ID` must be unique. All nodes must use the same `RAFT_CLUSTER` (defaults to `kv-cluster`) and `MQTT_URL` (defaults to `mqtt://localhost:1883`). Each node automatically has its own SQLite file at `data/raft-<node id>.db`; override this with `RAFT_DB` when needed.

To deliberately delete persisted data for exactly the node being started, set `RESET_NODE_DATA=true`. This removes only its configured database file and SQLite `-journal`, `-wal`, and `-shm` sidecar files before Raft starts:

```bash
NODE_ID=node-2 PORT=3002 RESET_NODE_DATA=true npm start
```

Use this only for a disposable local cluster or after removing the node from the cluster cleanly. It destroys that node's Raft log and can prevent the node from rejoining if the remaining cluster still records the same node ID. For an existing cluster, use a new `NODE_ID` after a reset.

Use any node's API. A write is only returned after Raft commits it to a quorum.

```bash
# Write through node 1
curl -X PUT http://localhost:3001/v1/values/colour \
  -H 'Content-Type: application/json' \
  --data '{"value":"blue"}'

# Read the same committed state through node 2
curl http://localhost:3002/v1/values/colour

# Inspect the node's current state or cluster membership
curl http://localhost:3003/v1/state
curl http://localhost:3003/v1/cluster

# Delete a value
curl -X DELETE http://localhost:3001/v1/values/colour
```

Endpoints: `GET /health`, `GET /v1/state`, `GET /v1/values/:key`, `PUT /v1/values/:key` with `{"value":"..."}`, `DELETE /v1/values/:key`, and `GET /v1/cluster`.

On a new cluster, keep node 1 alive until at least one joining node has connected. To reset a local experiment, stop all nodes, run `docker compose down`, and remove only the local `data` folder.
