/**
 * Minimal fake of the Web Audio API for tests (Bun has no Web Audio).
 *
 * It records every node created, every `AudioParam` automation call, every
 * `start`/`stop`, and the live connection graph, so tests can assert on what
 * was scheduled without producing sound.
 */

export type ParamCall = {
  method:
    | "setValueAtTime"
    | "linearRampToValueAtTime"
    | "exponentialRampToValueAtTime";
  value: number;
  time: number;
};

export type FakeAudioParam = {
  value: number;
  calls: ParamCall[];
  setValueAtTime(value: number, time: number): FakeAudioParam;
  linearRampToValueAtTime(value: number, time: number): FakeAudioParam;
  exponentialRampToValueAtTime(value: number, time: number): FakeAudioParam;
};

export type FakeNodeKind =
  | "oscillator"
  | "bufferSource"
  | "biquadFilter"
  | "gain"
  | "destination";

export type FakeAudioNode = {
  kind: FakeNodeKind;
  context: FakeAudioContext;
  connect(target: FakeAudioNode): FakeAudioNode;
  disconnect(): void;
  // Source nodes
  type?: string;
  frequency?: FakeAudioParam;
  Q?: FakeAudioParam;
  gain?: FakeAudioParam;
  buffer?: FakeAudioBuffer | null;
  loop?: boolean;
  startedAt?: number;
  stoppedAt?: number;
  start?(when?: number): void;
  stop?(when?: number): void;
  addEventListener?(
    type: string,
    listener: () => void,
    options?: {
      once?: boolean;
    },
  ): void;
  /** Test-only: fires the `ended` event as the real node would after `stop`. */
  end?(): void;
};

export type FakeAudioBuffer = {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
};

export type FakeAudioContext = {
  currentTime: number;
  sampleRate: number;
  destination: FakeAudioNode;
  nodes: FakeAudioNode[];
  buffers: FakeAudioBuffer[];
  /** Live edges `source -> target`. */
  connections: Set<
    [
      FakeAudioNode,
      FakeAudioNode,
    ]
  >;
  createOscillator(): FakeAudioNode;
  createBufferSource(): FakeAudioNode;
  createBiquadFilter(): FakeAudioNode;
  createGain(): FakeAudioNode;
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): FakeAudioBuffer;
  /** Nodes of a given kind, in creation order. */
  nodesOf(kind: FakeNodeKind): FakeAudioNode[];
  /** Fires `ended` on every started source node. */
  endAll(): void;
  /** Casts the fake to the real type expected by `src/`. */
  asReal(): AudioContext;
};

function createParam(value: number): FakeAudioParam {
  const param: FakeAudioParam = {
    calls: [],
    exponentialRampToValueAtTime(value, time) {
      param.calls.push({
        method: "exponentialRampToValueAtTime",
        time,
        value,
      });
      return param;
    },
    linearRampToValueAtTime(value, time) {
      param.calls.push({
        method: "linearRampToValueAtTime",
        time,
        value,
      });
      return param;
    },
    setValueAtTime(value, time) {
      param.calls.push({
        method: "setValueAtTime",
        time,
        value,
      });
      return param;
    },
    value,
  };
  return param;
}

/** Creates a fake `AudioContext`. Use `asReal()` to pass it to `src/`. */
export function createFakeAudioContext(
  options: { currentTime?: number; sampleRate?: number } = {},
): FakeAudioContext {
  const connections: FakeAudioContext["connections"] = new Set();

  function createNode(kind: FakeNodeKind): FakeAudioNode {
    const node: FakeAudioNode = {
      connect(target) {
        connections.add([
          node,
          target,
        ]);
        return target;
      },
      context: ctx,
      disconnect() {
        for (const edge of connections) {
          if (edge[0] === node) {
            connections.delete(edge);
          }
        }
      },
      kind,
    };
    if (kind !== "destination") {
      ctx.nodes.push(node);
    }
    return node;
  }

  function createSourceNode(kind: FakeNodeKind): FakeAudioNode {
    const node = createNode(kind);
    const listeners: (() => void)[] = [];
    node.start = (when = 0) => {
      node.startedAt = when;
    };
    node.stop = (when = 0) => {
      node.stoppedAt = when;
    };
    node.addEventListener = (type, listener) => {
      if (type === "ended") {
        listeners.push(listener);
      }
    };
    node.end = () => {
      for (const listener of listeners.splice(0)) {
        listener();
      }
    };
    return node;
  }

  const ctx: FakeAudioContext = {
    asReal() {
      return ctx as unknown as AudioContext;
    },
    buffers: [],
    connections,
    createBiquadFilter() {
      const node = createNode("biquadFilter");
      node.type = "lowpass";
      node.frequency = createParam(350);
      node.Q = createParam(1);
      return node;
    },
    createBuffer(numberOfChannels, length, sampleRate) {
      const channels = Array.from(
        {
          length: numberOfChannels,
        },
        () => new Float32Array(length),
      );
      const buffer: FakeAudioBuffer = {
        getChannelData(channel) {
          const data = channels[channel];
          if (data === undefined) {
            throw new RangeError(`No channel ${channel}`);
          }
          return data;
        },
        length,
        numberOfChannels,
        sampleRate,
      };
      ctx.buffers.push(buffer);
      return buffer;
    },
    createBufferSource() {
      const node = createSourceNode("bufferSource");
      node.buffer = null;
      node.loop = false;
      return node;
    },
    createGain() {
      const node = createNode("gain");
      node.gain = createParam(1);
      return node;
    },
    createOscillator() {
      const node = createSourceNode("oscillator");
      node.type = "sine";
      node.frequency = createParam(440);
      return node;
    },
    currentTime: options.currentTime ?? 0,
    destination: undefined as unknown as FakeAudioNode,
    endAll() {
      for (const node of ctx.nodes) {
        if (node.startedAt !== undefined) {
          node.end?.();
        }
      }
    },
    nodes: [],
    nodesOf(kind) {
      return ctx.nodes.filter((node) => node.kind === kind);
    },
    sampleRate: options.sampleRate ?? 48000,
  };
  ctx.destination = createNode("destination");
  return ctx;
}
