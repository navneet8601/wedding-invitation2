// Serves the song with byte-range support. Cloudflare's static assets always answer with the whole
// file (200), but iPhone Safari asks for audio in ranges (Range: bytes=0-1) and won't play a file
// whose server can't answer them with 206 Partial Content. Only /music/* runs through here
// (assets.run_worker_first in wrangler.jsonc); every other file is served as a plain static asset.
export default {
  async fetch(request, env) {
    const res = await env.ASSETS.fetch(request);
    const range = request.headers.get("Range");
    if (res.status !== 200) return res;
    if (!range) {
      const full = new Response(res.body, res);
      full.headers.set("Accept-Ranges", "bytes");
      return full;
    }
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) return res;
    const buf = await res.arrayBuffer();
    const size = buf.byteLength;
    let start, end;
    if (m[1] === "") {
      // The last N bytes ("bytes=-500").
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" } });
    }
    const headers = new Headers(res.headers);
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
    headers.set("Content-Length", String(end - start + 1));
    return new Response(buf.slice(start, end + 1), { status: 206, headers });
  },
};
