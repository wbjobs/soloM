const net = require("net");
const config = require("../shared/config");

const server = net.createServer((socket) => {
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`[Device Gateway] Connection from ${remote}`);

  let buffer = "";

  socket.on("data", (data) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const command = JSON.parse(line);
        console.log(`[Device Gateway] Received command:`, command.id, command.command_type);

        const processingDelay = Math.floor(Math.random() * 200) + 50;

        setTimeout(() => {
          const ack = {
            command_id: command.id,
            device_id: command.device_id,
            status: "ack",
            timestamp: new Date().toISOString(),
            result: {
              executed: true,
              message: `Command "${command.command_type}" processed successfully`,
            },
          };

          socket.write(JSON.stringify(ack) + "\n");
          console.log(`[Device Gateway] ACK sent for ${command.id}`);
        }, processingDelay);
      } catch {
        console.error(`[Device Gateway] Invalid data from ${remote}:`, line);
      }
    }
  });

  socket.on("end", () => {
    console.log(`[Device Gateway] Client disconnected: ${remote}`);
  });

  socket.on("error", (err) => {
    console.error(`[Device Gateway] Socket error from ${remote}:`, err.message);
  });
});

server.listen(config.tcp.devicePort, () => {
  console.log(`[Device Gateway] TCP Server listening on port ${config.tcp.devicePort}`);
});
