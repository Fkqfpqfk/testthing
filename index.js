const http = require("http");
const WebSocket = require("ws");

// HTTP server (required by Railway for a public URL)
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("WebSocket server running");
});

const wss = new WebSocket.Server({ server });

// Structure to store connected clients
// connectedClients[PlaceId][JobId][UserId] = Username
const connectedClients = {};

wss.on("connection", (ws) => {
    console.log("✅ Client connected");

    // Store client metadata
    ws.meta = {
        PlaceId: null,
        JobId: null,
        UserId: null,
        Username: null
    };

    ws.on("message", (rawMsg) => {
        try {
            const msg = JSON.parse(rawMsg);

            // Expect msg to have: { PlaceId, JobId, UserId, Username, command }
            const { PlaceId, JobId, UserId, Username, command, data } = msg;

            // Save metadata if provided
            if (PlaceId && JobId && UserId && Username) {
                ws.meta = { PlaceId, JobId, UserId, Username };

                // Initialize tables if they don't exist
                if (!connectedClients[PlaceId]) connectedClients[PlaceId] = {};
                if (!connectedClients[PlaceId][JobId]) connectedClients[PlaceId][JobId] = {};
                connectedClients[PlaceId][JobId][UserId] = Username;

                console.log(`📌 Added client: ${Username} (UserId: ${UserId}) in JobId ${JobId}, PlaceId ${PlaceId}`);
            }

            // Handle commands
            if (command === "ping") {
                ws.send(JSON.stringify({ response: "pong" }));
            } else if (command === "broadcast" && PlaceId && JobId) {
                // Broadcast to all clients in the same PlaceId + JobId
                const clients = connectedClients[PlaceId][JobId];
                Object.entries(clients).forEach(([uid, uname]) => {
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN &&
                            client.meta.UserId == uid &&
                            client.meta.JobId === JobId &&
                            client.meta.PlaceId === PlaceId) {
                            client.send(JSON.stringify({ response: "broadcast", data }));
                        }
                    });
                });
            } else {
                ws.send(JSON.stringify({ response: "Server received", data: msg }));
            }
        } catch (e) {
            ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
    });

    ws.on("close", () => {
        const { PlaceId, JobId, UserId, Username } = ws.meta;
        if (PlaceId && JobId && UserId) {
            // Remove from connectedClients
            if (connectedClients[PlaceId] &&
                connectedClients[PlaceId][JobId] &&
                connectedClients[PlaceId][JobId][UserId]) {
                delete connectedClients[PlaceId][JobId][UserId];
                console.log(`❌ Client disconnected: ${Username} (UserId: ${UserId})`);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WebSocket server running on port ${PORT}`));
