import net from "node:net";
import * as readline from "node:readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "mini-redis> ",
});

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

// Buffering
let buffer = "";
client.on("data", (chunk) => {
  buffer += chunk.toString();

  while (buffer.includes("\r\n")) {
    const index = buffer.indexOf("\r\n");
    const message = buffer.slice(0, index);
    buffer = buffer.slice(index + 2);
    console.log(message);
    rl.prompt();
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
