import net from 'node:net'

const server = net.createServer((socket) => {
  console.log('Client connected')

  let buffer = ""
  socket.on('data', (chunk) => {
    buffer += chunk.toString()

    while (buffer.includes('\r\n')) {
      const index = buffer.indexOf('\r\n')
      const message = buffer.slice(0, index)
      buffer = buffer.slice(index + 2)

      console.log(message)
      // socket.write('Hello client\r\n')
    }
  })

  socket.on('end', () => {
    console.log('Client has disconnected')
  })
})

const PORT = 6379

server.listen(PORT, () => {
  console.log('Server has started...')
})
