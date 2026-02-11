import net from "node:net";

function tryParseRESP(buffer) {
  let offset = 0;

  if (buffer.length < 1) return null;
  if (buffer[offset] !== "*") throw new Error("Protocol error: expected *");

  const headerEnd = buffer.indexOf("\r\n", offset);
  if (headerEnd === -1) return null;

  let argCount = parseInt(buffer.slice(1, headerEnd), 10);
  if (isNaN(argCount)) throw new Error("Protocol error: invalid array length");

  let args = [];

  offset = headerEnd + 2;

  for (let i = 0; i < argCount; i++) {
    if (buffer.length <= offset) return null;
    if (buffer[offset] !== "$") throw new Error("Protocol error: expected $");

    let bulkHeaderEnd = buffer.indexOf("\r\n", offset);
    if (bulkHeaderEnd === -1) return null;

    let bulkLen = parseInt(buffer.slice(offset + 1, bulkHeaderEnd), 10);
    if (isNaN(bulkLen)) throw new Error("Protocol error: invalid bulk length");

    offset = bulkHeaderEnd + 2;

    if (buffer.length < offset + bulkLen + 2) return null;
    const value = buffer.slice(offset, offset + bulkLen);

    args.push(value);

    offset += bulkLen + 2;
  }

  return {
    args,
    bytesConsumed: offset,
  };
}

const server = net.createServer((socket) => {
  console.log("Client connected.");

  let buffer = "";

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");

    while (true) {
      const result = tryParseRESP(buffer);
      if (!result) break;

      const { args, bytesConsumed } = result;
      buffer = buffer.slice(bytesConsumed);

      // handleCommand(args);
    }
  });

  socket.on("end", () => {
    console.log("Client has disconnected.");
  });

  socket.on("error", (error) => {
    console.log(`Client is facing some issues ${error.message}`);
  });
});

const PORT = 6379;

server.listen(PORT, () => {
  console.log("Server has started...");
});
