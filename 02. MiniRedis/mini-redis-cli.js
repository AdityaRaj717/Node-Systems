import net from "node:net";
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "mini-redis> ",
});

function handleSimpleStrings(buffer) {
  let offset = 0
  // +OK\r\n
  const headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null

  const bulk = buffer.slice(offset + 1, headerEnd)
  const bytesConsumed = headerEnd + 2

  return { bulk, bytesConsumed }
}
function handleSimpleErrors(buffer) {
  // -ERR something\r\n
  let offset = 0

  const headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null

  const errorMsg = buffer.slice(offset + 1, headerEnd)
  return {
    bulk: `(error) ${errorMsg}`,
    bytesConsumed: headerEnd + 2
  }
}
function handleIntegers(buffer) {
  // :100\r\n
  let offset = 0

  const headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null

  const integer = parseInt(buffer.slice(offset + 1, headerEnd), 10)
  if (isNaN(integer)) throw new Error('Invalid integer')

  return {
    bulk: integer,
    bytesConsumed: headerEnd + 2
  }
}
function handleBulkStrings(buffer) {
  // $5\r\nhello\r\n
  // $-1\r\n
  let offset = 0

  let headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null

  // FIX: slice returns the buffer so need to convert to string first before parsing as int
  let bulkLen = parseInt(buffer.slice(offset + 1, headerEnd).toString(), 10)

  if (isNaN(bulkLen)) throw new Error("Invalid bulk length")
  if (bulkLen < 1) throw new Error("No results")

  offset = headerEnd + 2

  if (buffer.length < offset + bulkLen + 2) return null

  let bulk = buffer.slice(offset, offset + bulkLen)

  offset += bulkLen + 2

  return {
    bulk,
    bytesConsumed: offset
  }
}

function tryParseRESP(buffer) {
  // NOTE: Checks whether the bytes are enough for parsing
  // If it is then it parses

  let result;

  if (buffer.length < 1) return null;

  switch (buffer[0]) {
    case 0x2B:
      result = handleSimpleStrings(buffer)
      break
    case 0x2D:
      result = handleSimpleErrors(buffer)
      break
    case 0x3A:
      result = handleIntegers(buffer)
      break
    case 0x24:
      result = handleBulkStrings(buffer)
      break
    default:
      break
  }

  if (!result) return null
  return { bulk: result.bulk, bytesConsumed: result.bytesConsumed, }
}

// Convert into tokens
// Ex. ["SET", "key", "value"]
function tokenizer(rawString) {
  let tokens = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < rawString.length; i++) {
    if (rawString[i] === '"') {
      insideQuotes = !insideQuotes;
      if (insideQuotes === false) {
        tokens.push(current);
        current = "";
      }
    } else if (rawString[i] === " ") {
      if (insideQuotes) current += rawString[i];
      else if (current !== "") {
        tokens.push(current);
        current = "";
      }
    } else current += rawString[i];
  }

  if (insideQuotes) return null;
  else if (current !== "") tokens.push(current);

  return tokens;
}

// Encode into RESP (Redis Serialization Protocol) format
// *3\r\n$3\r\nSET\r\n$3\r\nkey\r\n$5\r\nvalue\r\n
function encodeRESP(tokens) {
  let encoded = "";
  encoded += `*${tokens.length}\r\n`;
  for (let i = 0; i < tokens.length; i++) {
    encoded += `$${Buffer.byteLength(tokens[i])}\r\n${tokens[i]}\r\n`;
  }
  return encoded;
}

const client = net.createConnection(6379, "localhost", () => {
  console.log("Connected to Server");
  rl.prompt();
});

// NOTE: Buffering the stream of bytes
// Initialize an empty buffer
// Buffer is a subclass of the Uint8Array and has extra methods
// like writeUInt32BE, readInt16LE, toString() etc

let buffer = Buffer.alloc(0);

client.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    let result;

    try {
      result = tryParseRESP(buffer);
    } catch (err) {
      console.log(err.message)
      rl.prompt()
      break;
    }
    if (!result) break

    const { bulk, bytesConsumed } = result
    console.log(isNaN(bulk) ? bulk.toString() : bulk)
    rl.prompt();
    buffer = buffer.subarray(bytesConsumed)
  }
});

rl.on("line", (line) => {
  const rawData = line.toString().trim();
  if (rawData.toLowerCase() === "exit") {
    console.log("Goodbye!");
    process.exit(0);
  }

  const tokens = tokenizer(rawData);
  if (!tokens) {
    console.log("Error (unmatched quote)");
    rl.prompt();
    return;
  }

  const encodedRESP = encodeRESP(tokens);
  client.write(encodedRESP);
});

rl.on("SIGINT", () => {
  rl.question("Are you sure you want to exit? (y/n) ", (answer) => {
    if (answer.match(/^y(es)?$/i)) {
      console.log("Goodbye!");
      process.exit(0);
    } else rl.prompt();
  });
});
