import page from "./index.html";
const server=Bun.serve({hostname:"127.0.0.1",port:Number(process.env.PORT||3002),routes:{"/":page}});
console.log(`Station site: ${server.url}`);
