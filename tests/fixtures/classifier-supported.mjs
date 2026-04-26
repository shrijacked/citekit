let input = '';

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
});
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const span = request.evidence[0];

  process.stdout.write(
    JSON.stringify({
      verdict: 'supported',
      confidence: 0.91,
      supportingSpanIds: span ? [span.id] : [],
      message: 'The external classifier selected a retrieved span.'
    })
  );
});
