import path from 'node:path'
import fs from 'node:fs'
import { argv } from 'node:process'

// Node's wrapper around the C++ Gzip library
import zlib from 'node:zlib'

export default zip
function formatBytes(fileSizeInBytes, decimal = 2) {
  if (fileSizeInBytes === 0) { return '0 Bytes' }

  let k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const index = Math.floor(Math.log(fileSizeInBytes) / Math.log(k))
  return parseFloat(fileSizeInBytes / Math.pow(k, index)).toFixed(decimal) + ' ' + sizes[index]
}

try {

  // Check input file
  let inputFile = argv[2]
  let outputPath = argv[3]

  if (!inputFile) throw new Error("Missing input file argument");
  if (!outputPath) throw new Error("Missing output file argument");

  let inputFileStats = fs.statSync(inputFile)

  if (!inputFileStats.isFile()) {
    throw new Error("The input file is either a directory or file does not exist")
  }

  console.log(`Input file size: ${formatBytes(inputFileStats.size)}`)

  // Validate output file
  if (fs.existsSync(outputPath) && fs.statSync(outputPath).isDirectory()) {
    throw new Error(`The Input file path ${outputPath} is a directory. Please provide a file name`)
  }

  if (path.extname(outputPath) !== ".gz") {
    throw new Error(`Output file name must have an extension with .gz (e.g., output.gz)`)
  }

  // Data stream creation
  const readStream = fs.createReadStream(argv[2], { highWaterMark: 2 });
  const writeStream = fs.createWriteStream(argv[3], { highWaterMark: 2 });

  const gzip = zlib.createGzip()


  let dataTransfered = 0

  // Manual Backpressure handling
  readStream.on('data', (chunk) => {
    dataTransfered += chunk.length
    let percent = ((dataTransfered / inputFileStats.size) * 100).toFixed(2)
    process.stdout.write(`\rProgress: ${percent}%`);

    let canContinue = gzip.write(chunk)

    if (!canContinue) {
      readStream.pause()
    }
  })

  gzip.on("drain", () => {
    readStream.resume()
  })

  // Write from gzip to writeStream
  gzip.on('data', (compressedChunk) => {
    // Can skip out since compression is slower than disk I/O in 99% cases
    if (!writeStream.write(compressedChunk)) {
      gzip.pause()
    }
  })

  writeStream.on('drain', () => {
    gzip.resume()
  })

  // Every last bit of data flushed to the disk before closing
  readStream.on("end", () => {
    gzip.end()
  })

  gzip.on('end', () => {
    console.log("\nCompression Complete!")
    writeStream.end()
  })
} catch (error) {
  const usageMessage = "Usage: node zip.js <input_file> <output_file>";

  if (error.code === 'ENOENT') {
    console.error(`File not found: ${error.path}\n${usageMessage}`);
  } else {
    console.error(`Error: ${error.message}\n${usageMessage}`);
  }
  process.exit(1);
}
