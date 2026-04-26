process.stdin.resume();
process.stdin.on('end', () => {
  process.stdout.write(
    JSON.stringify({
      verdict: 'supported',
      confidence: 0.99,
      supportingSpanIds: ['invented-span'],
      message: 'This classifier tried to cite evidence CiteKit did not retrieve.'
    })
  );
});
