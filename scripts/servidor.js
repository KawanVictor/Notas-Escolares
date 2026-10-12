// Servidor local para desenvolvimento: entrega os arquivos de public/ em http://localhost:8123.

import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PORTA = Number(process.env.PORT) || 8123;
const RAIZ = fileURLToPath(new URL("../public", import.meta.url));
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

createServer(async (pedido, resposta) => {
  const caminho = decodeURIComponent(new URL(pedido.url, "http://localhost").pathname);
  const arquivo = normalize(join(RAIZ, caminho.endsWith("/") ? `${caminho}index.html` : caminho));

  // Nada fora de public/ é entregue, mesmo que o endereço tente subir de pasta.
  if (arquivo !== RAIZ && !arquivo.startsWith(RAIZ + sep)) {
    resposta.writeHead(403).end("Acesso negado");
    return;
  }

  try {
    const conteudo = await readFile(arquivo);

    resposta.writeHead(200, {
      "Content-Type": TIPOS[extname(arquivo)] ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404).end("Não encontrado");
  }
}).listen(PORTA, "127.0.0.1", () => {
  console.log(`Site em http://localhost:${PORTA} (Ctrl+C para parar)`);
});
