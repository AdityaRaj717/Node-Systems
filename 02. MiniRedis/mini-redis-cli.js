import net from "node:net";
import * as readline from "node:readline";

// ---------------------------------------------------------
// LAYER 1: THE TTY / REPL INTERFACE
// ---------------------------------------------------------
// `readline` wraps standard standard input (stdin) and output (stdout).
// It prevents the terminal from immediately echoing every single keystroke 
// and gives us a nice prompt, creating a true shell experience.
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "mini-redis> ",
});


// ---------------------------------------------------------
// LAYER 2: THE RESP DESERIALIZER (Server -> Client)
// ---------------------------------------------------------
// These functions parse the raw bytes coming BACK from the server.
// They return both the payload (`bulk`) and how many bytes it took up 
// (`bytesConsumed`) so the network layer knows how to slide the buffer forward.

function handleSimpleStrings(buffer) {
  let offset = 0
  const headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null // Packet is fragmented. Wait for more data.

  const bulk = buffer.slice(offset + 1, headerEnd)
  const bytesConsumed = headerEnd + 2
  return { bulk, bytesConsumed }
}

function handleSimpleErrors(buffer) {
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
  let offset = 0
  const headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null

  // Base 10 parsing is critical here.
  const integer = parseInt(buffer.slice(offset + 1, headerEnd), 10)
  if (isNaN(integer)) throw new Error('Invalid integer')

  return { bulk: integer, bytesConsumed: headerEnd + 2 }
}

function handleBulkStrings(buffer) {
  let offset = 0
  let headerEnd = buffer.indexOf('\r\n', offset)
  if (headerEnd === -1) return null

  let bulkLen = parseInt(buffer.slice(offset + 1, headerEnd).toString(), 10)

  if (isNaN(bulkLen)) throw new Error("Invalid bulk length")
  if (bulkLen < 1) throw new Error("No results")

  offset = headerEnd + 2

  // Backpressure Check: Ensures we don't try to read a 500-byte string 
  // if only 200 bytes have arrived over the network so far.
  if (buffer.length < offset + bulkLen + 2) return null

  let bulk = buffer.slice(offset, offset + bulkLen)
  offset += bulkLen + 2

  return { bulk, bytesConsumed: offset }
}

// The Deserializer Dispatcher.
// Uses Hexadecimal checks for insane performance. Reading buffer[0] === 0x2B 
// is infinitely faster than converting to string and checking buffer[0] === "+".
function tryParseRESP(buffer) {
  let result;
  if (buffer.length < 1) return null;

  switch (buffer[0]) {
    case 0x2B: // '+' (Simple String)
      result = handleSimpleStrings(buffer)
      break
    case 0x2D: // '-' (Error)
      result = handleSimpleErrors(buffer)
      break
    case 0x3A: // ':' (Integer)
      result = handleIntegers(buffer)
      break
    case 0x24: // '$' (Bulk String)
      result = handleBulkStrings(buffer)
      break
    default:
      break
  }

  if (!result) return null
  return { bulk: result.bulk, bytesConsumed: result.bytesConsumed, }
}


// ---------------------------------------------------------
// LAYER 3: THE LEXER & SERIALIZER (Client -> Server)
// ---------------------------------------------------------

// A hand-rolled State Machine Lexer.
// It iterates through the string character by character to group words,
// specifically handling quoted strings so `SET msg "Hello World"` doesn't 
// split "Hello" and "World" into two arguments.
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

  if (insideQuotes) return null; // Unclosed quote syntax error
  else if (current !== "") tokens.push(current);

  return tokens;
}

// Converts the parsed tokens into the raw RESP byte format for the server.
function encodeRESP(tokens) {
  let encoded = "";
  encoded += `*${tokens.length}\r\n`;
  for (let i = 0; i < tokens.length; i++) {
    // CRITICAL SYSTEMS KNOWLEDGE:
    // Buffer.byteLength() calculates actual memory footprint (e.g., emojis take 4 bytes).
    // string.length only calculates character count. This prevents massive protocol corruption.
    encoded += `$${Buffer.byteLength(tokens[i])}\r\n${tokens[i]}\r\n`;
  }
  return encoded;
}


// ---------------------------------------------------------
// LAYER 4: THE NETWORK & EVENT LOOP
// ---------------------------------------------------------

const client = net.createConnection(6379, "localhost", () => {
  console.log("Connected to Server");
  rl.prompt(); // Trigger the first command prompt
});

let buffer = Buffer.alloc(0);

// Asynchronous Network Listener
client.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]); // Coalescing incoming memory

  while (true) {
    let result;

    try {
      result = tryParseRESP(buffer);
    } catch (err) {
      console.log(err.message)
      rl.prompt()
      break;
    }

    if (!result) break // Fragmented packet, wait for more chunks

    const { bulk, bytesConsumed } = result
    console.log(isNaN(bulk) ? bulk.toString() : bulk)
    rl.prompt(); // Prompt the user for the NEXT command

    // Slide the buffer forward, throwing away the memory we just parsed
    buffer = buffer.subarray(bytesConsumed)
  }
});

// Asynchronous Input Listener (Listens to your keyboard)
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
  client.write(encodedRESP); // Send the raw memory to Layer 4 TCP
});

// Graceful Termination Hook
rl.on("SIGINT", () => {
  rl.question("Are you sure you want to exit? (y/n) ", (answer) => {
    if (answer.match(/^y(es)?$/i)) {
      console.log("Goodbye!");
      process.exit(0);
    } else rl.prompt();
  });
});
