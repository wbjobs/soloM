const net = require("net");
const config = require("./config");

function sendToDevice(payload) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { host: "127.0.0.1", port: config.tcp.devicePort },
      () => {
        const msg = JSON.stringify(payload) + "\n";
        socket.write(msg);
      }
    );

    let buffer = "";

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (line.trim()) {
          try {
            const ack = JSON.parse(line);
            socket.destroy();
            resolve(ack);
          } catch {
            socket.destroy();
            reject(new Error("Invalid ACK JSON from device"));
          }
        }
      }
    });

    socket.on("error", (err) => {
      reject(err);
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error("TCP connection timeout"));
    });
  });
}

module.exports = { sendToDevice };
