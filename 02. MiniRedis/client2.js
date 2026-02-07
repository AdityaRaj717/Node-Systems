
import net from 'node:net'

const socket = net.createConnection(6379, 'localhost', () => {
  console.log('Connected')
  socket.write(`GET mykey\r\n`)

  socket.on('data', (chunk) => {
    console.log(chunk.toString())
  })
})
