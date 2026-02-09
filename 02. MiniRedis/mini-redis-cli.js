import net from 'node:net'
import process from 'node:process'

const ARGUMENTS = process.argv.slice(2)

function encodeRESP() {
  for (let i = 0; i < ARGUMENTS.length; i++) {
    if (i == 0) client.write(`*${ARGUMENTS.length}\r\n`)
    client.write(`$${Buffer.byteLength(ARGUMENTS[i])}\r\n${ARGUMENTS[i]}\r\n`)
  }
}

const client = net.createConnection(6379, 'localhost', () => {
  console.log('Connected to Server')
})

encodeRESP()

client.on('data', (chunk) => {
  // console.log(chunk.toString())
})
