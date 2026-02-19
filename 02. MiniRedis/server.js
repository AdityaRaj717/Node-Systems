import net from "node:net";

const redisStorage = new Map()

// Command Dispatcher
const commands = {
  "PING": handlePING,
  "SET": handleSET,
  "GET": handleGET
}
const allowedOptions = new Set(["EX"])

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

function handlePING() {
  return '+PONG\r\n'
}

function handleSET(stringArgs) {
  const key = stringArgs[1]
  const value = stringArgs[2]
  let expiresAt;

  if (stringArgs.length > 3) {
    for (let i = 3; i < stringArgs.length; i += 2) {
      if (allowedOptions.has(stringArgs[i])) {
        if (!stringArgs[i + 1]) return '-ERR expected a value for the option\r\n'
        else if (isNaN(stringArgs[i + 1])) return '-ERR invalid option value provided\r\n'
        else expiresAt = Date.now() + (parseInt(stringArgs[i + 1]) * 1000) // Expiry in seconds
      }
    }
  }
  redisStorage.set(key, { value, expiration: expiresAt })
  return '+OK\r\n'
}

function handleGET(stringArgs) {
  const result = redisStorage.get(stringArgs[1])
  if (!result) {
    console.log('No result found')
    return `$-1\r\n`
  }

  if (result.expiration === undefined) return `+${result.value}\r\n`
  if (result.expiration >= Date.now()) return `+${result.value}\r\n`
  redisStorage.delete(stringArgs[1])
  return `$-1\r\n`
}

function handleCommand(stringArgs) {
  // PING
  // SET key value EX 10

  if (stringArgs.length === 0) return '-ERR empty command\r\n'

  const commandName = stringArgs[0].toUpperCase()
  const handler = commands[commandName]
  if (!handler) return `-ERR unknown command ${commandName}\r\n`

  try {
    return handler(stringArgs)
  } catch (err) {
    return `-ERR internal error: ${err.message}\r\n`;
  }
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

      const response = handleCommand(stringArgs);
      socket.write(response)
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
