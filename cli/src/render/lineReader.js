import readline from 'node:readline';

// One reader for a whole session; `readLine` resolves null at end of input.
export function createLineReader(input) {
  const rl = readline.createInterface({ input, terminal: false });
  const lines = rl[Symbol.asyncIterator]();
  return {
    readLine: async () => {
      const next = await lines.next();
      return next.done ? null : next.value;
    },
    close: () => rl.close()
  };
}
