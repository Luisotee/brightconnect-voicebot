const FIXTURES = [
  { number: "415-555-0166", scenario: "No outage, line clean → router fault → escalation" },
  { number: "415-555-0182", scenario: "Active area outage with an ETA → resolved, no escalation" },
  { number: "415-555-0193", scenario: "Overdue balance, in contract → upgrade automated, downgrade escalates" },
  { number: "415-555-0100", scenario: "Forces a backend failure → demonstrates tool-failure recovery" },
];

export function FixtureHints() {
  return (
    <div className="w-full max-w-xs text-left">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Try one of these numbers</p>
      <ul className="flex flex-col gap-2">
        {FIXTURES.map((fixture) => (
          <li key={fixture.number} className="text-xs">
            <span className="font-mono font-medium text-foreground">{fixture.number}</span>
            <span className="text-muted-foreground"> — {fixture.scenario}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
