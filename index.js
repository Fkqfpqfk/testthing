const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("WebSocket server running");
});

const wss = new WebSocket.Server({ server });

const connectedClients = {};

wss.on("connection", (ws) => {
    console.log("✅ New client connected");

    ws.meta = {
        PlaceId: null,
        JobId: null,
        UserId: null,
        Username: null,
        lastPing: Date.now(),
        isAdmin: false
    };

    ws.on("message", (rawMsg) => {
        let msg;
        try {
            msg = JSON.parse(rawMsg);
        } catch {
            return ws.send(JSON.stringify({ error: "Invalid JSON" }));
        }

        const { PlaceId, JobId, UserId, Username, command, data, adminKey } = msg;

        // Admin authentication
        if (adminKey === "SECRET_ADMIN_KEY") {
            ws.meta.isAdmin = true;
            ws.send(JSON.stringify({ response: "Admin authenticated" }));
            console.log("👨‍💻 Admin client connected");
            return;
        }

        // Roblox client registration
        if (PlaceId && JobId && UserId && Username) {
            ws.meta.PlaceId = PlaceId;
            ws.meta.JobId = JobId;
            ws.meta.UserId = UserId;
            ws.meta.Username = Username;

            if (!connectedClients[PlaceId]) connectedClients[PlaceId] = {};
            if (!connectedClients[PlaceId][JobId]) connectedClients[PlaceId][JobId] = {};
            connectedClients[PlaceId][JobId][UserId] = { Username, ws };

            console.log(`📌 Registered client: ${Username} (UserId: ${UserId}) in Place ${PlaceId}, Job ${JobId}`);
        }

        // Commands
        if (command === "ping") {
            ws.meta.lastPing = Date.now();
            ws.send(JSON.stringify({ response: "pong" }));
        } 
        else if (ws.meta.isAdmin && command === "kick") {
            console.log("📝 Admin kick command received:", data);

            const targetName = data.targetUsername;
            const targetId = data.targetUserId;
            const reason = data.reason || "No reason provided";

            let found = false;
            for (const placeId in connectedClients) {
                for (const jobId in connectedClients[placeId]) {
                    for (const userId in connectedClients[placeId][jobId]) {
                        const client = connectedClients[placeId][jobId][userId];
                        if (
                            (targetName && client.Username.toLowerCase() === targetName.toLowerCase()) ||
                            (targetId && parseInt(userId) === targetId)
                        ) {
                            client.ws.send(JSON.stringify({
                                command: "kick",
                                args: { reason, targetUsername: client.Username, targetUserId: userId }
                            }));
                            found = true;
                        }
                    }
                }
            }

            ws.send(JSON.stringify({
                response: found ? `Kicked ${targetName || targetId}` : `Client ${targetName || targetId} not found`
            }));
        }
    });

    ws.on("close", () => {
        if (ws.meta.isAdmin) {
            console.log("❌ Admin client disconnected");
        } else {
            removeClient(ws);
        }
    });
});

// Heartbeat system
setInterval(() => {
    const now = Date.now();
    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) continue;
        if (client.meta.isAdmin) continue;

        if (now - client.meta.lastPing > 10000) {
            console.log(`⏱️ Timeout: ${client.meta.Username}`);
            client.terminate();
            removeClient(client);
        }
    }
}, 5000);

function removeClient(ws) {
    const { PlaceId, JobId, UserId, Username } = ws.meta;
    if (PlaceId && JobId && UserId && connectedClients[PlaceId]?.[JobId]) {
        delete connectedClients[PlaceId][JobId][UserId];
        console.log(`❌ Client removed: ${Username} (UserId: ${UserId})`);
        if (Object.keys(connectedClients[PlaceId][JobId]).length === 0)
            delete connectedClients[PlaceId][JobId];
        if (Object.keys(connectedClients[PlaceId]).length === 0)
            delete connectedClients[PlaceId];
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WebSocket server running on port ${PORT}`));
