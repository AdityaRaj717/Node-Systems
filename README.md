# Node-Systems

A personal repository for Node.js system-level projects.

This repo is a workspace for building small, focused Node-based tools from scratch to understand how things actually work under the hood. The goal is not frameworks or APIs, but fundamentals like streams, processes, file systems, memory, and performance.

Projects are added regularly and are meant to be:
- **Minimal**: Zero external dependencies where possible.
- **Experimental**: Testing limits and understanding internal mechanisms.
- **Learning-oriented**: Prioritizing "how it works" over "how fast I can build it."

*Nothing here is meant to be production-ready.*

---

## Projects

### 1. ZipCLI (Streaming File Compressor)
A simple command-line tool that compresses files using Gzip. This implementation manages the data flow manually to handle memory efficiency and backpressure.

* **Tech Stack:** Node.js (fs, zlib, streams)
* **Key Implementations:**
    * **Manual Backpressure:** Custom logic to pause/resume streams based on buffer limits (preventing Heap Out of Memory errors).
    * **Double-Sided Flow Control:** Handles backpressure on both the Input (Disk -> Gzip) and Output (Gzip -> Disk) sides.


### 2. MiniRedis (TCP Key-Value Store)

A lightweight, in-memory key-value store built on raw TCP sockets. This project mimics the core architecture of Redis by implementing the Redis Serialization Protocol (RESP) from scratch to handle client-server communication.

**Tech Stack:** Node.js (net, buffer, readline)
**Key Implementations:**

* **Custom RESP Protocol:** A manual implementation of a parser and encoder for RESP (Redis Serialization Protocol), handling data types like Arrays and Bulk Strings directly from raw bytes.
* **Raw TCP Server:** Uses `node:net` to manage persistent socket connections, avoiding higher-level HTTP abstractions.
* **Stream Buffering:** Implements custom buffering logic to handle TCP packet fragmentation (reassembling split messages) and coalescence (handling multiple messages in one chunk).
* **Custom CLI:** A dedicated command-line client that tokenizes input (handling quotes/spacing) and serializes commands before sending them to the server.
