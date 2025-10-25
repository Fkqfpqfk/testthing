const http = require("http");
const WebSocket = require("ws");

// HTTP server for public hosting
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

        // Ensure command and data exist
        const command = msg.command;
        const adminKey = msg.adminKey;
        const data = msg.data && typeof msg.data === "object" ? msg.data : {};

        // --- Admin authentication ---
        if (!ws.meta.isAdmin && adminKey === "SECRET_ADMIN_KEY") {
            ws.meta.isAdmin = true;
            ws.send(JSON.stringify({ response: "Admin authenticated" }));
            console.log("👨‍💻 Admin client connected");
            return;
        }

        // --- Admin commands ---
        if (ws.meta.isAdmin) {
            console.log(`📝 Admin command: ${command}`, data);

            switch (command) {
                case "kick": sendCommandToClient(data, "kick"); break;
                case "broadcast": sendCommandToClient(data, "broadcast"); break;
                case "teleport": sendCommandToClient(data, "teleport"); break;
                case "playEmote": sendCommandToClient(data, "playEmote"); break;
                case "freeze": sendCommandToClient(data, "freeze"); break;
                case "unfreeze": sendCommandToClient(data, "unfreeze"); break;
                case "kill": sendCommandToClient(data, "kill"); break;
                case "listClients":
                    const clients = [];
                    for (const placeId in connectedClients) {
                        for (const jobId in connectedClients[placeId]) {
                            for (const userId in connectedClients[placeId][jobId]) {
                                const c = connectedClients[placeId][jobId][userId];
                                clients.push({
                                    Username: c.Username,
                                    UserId: parseInt(userId),
                                    PlaceId: placeId,
                                    JobId: jobId
                                });
                            }
                        }
                    }
                    ws.send(JSON.stringify({ clients }));
                    break;
            }
            return;
        }

        // --- Roblox client registration ---
        if (command === "RegisterClient") {
            const { PlaceId, JobId, UserId, Username } = data;
            if (!PlaceId || !JobId || !UserId || !Username) return;

            ws.meta.PlaceId = PlaceId;
            ws.meta.JobId = JobId;
            ws.meta.UserId = UserId;
            ws.meta.Username = Username;

            if (!connectedClients[PlaceId]) connectedClients[PlaceId] = {};
            if (!connectedClients[PlaceId][JobId]) connectedClients[PlaceId][JobId] = {};
            connectedClients[PlaceId][JobId][UserId] = { Username, ws };

            console.log(`📌 Registered client: ${Username} (UserId: ${UserId}) in Place ${PlaceId}, Job ${JobId}`);
            ws.send(JSON.stringify({ response: "Client registered successfully" }));
            return;
        }

        // --- Heartbeat ping ---
        if (command === "ping") {
            ws.meta.lastPing = Date.now();
            ws.send(JSON.stringify({ response: "pong" }));
            return;
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

// --- Send command to matching client(s) ---
function sendCommandToClient(data = {}, cmd) {
    if (!data || typeof data !== "object") data = {};

    for (const placeId in connectedClients) {
        for (const jobId in connectedClients[placeId]) {
            for (const userId in connectedClients[placeId][jobId]) {
                const client = connectedClients[placeId][jobId][userId];

                const targetUserId = data.targetUserId;
                const targetUsername = data.targetUsername ? data.targetUsername.toLowerCase() : null;

                if (
                    (!targetUserId || parseInt(userId) === targetUserId) &&
                    (!targetUsername || client.Username.toLowerCase() === targetUsername)
                ) {
                    // Always send a command object with args: {}
                    client.ws.send(JSON.stringify({
                        command: cmd,
                        args: data || {}
                    }));
                }
            }
        }
    }
}

// --- Heartbeat check ---
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

// --- Remove client ---
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

// --- Start server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WebSocket server running on port ${PORT}`));
