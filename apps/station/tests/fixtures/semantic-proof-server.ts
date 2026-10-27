import proof from "./semantic-proof.html";
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 3025,
  development: false,
  routes: { "/": proof },
});
console.log(`Semantic adapter proof: ${server.url}`);
