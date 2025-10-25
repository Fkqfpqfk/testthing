const http = require("http");
const WebSocket = require("ws");

// Create HTTP server (Railway needs this for a public URL)
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("WebSocket server running");
});

const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("✅ Client connected");

    ws.on("message", (msg) => {
        console.log("📩 Received:", msg);
        if (msg === "ping") ws.send("pong");
        else ws.send(`Server received: ${msg}`);
    });

    ws.on("close", () => console.log("❌ Client disconnected"));
});

// Use Railway-assigned port
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 WebSocket server running on port ${PORT}`);
});
