import net from 'node:net'

const redisStorage = new Map();

const server = net.createServer((socket) => {
  console.log('Client connected')

  let buffer = ""
  socket.on('data', (chunk) => {

    // Data is a buffer, node implicitly calls toString()
    buffer += chunk.toString('utf8')

    if (buffer.length > 8000) {
      socket.end()
    }

    // To handle message fragmentation
    while (buffer.includes('\r\n')) {

      let index = buffer.indexOf('\r\n')
      let parsedString = buffer.slice(0, index)

      if (parsedString.toUpperCase() === "PING") {
        socket.write('+PONG\r\n')
      }

      else if (parsedString.startsWith("ECHO")) {
        let echoString = parsedString.split("ECHO ")
        if (echoString[1] !== undefined) {
          socket.write(`+${echoString[1]}\r\n`)
        }
        else socket.write("+ \r\n")
      }

      else if (parsedString.startsWith("SET")) {
        let setArguments = parsedString.split(" ")

        redisStorage.set(setArguments[1], setArguments[2])
        socket.write('+OK\r\n')
      }

      else if (parsedString.startsWith("GET")) {
        let getArguments = parsedString.split(" ")
        if (redisStorage.has(getArguments[1])) {
          socket.write(`+${redisStorage.get(getArguments[1])}\r\n`)
        }

        // RESP standard for "Null/Nil
        else socket.write('$-1\r\n')
      }

      buffer = buffer.slice(index + 2)
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
