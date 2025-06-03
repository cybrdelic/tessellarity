**Ticket:** Implement Runtime Shader Introspection System with Log File Integration

---

### **Summary**

Build a **runtime introspection pipeline** in our WebGPU engine so shaders can emit debug/metrics data into a GPU buffer, then have the CPU read, serialize to one or more log files, and clear/rotate them—**enabling Copilot-driven agents to consume fresh insights** in real time.

---

### **Description**

We need a closed-loop system where WGSL shaders write “breadcrumbs” (e.g., performance counters, event triggers, intermediate vectors) into a **storage buffer**. The CPU code will then:

1. **Copy** that buffer to a readback buffer (double-buffered to avoid stalls).
2. **Map & parse** the readback data per frame (or at configurable intervals).
3. **Serialize** each valid slot to JSON lines, appending to `shader_log.jsonl` (or split into multiple files by category).
4. **Rotate/truncate** logs so Copilot agents can tail a fresh file.
5. **Feed** Copilot responses back into the pipeline (via a separate file, e.g. `copilot_suggestions.jsonl`).

This will let us automatically tune shaders and diagnose issues using AI-assisted agents.

---

### **Scope & Goals**

* **Define Introspection Schema**:

  * WGSL `IntrospectSlot { frameNumber: u32; pingValue: f32; eventCount: u32; pad: u32; dataValue: vec3<f32>; }` (aligned to 32 bytes).
  * Ability to log multiple categories (e.g. perf, error, debug) by adding a `category: u32` field if needed.

* **GPU-Side Buffer Setup**:

  * **`introspectBuffer`**: STORAGE usage, holds N slots (e.g. 1024 × 32 bytes).
  * **`readbackBuffer`**: COPY\_DST | MAP\_READ, same size, double-buffered.

* **WGSL Shader Integration**:

  * Uniform `frameUniform: u32` and optional `eventUniform: u32`.
  * `logSomething(...)` function to compute `slotIndex = frameUniform % NUM_SLOTS`, write into `introspectBuffer[slotIndex]`.
  * Write metrics (ping, event flags, data vectors) at key points in compute/fragment passes.

* **CPU-Side Pipeline (TypeScript / Node.js)**:

  1. **Upload uniform** buffers (frame number, event flags).

  2. **Encode GPU pass** (dispatch compute or render) with `introspectBindGroup`.

  3. **Copy** `introspectBuffer → readbackBuffer[current]`.

  4. **Submit** command encoder.

  5. **Flush** the *previous* readback buffer:

     * `mapAsync(MAP_READ)`, `getMappedRange()`, parse every 32 bytes slot:

       * `slotFrame = dv.getUint32(offset, true)`
       * `ping = dv.getFloat32(offset+4, true)`
       * `eventCount = dv.getUint32(offset+8, true)`
       * `dx, dy, dz = dv.getFloat32(offset+16/20/24, true)`
     * If `slotFrame > lastFlushFrame`, serialize to JSON line:

       ```json
       { "frame": slotFrame, "ping": ping, "events": eventCount, "data": [dx, dy, dz] }
       ```
     * Append lines to `shader_log.jsonl` (or split by category into multiple files).
     * (Optional) `fs.truncate("shader_log.jsonl", 0)` to keep only fresh data.
     * `unmap()` buffer.

  6. **Clear** the used slot in `introspectBuffer` by copying zeros (use a staging buffer with a single 32-byte zero chunk, then `copyBufferToBuffer` at `offset = slotIndex × 32`).

  7. **Loop** at 60 FPS (or headless Node schedule), using double-buffering to avoid GPU/CPU stalls:

     * On frame N: write to introBuffer, copy to readback\[N%2].
     * In parallel, read from readback\[(N-1)%2] and flush logs.

