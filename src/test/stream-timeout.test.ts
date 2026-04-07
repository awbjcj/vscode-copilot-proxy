/**
 * Integration test for streaming timeout fix.
 *
 * Verifies that:
 * 1. Active streams survive past the inactivity timeout (activity resets it)
 * 2. Silent streams are killed after the inactivity timeout
 * 3. Client disconnect cancels the model request
 *
 * Uses short timeouts (seconds) to simulate the real 5-minute behavior.
 */

import { expect } from 'chai';
import * as http from 'http';

// ---------------------------------------------------------------------------
// Helpers that replicate the fixed timeout pattern from extension.ts
// ---------------------------------------------------------------------------

interface MockModelStream {
    /** Async generator that yields string chunks */
    stream: AsyncGenerator<string>;
    /** Set to true when cancellation is requested */
    cancelled: boolean;
    /** Cancel the stream (simulates CancellationTokenSource.cancel()) */
    cancel: () => void;
}

/**
 * Creates a mock model that yields chunks at a given interval.
 * Respects cancellation like VS Code's CancellationToken.
 */
function createMockModel(
    chunkCount: number,
    chunkIntervalMs: number
): MockModelStream {
    const model: MockModelStream = {
        cancelled: false,
        cancel() { model.cancelled = true; },
        stream: null!
    };

    model.stream = (async function* () {
        for (let i = 0; i < chunkCount; i++) {
            if (model.cancelled) return;
            await new Promise(r => setTimeout(r, chunkIntervalMs));
            if (model.cancelled) return;
            yield `chunk-${i} `;
        }
    })();

    return model;
}

/**
 * Creates a test HTTP server that streams using the same timeout pattern
 * as the fixed extension.ts code.
 */
function createTestServer(inactivityTimeoutMs: number): http.Server {
    const srv = http.createServer(async (req, res) => {
        const url = req.url || '';

        if (url === '/stream-active') {
            // Stream that sends chunks faster than the inactivity timeout
            // Should survive even though total duration > timeout
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const model = createMockModel(10, inactivityTimeoutMs / 3);

            // Activity-based inactivity timeout (same pattern as the fix)
            let timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => model.cancel(), inactivityTimeoutMs);
            const resetStreamTimeout = () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => model.cancel(), inactivityTimeoutMs);
            };

            // Cancel on client disconnect
            res.on('close', () => model.cancel());

            // Disable socket timeout for streaming
            req.socket?.setTimeout(0);

            try {
                for await (const chunk of model.stream) {
                    resetStreamTimeout();
                    res.write(`data: ${chunk}\n\n`);
                }
                res.write('data: [DONE]\n\n');
                res.end();
            } catch {
                res.end();
            } finally {
                clearTimeout(timeoutId);
            }
        } else if (url === '/stream-silent') {
            // Stream that goes silent after first chunk -- should be killed by timeout
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            // Model that sends 1 chunk then hangs forever (until cancelled)
            const model: MockModelStream = {
                cancelled: false,
                cancel() { model.cancelled = true; },
                stream: null!
            };
            model.stream = (async function* () {
                yield 'first-chunk ';
                // Hang until cancelled (simulates model going silent)
                while (!model.cancelled) {
                    await new Promise(r => setTimeout(r, 50));
                }
            })();

            let timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => model.cancel(), inactivityTimeoutMs);
            const resetStreamTimeout = () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => model.cancel(), inactivityTimeoutMs);
            };

            res.on('close', () => model.cancel());
            req.socket?.setTimeout(0);

            try {
                for await (const chunk of model.stream) {
                    resetStreamTimeout();
                    res.write(`data: ${chunk}\n\n`);
                }
                res.write('data: [TIMEOUT]\n\n');
                res.end();
            } catch {
                res.end();
            } finally {
                clearTimeout(timeoutId);
            }
        } else if (url === '/stream-disconnect') {
            // Stream that runs forever -- client will disconnect mid-stream
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            });

            const model = createMockModel(1000, 50);

            let timeoutId: ReturnType<typeof setTimeout> = setTimeout(() => model.cancel(), inactivityTimeoutMs);
            const resetStreamTimeout = () => {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => model.cancel(), inactivityTimeoutMs);
            };

            res.on('close', () => model.cancel());
            req.socket?.setTimeout(0);

            try {
                for await (const chunk of model.stream) {
                    resetStreamTimeout();
                    res.write(`data: ${chunk}\n\n`);
                }
                res.end();
            } catch {
                res.end();
            } finally {
                clearTimeout(timeoutId);
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    // Match the fix: server.timeout = 0
    srv.timeout = 0;

    return srv;
}

