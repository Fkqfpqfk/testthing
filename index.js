const http = require("http");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
	res.writeHead(200);
	res.end("WebSocket server running");
});

const wss = new WebSocket.Server({ server });

// connectedClients[PlaceId][JobId][UserId] = { Username, ws }
const connectedClients = {};

wss.on("connection", (ws) => {
	console.log("✅ Client connected");

	ws.meta = {
		PlaceId: null,
		JobId: null,
		UserId: null,
		Username: null,
		lastPing: Date.now(),
		isAdmin: false, // mark Python app connections
	};

	ws.on("message", (rawMsg) => {
		let msg;
		try {
			msg = JSON.parse(rawMsg);
		} catch {
			return ws.send(JSON.stringify({ error: "Invalid JSON" }));
		}

		const { PlaceId, JobId, UserId, Username, command, data, adminKey } = msg;

		// Handle admin program identification
		if (adminKey === "SECRET_ADMIN_KEY") {
			ws.meta.isAdmin = true;
			ws.send(JSON.stringify({ response: "Admin authenticated" }));
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
		}

		// Commands
		if (command === "ping") {
			ws.meta.lastPing = Date.now();
			ws.send(JSON.stringify({ response: "pong" }));
		}
		else if (ws.meta.isAdmin && command === "kick") {
			const targetName = data.target;
			const reason = data.reason;

			let found = false;
			for (const placeId in connectedClients) {
				for (const jobId in connectedClients[placeId]) {
					for (const userId in connectedClients[placeId][jobId]) {
						const client = connectedClients[placeId][jobId][userId];
						if (client.Username.toLowerCase() === targetName.toLowerCase()) {
							client.ws.send(JSON.stringify({
								command: "kick",
								args: { reason }
							}));
							found = true;
							break;
						}
					}
				}
			}

			if (found) {
				ws.send(JSON.stringify({ response: `Kicked ${targetName}` }));
			} else {
				ws.send(JSON.stringify({ response: `Client ${targetName} not found` }));
			}
		}
	});

	ws.on("close", () => removeClient(ws));
});

// --- Heartbeat system ---
setInterval(() => {
	const now = Date.now();
	for (const client of wss.clients) {
		if (client.readyState !== WebSocket.OPEN) continue;
		if (client.meta.isAdmin) continue; // skip admin app
		if (now - client.meta.lastPing > 10000) {
			console.log(`⏱️ Timeout: ${client.meta.Username}`);
			client.terminate();
			removeClient(client);
		}
	}
}, 5000);

function removeClient(ws) {
	const { PlaceId, JobId, UserId } = ws.meta;
	if (PlaceId && JobId && UserId && connectedClients[PlaceId]?.[JobId]) {
		delete connectedClients[PlaceId][JobId][UserId];
		if (Object.keys(connectedClients[PlaceId][JobId]).length === 0)
			delete connectedClients[PlaceId][JobId];
		if (Object.keys(connectedClients[PlaceId]).length === 0)
			delete connectedClients[PlaceId];
	}
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 WebSocket server running on port ${PORT}`));