* **Log Management & Rotation**:

  * **Rotate on size/time**: If `shader_log.jsonl` > X MB or > Y lines, rename to `shader_log_<timestamp>.jsonl`, create new empty.
  * **In-place Truncate**: After flush, `await fs.truncate("shader_log.jsonl", 0)` so file watchers see reset.
  * **Category-Based Files**: If using `category` field, split lines into `perf_log.jsonl`, `error_log.jsonl`, `debug_log.jsonl`, etc.

* **Copilot Agent Integration**:

  * Agent watches `shader_log.jsonl` (or rotated files) via `chokidar` or `fs.watchFile`.
  * On new lines, parse JSON, generate prompt for Copilot:

    > “Frame 42: ping=0.037 ms, eventCount=1, data=\[0.5,0.2,-0.1]. Recommend shader tweak to reduce ping.”
  * Agent writes response to `copilot_suggestions.jsonl`.
  * Main loop watches `copilot_suggestions.jsonl`, reads latest entry, calls `applySuggestionToPipeline(...)` (e.g., adjust dispatch size, tweak constants, log new uniforms).

---

### **Acceptance Criteria**

1. **IntrospectBuffer & ReadbackBuffer**:

   * A GPU storage buffer and readback buffer are allocated correctly (32 KiB if 1024 slots).
   * Double-buffered readback works without stalling GPU pipeline (verify with CPU/GPU timeline).

2. **WGSL Logging**:

   * Shader writes into the correct slot index each frame.
   * Sample compute pass logs `frameNumber`, `pingValue = abs(sin(frame*0.01))`, `eventCount`, `dataValue = vec3(globalInvocationID.xy,0)`.

3. **CPU Flush Logic**:

   * After N frames, `shader_log.jsonl` contains valid JSON lines for each logged slot.
   * File truncation or rotation occurs per policy (size/time).
   * No GPU/CPU sync stalls longer than one frame (no hitch in 60 FPS loop).

4. **Log Parsing & Category Splitting (if implemented)**:

   * `perf_log.jsonl`, `error_log.jsonl`, etc., receive only relevant category lines.
   * Copilot agent can read lines and output suggestions.

5. **Copilot Feedback Loop**:

   * Modifications from `copilot_suggestions.jsonl` can be picked up by main loop and applied (e.g., updating uniform values).
   * Demonstrate one example: agent suggests changing a constant; pipeline picks it up and shader behavior changes accordingly.

6. **Robustness & Error Handling**:

   * If `mapAsync()` or `appendFile()` fails, main loop logs an error to console but continues running.
   * If `shader_log.jsonl` is being rotated while agent reads it, no data loss or crash.
   * Unit tests:

     * Simulate writing into buffer, flushing, and confirm file contents.
     * Simulate rotation/truncate and ensure watcher picks up new data.

---

### **Tasks**

1. **Define & Document IntrospectSlot (WGSL)**

   * Create `shader_introspect.wgsl` with `IntrospectSlot` struct, add `category` field if desired.
   * Add comments about alignment (32 bytes).
   * Write a test compute pass that calls `logSomething(...)`.

2. **Buffer Allocation & Bind Group (TS)**

   * In `main.ts`, implement `createBuffer(introspectBuffer)`, `createBuffer(readbackBuffer1)`, `createBuffer(readbackBuffer2)`.
   * Create uniform buffers for `frameUniform` and `eventUniform`.
   * Set up `BindGroupLayout` & `ComputePipeline` to include storage + uniforms.

3. **Double-Buffered Copy Logic**

   * Write code to `copyBufferToBuffer(introspectBuffer → readback[currentReadback])`.
   * Flip `currentReadback` each frame.
   * On previous buffer, call `readbackBuffer.mapAsync() → parse → appendFile() → unmap()`.

4. **Slot Clearing**

   * Create a 32-byte zero staging buffer.
   * Each frame clear only `slotIndex = (frame-1) % NUM_SLOTS` in `introspectBuffer` via `copyBufferToBuffer(staging, 0, introspectBuffer, clearOffset, 32)`.

