import net from "node:net";

function tryParseRESP(buffer) {
  let offset = 0;

  if (buffer.length < 1) return null;

  if (buffer[offset] !== 0x2a) {
    throw new Error("Protocol error: expected *");
  }

  const headerEnd = buffer.indexOf("\r\n", offset);
  if (headerEnd === -1) return null;

  const countStr = buffer.slice(offset + 1, headerEnd).toString();
  const argCount = parseInt(countStr, 10);

  if (isNaN(argCount)) {
    throw new Error("Protocol error: invalid array length");
  }

  offset = headerEnd + 2;

  let args = [];

  for (let i = 0; i < argCount; i++) {
    if (buffer.length <= offset) return null;

    if (buffer[offset] !== 0x24) {
      throw new Error("Protocol error: expected $");
    }

    const bulkHeaderEnd = buffer.indexOf("\r\n", offset);
    if (bulkHeaderEnd === -1) return null;

    const lenStr = buffer.slice(offset + 1, bulkHeaderEnd).toString();
    const bulkLen = parseInt(lenStr, 10);

    if (isNaN(bulkLen)) {
      throw new Error("Protocol error: invalid bulk length");
    }

    offset = bulkHeaderEnd + 2;

    if (buffer.length < offset + bulkLen + 2) {
      return null;
    }

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


  // NOTE: Buffering the stream of bytes

  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {

    // Append raw bytes (no decoding)
    buffer = Buffer.concat([buffer, chunk]);

    while (true) {
      let result;

      try {
        result = tryParseRESP(buffer);
      } catch (err) {
        console.error("Protocol error:", err.message);
        socket.write("-ERR Protocol error\r\n");
        socket.destroy();
        return;
      }

      if (!result) break;

      const { args, bytesConsumed } = result;

      buffer = buffer.subarray(bytesConsumed);

      // Convert to string
      const stringArgs = args.map((arg) => arg.toString("utf8"));
      console.log("Parsed command:", stringArgs);

      // handleCommand(stringArgs);
    }
  });

  socket.on("end", () => {
    console.log("Client disconnected.");
  });

  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
  });
});

const PORT = 6379;

server.listen(PORT, () => {
  console.log("Server has started...");
});