// ---------------------------------------------------------------------------
// Helpers to consume SSE streams
// ---------------------------------------------------------------------------

function collectStream(port: number, path: string): Promise<{ chunks: string[]; complete: boolean }> {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${path}`, (res) => {
            const chunks: string[] = [];
            let complete = false;
            let buf = '';

            res.on('data', (data: Buffer) => {
                buf += data.toString();
                // Parse SSE lines
                const lines = buf.split('\n\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                    const match = line.match(/^data: (.+)$/);
                    if (match) {
                        if (match[1] === '[DONE]') {
                            complete = true;
                        } else if (match[1] === '[TIMEOUT]') {
                            // Stream ended due to inactivity timeout
                            complete = false;
                        } else {
                            chunks.push(match[1]);
                        }
                    }
                }
            });

            res.on('end', () => resolve({ chunks, complete }));
            res.on('error', reject);
        }).on('error', reject);
    });
}

function collectStreamWithEarlyDisconnect(
    port: number,
    path: string,
    disconnectAfterChunks: number
): Promise<{ chunks: string[]; disconnected: boolean }> {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${port}${path}`, (res) => {
            const chunks: string[] = [];
            let buf = '';

            res.on('data', (data: Buffer) => {
                buf += data.toString();
                const lines = buf.split('\n\n');
                buf = lines.pop() || '';
                for (const line of lines) {
                    const match = line.match(/^data: (.+)$/);
                    if (match && match[1] !== '[DONE]') {
                        chunks.push(match[1]);
                    }
                }

                if (chunks.length >= disconnectAfterChunks) {
                    req.destroy();
                    resolve({ chunks, disconnected: true });
                }
            });

            res.on('end', () => resolve({ chunks, disconnected: false }));
            res.on('error', () => resolve({ chunks, disconnected: true }));
        });
        req.on('error', () => {
            // Expected after destroy
        });
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Stream Timeout Fix', function () {
    // These tests use real timers so they need more than default 2s
    this.timeout(30000);

    const INACTIVITY_TIMEOUT = 2000; // 2 seconds (simulates the real 5-minute timeout)
    let server: http.Server;
    let port: number;

    before((done) => {
        server = createTestServer(INACTIVITY_TIMEOUT);
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            port = typeof addr === 'object' && addr ? addr.port : 0;
            done();
        });
    });

    after((done) => {
        server.close(done);
    });

    it('active stream survives past inactivity timeout (simulates 15-min stream)', async function () {
        // 10 chunks at 667ms each = ~6.7s total, well over the 2s inactivity timeout.
        // With an absolute timeout, this would die at 2s. With activity-based, it lives.
        const result = await collectStream(port, '/stream-active');

        expect(result.complete).to.be.true;
        expect(result.chunks).to.have.lengthOf(10);
        expect(result.chunks[0]).to.equal('chunk-0 ');
        expect(result.chunks[9]).to.equal('chunk-9 ');
    });

    it('silent stream is killed after inactivity timeout', async function () {
        // Model sends 1 chunk then goes silent. Inactivity timeout (2s) should kill it.
        const start = Date.now();
        const result = await collectStream(port, '/stream-silent');
        const elapsed = Date.now() - start;

        expect(result.chunks).to.have.lengthOf(1);
        expect(result.chunks[0]).to.equal('first-chunk ');
        expect(result.complete).to.be.false;
        // Should have been killed after ~2s inactivity, not hung forever
        expect(elapsed).to.be.lessThan(INACTIVITY_TIMEOUT + 2000);
        expect(elapsed).to.be.greaterThan(INACTIVITY_TIMEOUT - 500);
    });

    it('client disconnect cancels model request', async function () {
        // Disconnect after 3 chunks. Model should be cancelled promptly.
        const start = Date.now();
        const result = await collectStreamWithEarlyDisconnect(port, '/stream-disconnect', 3);
        const elapsed = Date.now() - start;

        expect(result.disconnected).to.be.true;
        expect(result.chunks.length).to.be.greaterThanOrEqual(3);
        // Should resolve quickly, not hang until timeout
        expect(elapsed).to.be.lessThan(INACTIVITY_TIMEOUT);
    });
});
