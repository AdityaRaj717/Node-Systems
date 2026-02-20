import net from "node:net";
import fs from 'node:fs'

// ---------------------------------------------------------
// LAYER 1: STORAGE & STATE
// ---------------------------------------------------------
// The core database. In a real system, this would be heavily optimized,
// but V8's Map is highly performant for key-value lookups.
const redisStorage = new Map()

// The Dispatcher Dictionary. Allocated ONCE at startup to prevent 
// memory leaks and garbage collection spikes during high throughput.
const commands = {
  "PING": handlePING,
  "SET": handleSET,
  "GET": handleGET
}
const allowedOptions = new Set(["EX"])

let writeStream = fs.createWriteStream('database.aof', {
  flags: 'a'
});

// ---------------------------------------------------------
// LAYER 2: THE PARSER (Protocol Framing)
// ---------------------------------------------------------
// Reads raw TCP byte streams and frames them into RESP arrays.
// Designed to fail gracefully by returning `null` if a packet is incomplete,
// allowing the buffer to wait for the rest of the TCP chunks.
function tryParseRESP(buffer) {
  let offset = 0;

  if (buffer.length < 1) return null;

  // 0x2a is the hex code for '*' (RESP Array indicator)
  // Operating on raw hex is faster than converting to strings.
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

    // 0x24 is the hex code for '$' (RESP Bulk String indicator)
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

    // Backpressure / Fragmentation check: Do we have the full string yet?
    if (buffer.length < offset + bulkLen + 2) {
      return null;
    }

    // Slicing Buffers creates references to memory, it doesn't copy it. Very efficient.
    const value = buffer.slice(offset, offset + bulkLen);
    args.push(value);

    offset += bulkLen + 2;
  }

  return {
    args,
    bytesConsumed: offset, // Tells the network layer how much memory to free
  };
}

// Converts the parsed args back into the raw RESP byte format to store in the database.aof
function encodeRESP(tokens) {
  let encoded = "";
  encoded += `*${tokens.length}\r\n`;
  for (let i = 0; i < tokens.length; i++) {
    encoded += `$${Buffer.byteLength(tokens[i])}\r\n${tokens[i]}\r\n`;
  }
  return encoded;
}


// ---------------------------------------------------------
// LAYER 3: COMMAND HANDLERS (The Brain)
// ---------------------------------------------------------
function handlePING() {
  return '+PONG\r\n'
}

function handleSET(stringArgs) {
  const key = stringArgs[1]
  const value = stringArgs[2]
  let expiresAt; // Intentionally undefined for permanent keys

  // Parse optional flags like EX (Expiration)
  if (stringArgs.length > 3) {
    for (let i = 3; i < stringArgs.length; i += 2) {
      if (allowedOptions.has(stringArgs[i])) {
        if (!stringArgs[i + 1]) return '-ERR expected a value for the option\r\n'
        else if (isNaN(stringArgs[i + 1])) return '-ERR invalid option value provided\r\n'
        else expiresAt = Date.now() + (parseInt(stringArgs[i + 1]) * 1000)
      }
    }
  }

  // Store as an object to hold metadata alongside the value
  redisStorage.set(key, { value, expiration: expiresAt })
  const encodedString = encodeRESP(stringArgs)

  writeStream.write(encodedString)


  return '+OK\r\n'
}

function handleGET(stringArgs) {
  const result = redisStorage.get(stringArgs[1])

  // Cache Miss
  if (!result) {
    return `$-1\r\n` // RESP Null Bulk String
  }

  // Lazy Expiration Logic
  if (result.expiration === undefined || result.expiration >= Date.now()) return `+${result.value}\r\n`

  // Rotten key found. Clean it up to free memory, then return Null.
  redisStorage.delete(stringArgs[1])
  return `$-1\r\n`
}

// The Dispatcher Pattern
// Routes commands to their functions safely, preventing server crashes on typos.
function handleCommand(stringArgs) {
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


// ---------------------------------------------------------
// LAYER 4: TRANSPORT / NETWORKING (Layer 4 TCP)
// ---------------------------------------------------------
const server = net.createServer((socket) => {
  // Connection-scoped state. 
  // Prevents Client A's fragmented packets from mixing with Client B's.
  let buffer = Buffer.alloc(0);

  socket.on("data", (chunk) => {
    // Append raw memory. DO NOT call .toString() here to avoid emoji/byte length bugs.
    buffer = Buffer.concat([buffer, chunk]);

    // The Coalescing Loop. Processes multiple commands packed into a single TCP chunk.
    while (true) {
      let result;

      try {
        result = tryParseRESP(buffer);
      } catch (err) {
        console.error("Protocol error:", err.message);
        socket.write("-ERR Protocol error\r\n");
        socket.destroy(); // Malicious/malformed client. Drop connection.
        return;
      }

      // Not enough data for a full command yet. Break loop and wait for next 'data' event.
      if (!result) break;

      const { args, bytesConsumed } = result;

      // Truncate the buffer, keeping only the unparsed leftover bytes
      buffer = buffer.subarray(bytesConsumed);

      // We only convert to strings at the very end when feeding the application logic
      const stringArgs = args.map((arg) => arg.toString("utf8"));

      const response = handleCommand(stringArgs);
      socket.write(response)
    }
  });

  // Graceful handling of edge cases to prevent unhandled promise rejections
  socket.on("error", (err) => {
    console.error("Socket error:", err.message);
  });
});

const PORT = 6379;

// function fillFromAOF() {
//   const fd = fs.openSync('database.aof', 'r')
//   const bytesRead = fs.readSync(fd)
// }


server.listen(PORT, () => {
  console.log("Server has started...");
});
