import net from "node:net";
import { off } from "node:process";
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "mini-redis> ",
});

function tryParseRESP(buffer) {
  // NOTE: Checks whether the bytes are enough for parsing
  // If it is then it parses

  // +OK\r\n

  let offset = 0

  if (buffer.length < 1) return null;

  const bulkEnd = buffer.indexOf('\r\n')
  if (bulkEnd === -1) return null

  let bulk = buffer.slice(offset, bulkEnd)

  offset = bulkEnd + 2

  return { bulk, bytesConsumed: offset }
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

  const result = tryParseRESP(buffer);
  console.log(result);
  rl.prompt();
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
