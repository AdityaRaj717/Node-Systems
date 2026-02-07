import net from 'node:net'

const redisStorage = new Map();

const server = net.createServer((socket) => {
  console.log('Client connected')

  // Buffering
  let buffer = ""
  socket.on('data', (chunk) => {

    // Data is a buffer, node implicitly calls toString()
    buffer += chunk.toString('utf8')

    if (buffer.length > 8000) {
      socket.end()
      return
    }

    // To handle message fragmentation
    while (buffer.includes('\r\n')) {

      const index = buffer.indexOf('\r\n')
      const message = buffer.slice(0, index).split(' ')
      buffer = buffer.slice(index + 2)

      // SET <key> <value with spaces> [options]
      // SET printKey hello world EX 10
      // SET printKey hello world PXX 10
      // SET printKey hello world EX 10 PXX 10
      // SET printKey hello world 

      const allowedOptions = ["EX"]
      let optionIndex = -1;

      for (let i = 2; i < message.length; i++) {
        if (allowedOptions.includes(message[i].toUpperCase())) {
          optionIndex = i
          break;
        }
      }


      const command = message[0].toUpperCase()
      const key = message[1]
      const value = optionIndex !== -1 ? message.slice(2, optionIndex).join(' ') : message.slice(2).join(' ')

      const parsedObject = {
        command: command,
        key: key,
        value: value,
        options: {
          EX: undefined,
        }
      }

      if (optionIndex !== -1) {
        for (let i = optionIndex; i < message.length; i++) {
          switch (message[i].toUpperCase()) {
            case "EX":
              parsedObject.options.EX = message[i + 1]
          }
        }
      }

      const reponse = handleCommand(message)
      socket.write(reponse)
    }
  })

  socket.on('end', () => {
    console.log('Client disconnected')
  })

  socket.on('error', () => {
    console.log('Client has forcefully exited.')
  })
})

let PORT = 6379
server.listen(PORT, () => {
  console.log(`Server has started listening on ${PORT}...`)
})

const commands = {
  "PING": handlePING,
  "SET": handleSET,
  "GET": handleGET,
}

function handleCommand(parsedString) {

  if (parsedString.toUpperCase() === "PING") {
    return '+PONG\r\n'
  }

  else if (parsedString.startsWith("ECHO")) {
    const echoString = parsedString.split("ECHO ")
    if (echoString[1] !== undefined) {
      return `+${echoString[1]}\r\n`
    }
    else return "+ \r\n"
  }

  else if (parsedString.startsWith("SET")) {
    const setArguments = parsedString.split(" ")

    if (setArguments[3] !== undefined && setArguments[3].toUpperCase() === 'EX') {
      const deathTime = Date.now() + (setArguments[4] * 1000)
      redisStorage.set(setArguments[1], { value: setArguments[2], expiresAt: deathTime })
    }

    else redisStorage.set(setArguments[1], { value: setArguments[2] })
    return '+OK\r\n'
  }

  else if (parsedString.startsWith("GET")) {
    const getArguments = parsedString.split(" ")
    const searchKey = getArguments[1]

    if (redisStorage.has(searchKey)) {
      const searchKeyValue = redisStorage.get(searchKey)
      if (searchKeyValue.expiresAt !== undefined && searchKeyValue.expiresAt > Date.now()) {
        return `+${searchKeyValue.value}\r\n`
      }
      else if (searchKeyValue.expiresAt !== undefined && searchKeyValue.expiresAt < Date.now()) {
        redisStorage.delete(searchKey)
        return `$-1\r\n`
      }
      else return `+${searchKeyValue.value}\r\n`
    }

    // RESP standard for "Null/Nil
    else return '$-1\r\n'
  }
}

function handlePING() { }
function handleSET() { }
function handleGET() { }
