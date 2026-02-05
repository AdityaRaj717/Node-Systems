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
