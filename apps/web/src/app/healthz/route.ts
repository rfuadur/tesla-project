// GET /healthz: "is the web server up?", used by the Docker health check.
export function GET() {
  return Response.json({ status: 'ok' });
}