5. **Log File Management**

   * Implement function `flushToLog()` that:

     * Maps & parses buffer slots > `lastFlushFrame`.
     * Serializes lines to JSONL.
     * Appends to `shader_log.jsonl`.
     * Rotates/truncates according to policy (configurable thresholds).
   * Ensure atomic writes (write to `.tmp` + `rename` or use `fs.truncate()`).

6. **Copilot Agent Stub**

   * Create `agent.ts` that watches `shader_log.jsonl` with `chokidar`.
   * On change, read new lines, call a mock Copilot API (or just stub `handleIntrospectionEntry()`).
   * Write a sample response into `copilot_suggestions.jsonl`.

7. **Main Loop Integration**

   * Modify render loop to watch `copilot_suggestions.jsonl`.
   * On new Copilot entry, `applySuggestionToPipeline()`: update uniform or constant buffer.
   * Demonstrate a simple constant tweak (e.g., adjust `workgroup_count_x` from 1→2).

8. **Testing & Validation**

   * Write unit tests (Jest or Mocha) to:

     * Validate buffer allocation size & alignment (e.g., readbackBuffer has size = 1024 × 32).
     * Simulate mapping readback buffer with dummy data (fill a buffer with one slot’s bytes), confirm parse yields correct JSON.
     * Test log rotation/truncation: after writing > threshold lines, file is renamed and new file is empty.

9. **Documentation Updates**

   * Add a section in `docs/SIMULATION_INTEGRATION_GUIDE.md` on introspection system (schema, TS setup, log format).
   * Update `docs/API_REFERENCE.md` with TS functions: `flushToLog()`, `applySuggestionToPipeline()`, `rotateLogs()`.
   * Add a snippet of the WGSL `IntrospectSlot` struct in `docs/WGSL_SHADERS.md`.

---

### **Notes / Considerations**

* **Alignment rules**: WGSL arrays align each element to 16 bytes. Concrete slot = 32 bytes to hold `vec3<f32>` (16 bytes padded) + other fields.
* **Performance trade-offs**: Mapping large buffers every frame stalls GPU; thus, use double-buffering or flush every N frames.
* **File I/O overhead**: Consider using memory-mapped files for very high-frequency flushes.
* **Error resilience**: Wrap every `mapAsync()` and `fs.appendFile()` in `try/catch`. Log errors but don’t crash render loop.
* **Atomic file operations**: Use `fs.rename()` for rotating logs to avoid partial reads by the agent.

---

### **Acceptance Criteria Checklist**

* [ ] **IntrospectSlot** defined and aligned correctly in WGSL.
* [ ] GPU storage + readback buffers created, double-buffering implemented.
* [ ] Shader writes metrics into `introspectBuffer` each frame.
* [ ] CPU reads back previous buffer, parses valid slots, appends JSONL lines.
* [ ] Log rotation/truncate policy works without data loss.
* [ ] Copilot agent stub can read logs and write suggestions.
* [ ] Main loop reads suggestions and applies to shader pipeline.
* [ ] Unit tests cover buffer parsing and log management.
* [ ] Documentation updated with introspection design and code snippets.

---

**Priority:** High
**Estimate:** 5 – 7 days of effort (including testing & documentation)
**Assignee:** *(leave empty or assign to relevant dev)*
**Labels:** `feature`, `WebGPU`, `shader-introspection`, `logging`, `Copilot-integration`

---

**Notes:**

* This ticket turns our engine into a **self-aware**, AI-assisted system. If implemented rigorously, we can have Copilot suggest real-time performance tweaks, spot shader errors immediately, and evolve shader parameters automatically.
* Keep the code DRY by centralizing introspection logic in a helper class (`ShaderIntrospector`), so new sims (Ocean, Boids, Waves) can all use the same buffer & logging pipeline.
* Avoid “stale docs” by updating `docs/…` in the same PR.
* Once basic flushing is stable, spin off a follow-up ticket to refine log rotation thresholds and agent prompts.

---

*End of Ticket*
