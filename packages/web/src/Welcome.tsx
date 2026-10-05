/** Shown on the Builder until it is dismissed, while the invented sample pack is in use: says what Muster is and how to get real data in. */
export function Welcome({ onWrite, onLoad, onDismiss }: { onWrite: () => void; onLoad: () => void; onDismiss: () => void }) {
  return (
    <section className="welcome" aria-label="Welcome">
      <h2>Welcome to Muster</h2>
      <p>
        You are using a small sample pack of invented units, so you can try everything. <strong>Muster ships no game data</strong>: the armies, units and
        rules come from a data pack. To use your own, write one in the app or load one from a file.
      </p>
      <div className="actions">
        <button className="primary" onClick={onWrite}>Write my own pack</button>
        <button onClick={onLoad}>Load a pack file</button>
        <button onClick={onDismiss}>Got it</button>
      </div>
    </section>
  );
}
