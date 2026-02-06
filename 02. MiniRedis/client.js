import net from 'node:net'

const socket = net.createConnection(6379, 'localhost', () => {
  console.log('Connected')
  socket.write(`SET mykey SuperSecretValue\r\n`)

  socket.on('data', (chunk) => {
    console.log(chunk.toString())
  })
})
